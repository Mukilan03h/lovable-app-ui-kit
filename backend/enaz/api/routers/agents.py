"""Agents: CRUD, streamed runs, and the approval queue for side-effect actions."""

from __future__ import annotations

import json
import time
from typing import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ...db import new_uuid
from ...security import acl_key
from ...services import Services
from ..deps import Principal, audit, get_services, require

router = APIRouter(prefix="/api", tags=["agents"])


@router.get("/agents")
async def list_agents(principal: Principal = Depends(require("agents")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch(
            """SELECT a.id, a.name, a.description, a.tools, a.trigger, a.output, a.enabled,
                      u.name AS owner, extract(epoch FROM a.last_run) AS last_run,
                      (SELECT count(*) FROM agent_runs r WHERE r.agent_id = a.id) AS runs,
                      (SELECT count(*) FROM agent_runs r WHERE r.agent_id = a.id AND r.status='succeeded') AS ok
               FROM agents a LEFT JOIN users u ON u.id = a.owner_id ORDER BY a.created_at"""
        )
    agents = []
    for r in rows:
        runs = r["runs"] or 0
        agents.append({
            "id": str(r["id"]), "name": r["name"], "description": r["description"],
            "tools": _load(r["tools"]), "trigger": r["trigger"], "output": r["output"],
            "enabled": r["enabled"], "owner": r["owner"] or "Enaz", "runs": runs,
            "success": round(100 * (r["ok"] or 0) / runs) if runs else 100, "lastRun": r["last_run"],
        })
    return {"agents": agents}


@router.get("/agents/catalog")
async def agent_catalog(principal: Principal = Depends(require("agents")), svc: Services = Depends(get_services)) -> dict:
    """Discoverable, approved agents with owner, required access, measured success
    and estimated operating cost (average cost per run)."""
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch(
            """SELECT a.id, a.name, a.description, a.tools, a.sources, a.output, a.enabled, a.published,
                      u.name AS owner,
                      (SELECT count(*) FROM agent_runs r WHERE r.agent_id=a.id) AS runs,
                      (SELECT count(*) FROM agent_runs r WHERE r.agent_id=a.id AND r.status='succeeded') AS ok,
                      (SELECT avg(r.cost) FROM agent_runs r WHERE r.agent_id=a.id AND r.cost > 0) AS avg_cost
               FROM agents a LEFT JOIN users u ON u.id=a.owner_id
               WHERE a.published = true ORDER BY a.name""",
        )
    out = []
    for r in rows:
        runs = r["runs"] or 0
        out.append({
            "id": str(r["id"]), "name": r["name"], "description": r["description"],
            "requiredAccess": _load(r["sources"]), "tools": _load(r["tools"]), "output": r["output"],
            "owner": r["owner"] or "Enaz", "enabled": r["enabled"],
            "runs": runs, "successRate": round(100 * (r["ok"] or 0) / runs) if runs else None,
            "estimatedCostPerRun": round(float(r["avg_cost"]), 6) if r["avg_cost"] else None,
        })
    return {"agents": out}


class PublishBody(BaseModel):
    published: bool = True


@router.post("/agents/{agent_id}/publish")
async def publish_agent(agent_id: str, body: PublishBody, principal: Principal = Depends(require("agents")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute("UPDATE agents SET published=$2 WHERE id=$1", agent_id, body.published)
    await audit(svc, principal, "agent.publish" if body.published else "agent.unpublish", agent_id)
    return {"ok": True, "published": body.published}


class CreateAgent(BaseModel):
    name: str
    description: str = ""
    instructions: str = "Use only sources the requester can access. Cite every claim."
    tools: list[str] = []
    sources: list[str] = []
    trigger: str = "manual"
    output: str = "answer"


@router.post("/agents")
async def create_agent(body: CreateAgent, principal: Principal = Depends(require("agents")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        aid = await conn.fetchval(
            "INSERT INTO agents (tenant_id,name,description,instructions,tools,sources,trigger,output,owner_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
            principal.tenant_id, body.name, body.description, body.instructions,
            json.dumps(body.tools), json.dumps(body.sources), body.trigger, body.output, principal.user.id,
        )
    await audit(svc, principal, "agent.create", body.name)
    return {"id": str(aid)}


class RunRequest(BaseModel):
    task: str | None = None


@router.post("/agents/{agent_id}/run")
async def run_agent(agent_id: str, body: RunRequest, principal: Principal = Depends(require("agents")), svc: Services = Depends(get_services)) -> StreamingResponse:
    async with svc.db.acquire(principal.tenant_id) as conn:
        agent = await conn.fetchrow("SELECT * FROM agents WHERE id = $1", agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    # Stage 1 enforcement: a disabled agent cannot run.
    if not agent["enabled"]:
        raise HTTPException(409, "This agent is disabled")

    task = body.task or f"Run the '{agent['name']}' task: {agent['description']}"
    output = agent["output"]
    wants_artifact = output if output in ("slides", "doc", "sheet") else None
    principals = principal.principals
    tenant_id = principal.tenant_id
    user_id = principal.user.id
    # The agent's own saved instructions and source scope are enforced server-side.
    # Source scope is a restriction layered on top of the requester's ACL — retrieval
    # already intersects with what this user may read, so the effective scope is the
    # intersection of the two and an agent can never widen a user's access.
    instructions = agent["instructions"] or ""
    agent_sources = _load(agent["sources"]) if agent["sources"] is not None else []
    run_sources = [s for s in agent_sources if isinstance(s, str)] or None
    allowed_tools = {t.lower() for t in _load(agent["tools"])}

    async def stream() -> AsyncIterator[bytes]:
        run_id = new_uuid()
        started = time.time()
        async with svc.db.acquire(tenant_id) as conn:
            await conn.execute(
                "INSERT INTO agent_runs (id,tenant_id,agent_id,user_id,status) VALUES ($1,$2,$3,$4,'running')",
                run_id, tenant_id, agent_id, user_id,
            )
        yield _ev({"type": "step", "tool": "plan", "label": f"Running {agent['name']}", "detail": agent["trigger"]})
        cost = 0.0
        status = "succeeded"
        try:
            if run_sources:
                yield _ev({"type": "step", "tool": "plan", "label": "Scoped to agent sources",
                           "detail": ", ".join(run_sources)})
            async for event in svc.answers.answer(
                tenant_id, principals, acl_key(principals), task,
                mode="research", user_id=user_id, wants_artifact=wants_artifact, allow_cache=False,
                sources=run_sources, extra_instructions=instructions,
            ):
                if event.get("type") == "done":
                    cost = event.get("cost", 0.0)
                yield _ev(event)
            # Side-effect agents stop at an approval instead of acting — and only for a
            # tool the agent is actually granted. A side-effect tool NOT in the agent's
            # allowlist is denied server-side rather than silently used.
            SIDE_EFFECT = {"slack", "jira", "salesforce", "email", "zendesk"}
            granted_side_effects = [t for t in allowed_tools if t in SIDE_EFFECT]
            if granted_side_effects and output == "answer":
                tool = granted_side_effects[0]
                approval_id = new_uuid()
                async with svc.db.acquire(tenant_id) as conn:
                    await conn.execute(
                        "INSERT INTO approvals (id,tenant_id,run_id,user_id,tool,args) VALUES ($1,$2,$3,$4,$5,$6)",
                        approval_id, tenant_id, run_id, user_id, tool, json.dumps({"summary": task}),
                    )
                yield _ev({"type": "approval", "approvalId": approval_id, "tool": tool})
                status = "needs_approval"
        except Exception as exc:  # noqa: BLE001
            status = "failed"
            yield _ev({"type": "error", "message": str(exc)})
        async with svc.db.acquire(tenant_id) as conn:
            await conn.execute(
                "UPDATE agent_runs SET status=$2, cost=$3, finished_at=now() WHERE id=$1", run_id, status, cost
            )
            await conn.execute("UPDATE agents SET last_run=now() WHERE id=$1", agent_id)
        yield b'data: {"type": "end"}\n\n'

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


class TestRequest(BaseModel):
    task: str | None = None


@router.post("/agents/{agent_id}/test")
async def test_agent(agent_id: str, body: TestRequest, principal: Principal = Depends(require("agents")), svc: Services = Depends(get_services)) -> dict:
    """Dry-run an agent: show the sources it reached, the tools and changes it
    WOULD propose, and whether it followed its scope — without creating approvals
    or executing any side effect. Side-effect tools are marked as not verified
    against a live integration."""
    async with svc.db.acquire(principal.tenant_id) as conn:
        agent = await conn.fetchrow("SELECT * FROM agents WHERE id = $1", agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")

    task = body.task or f"Run the '{agent['name']}' task: {agent['description']}"
    instructions = agent["instructions"] or ""
    agent_sources = [s for s in _load(agent["sources"]) if isinstance(s, str)]
    allowed_tools = [t for t in _load(agent["tools"])]
    output = agent["output"]
    wants_artifact = output if output in ("slides", "doc", "sheet") else None

    sources_seen: list[dict] = []
    answer_text = ""
    cost = 0.0
    async for event in svc.answers.answer(
        principal.tenant_id, principal.principals, acl_key(principal.principals), task,
        mode="research", user_id=principal.user.id, wants_artifact=wants_artifact, allow_cache=False,
        sources=agent_sources or None, extra_instructions=instructions,
    ):
        t = event.get("type")
        if t == "sources":
            sources_seen = event.get("sources", [])
        elif t == "answer":
            answer_text = event.get("text", "")
        elif t == "done":
            cost = event.get("cost", 0.0)

    SIDE_EFFECT = {"slack", "jira", "salesforce", "email", "zendesk"}
    proposed_tools = [
        {"tool": t, "wouldCall": t.lower() in SIDE_EFFECT and output == "answer",
         "verifiedAgainstLive": False}
        for t in allowed_tools
    ]
    source_types = sorted({s.get("source") for s in sources_seen if s.get("source")})
    # Instruction adherence: when the agent is source-scoped, every source it
    # reached must be inside that scope; and it must have produced an answer.
    within_scope = (not agent_sources) or all(s in agent_sources for s in source_types)
    followed = {
        "producedAnswer": bool(answer_text),
        "stayedWithinSourceScope": within_scope,
        "scope": agent_sources or "all sources the requester can read",
    }
    return {
        "agent": agent["name"], "task": task,
        "sourcesAccessed": source_types,
        "sampleAnswer": answer_text[:600],
        "proposedTools": proposed_tools,
        "proposedChanges": [{"tool": p["tool"], "summary": task} for p in proposed_tools if p["wouldCall"]],
        "followedInstructions": followed,
        "estimatedCost": cost,
        "note": "Dry run: read-only. No approvals created and no side effects executed. "
                "Side-effect tools are not verified against a live integration here. "
                "Version comparison requires agent versioning (planned).",
    }


class JobRequest(BaseModel):
    task: str | None = None
    budget: float = 0.0
    idempotencyKey: str | None = None


@router.post("/agents/{agent_id}/jobs")
async def enqueue_job(agent_id: str, body: JobRequest, principal: Principal = Depends(require("agents")), svc: Services = Depends(get_services)) -> dict:
    """Start a DURABLE run: it survives the chat closing and worker restarts. The
    background worker picks it up; poll /api/jobs/{id} for status and events."""
    from ...run_engine import enqueue

    async with svc.db.acquire(principal.tenant_id) as conn:
        agent = await conn.fetchrow("SELECT enabled FROM agents WHERE id=$1", agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    if not agent["enabled"]:
        raise HTTPException(409, "This agent is disabled")
    job_id = await enqueue(svc, principal.tenant_id, agent_id, principal.user.id,
                           body.task or "", idempotency_key=body.idempotencyKey, budget=body.budget)
    await audit(svc, principal, "job.enqueue", agent_id)
    return {"jobId": job_id, "status": "queued"}


@router.get("/jobs")
async def list_jobs(principal: Principal = Depends(require("agents")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch(
            """SELECT j.id, j.status, j.task, j.cost, j.error, a.name AS agent,
                      extract(epoch FROM j.created_at) AS created_at,
                      extract(epoch FROM j.finished_at) AS finished_at
               FROM agent_jobs j LEFT JOIN agents a ON a.id = j.agent_id
               WHERE j.user_id = $1 ORDER BY j.created_at DESC LIMIT 50""",
            principal.user.id,
        )
    return {"jobs": [
        {"id": str(r["id"]), "status": r["status"], "task": r["task"], "agent": r["agent"],
         "cost": r["cost"], "error": r["error"], "createdAt": r["created_at"], "finishedAt": r["finished_at"]}
        for r in rows
    ]}


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, after: int = 0, principal: Principal = Depends(require("agents")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        job = await conn.fetchrow(
            """SELECT j.id, j.status, j.task, j.cost, j.error, j.result, a.name AS agent,
                      extract(epoch FROM j.created_at) AS created_at, extract(epoch FROM j.finished_at) AS finished_at
               FROM agent_jobs j LEFT JOIN agents a ON a.id = j.agent_id WHERE j.id = $1""",
            job_id,
        )
        if not job:
            raise HTTPException(404, "Job not found")
        events = await conn.fetch(
            "SELECT seq, event FROM agent_job_events WHERE job_id=$1 AND seq > $2 ORDER BY seq LIMIT 500",
            job_id, after,
        )
        receipts = await conn.fetch(
            "SELECT action_id, step, tool, status, extract(epoch FROM created_at) AS created_at FROM agent_receipts WHERE job_id=$1 ORDER BY created_at",
            job_id,
        )
    return {
        "id": str(job["id"]), "status": job["status"], "task": job["task"], "agent": job["agent"],
        "cost": job["cost"], "error": job["error"], "result": _load(job["result"]),
        "createdAt": job["created_at"], "finishedAt": job["finished_at"],
        "events": [{"seq": e["seq"], **_load(e["event"])} for e in events],
        "receipts": [{"actionId": r["action_id"], "step": r["step"], "tool": r["tool"],
                      "status": r["status"], "createdAt": r["created_at"]} for r in receipts],
    }


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str, principal: Principal = Depends(require("agents")), svc: Services = Depends(get_services)) -> dict:
    from ...run_engine import request_cancel

    status = await request_cancel(svc, principal.tenant_id, job_id)
    return {"ok": True, "status": status}


@router.get("/approvals")
async def approvals(principal: Principal = Depends(require("agents")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch(
            "SELECT id, tool, args, status, extract(epoch FROM created_at) AS created_at FROM approvals WHERE status='pending' ORDER BY created_at DESC LIMIT 50"
        )
    return {"approvals": [{"id": str(r["id"]), "tool": r["tool"], "args": _load(r["args"]),
                           "status": r["status"], "createdAt": r["created_at"]} for r in rows]}


class DecideRequest(BaseModel):
    decision: str  # approve | deny
    args: dict | None = None  # edited action arguments; editing invalidates the proposed version


@router.post("/approvals/{approval_id}")
async def decide(approval_id: str, body: DecideRequest, principal: Principal = Depends(require("agents")), svc: Services = Depends(get_services)) -> dict:
    from ...run_engine import resume_after_decision

    status = "approved" if body.decision == "approve" else "denied"
    async with svc.db.acquire(principal.tenant_id) as conn:
        row = await conn.fetchrow(
            "UPDATE approvals SET status=$2, decided_at=now() WHERE id=$1 RETURNING args", approval_id, status,
        )
    await audit(svc, principal, f"approval.{status}", approval_id)
    # If this approval parks a durable job, resume it — executing the approved
    # (possibly edited) action, or finishing without it on denial.
    job_status = None
    if row:
        job_id = _load(row["args"]).get("jobId")
        if job_id:
            job_status = await resume_after_decision(
                svc, principal.tenant_id, job_id, approval_id,
                "approve" if status == "approved" else "deny", edited_args=body.args,
            )
    return {"ok": True, "status": status, "jobStatus": job_status}


def _ev(obj: dict) -> bytes:
    return f"data: {json.dumps(obj, default=str)}\n\n".encode()


def _load(value):
    return json.loads(value) if isinstance(value, str) else (value or [])
