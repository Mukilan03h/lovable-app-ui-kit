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

    task = body.task or f"Run the '{agent['name']}' task: {agent['description']}"
    output = agent["output"]
    wants_artifact = output if output in ("slides", "doc", "sheet") else None
    principals = principal.principals
    tenant_id = principal.tenant_id
    user_id = principal.user.id

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
            async for event in svc.answers.answer(
                tenant_id, principals, acl_key(principals), task,
                mode="research", user_id=user_id, wants_artifact=wants_artifact, allow_cache=False,
            ):
                if event.get("type") == "done":
                    cost = event.get("cost", 0.0)
                yield _ev(event)
            # Side-effect agents stop at an approval instead of acting.
            tools = _load(agent["tools"])
            if any(t.lower() in ("slack", "jira", "salesforce", "email", "zendesk") for t in tools) and output == "answer":
                approval_id = new_uuid()
                async with svc.db.acquire(tenant_id) as conn:
                    await conn.execute(
                        "INSERT INTO approvals (id,tenant_id,run_id,user_id,tool,args) VALUES ($1,$2,$3,$4,$5,$6)",
                        approval_id, tenant_id, run_id, user_id, tools[0] if tools else "action",
                        json.dumps({"summary": task}),
                    )
                yield _ev({"type": "approval", "approvalId": approval_id, "tool": tools[0] if tools else "action"})
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


@router.post("/approvals/{approval_id}")
async def decide(approval_id: str, body: DecideRequest, principal: Principal = Depends(require("agents")), svc: Services = Depends(get_services)) -> dict:
    status = "approved" if body.decision == "approve" else "denied"
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute("UPDATE approvals SET status=$2, decided_at=now() WHERE id=$1", approval_id, status)
    await audit(svc, principal, f"approval.{status}", approval_id)
    return {"ok": True, "status": status}


def _ev(obj: dict) -> bytes:
    return f"data: {json.dumps(obj, default=str)}\n\n".encode()


def _load(value):
    return json.loads(value) if isinstance(value, str) else (value or [])
