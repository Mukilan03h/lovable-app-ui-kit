"""Self-owned durable agent run engine (no third-party runtime).

A run is a row in ``agent_jobs``. Workers claim a job with
``SELECT ... FOR UPDATE SKIP LOCKED`` under a lease, so exactly one worker runs a
job at a time and a crashed worker's job is reclaimed when its lease expires.
Completed steps are checkpointed so a reclaimed run skips them, every side effect
writes an idempotent receipt, and the event stream is persisted (replayable by
sequence). This is the durable counterpart to the live streamed run — it survives
the chat closing and worker restarts.
"""

from __future__ import annotations

import json
from typing import Any

from .security import acl_key, principals_for

LEASE_SECONDS = 120
SIDE_EFFECT_TOOLS = {"slack", "jira", "salesforce", "email", "zendesk"}

QUEUED = "queued"
RUNNING = "running"
AWAITING_APPROVAL = "awaiting_approval"
SUCCEEDED = "succeeded"
FAILED = "failed"
CANCELLED = "cancelled"


def _load(v):
    return json.loads(v) if isinstance(v, str) else (v or {})


async def enqueue(svc, tenant_id: str, agent_id: str, user_id: str, task: str,
                  idempotency_key: str | None = None, budget: float = 0.0) -> str:
    """Create a durable job. An idempotency key makes re-enqueue return the same job."""
    async with svc.db.acquire(tenant_id) as conn:
        if idempotency_key:
            existing = await conn.fetchval(
                "SELECT id FROM agent_jobs WHERE tenant_id=$1 AND idempotency_key=$2",
                tenant_id, idempotency_key,
            )
            if existing:
                return str(existing)
        jid = await conn.fetchval(
            """INSERT INTO agent_jobs (tenant_id, agent_id, user_id, task, idempotency_key, budget, status)
               VALUES ($1,$2,$3,$4,$5,$6,'queued') RETURNING id""",
            tenant_id, agent_id, user_id, task, idempotency_key, budget,
        )
    return str(jid)


async def request_cancel(svc, tenant_id: str, job_id: str) -> str:
    """Request cancellation. A job not yet running is cancelled immediately; a
    running job is flagged and stops at the next checkpoint."""
    async with svc.db.acquire(tenant_id) as conn:
        row = await conn.fetchrow(
            """UPDATE agent_jobs
               SET cancel_requested = true,
                   status = CASE WHEN status IN ('queued','awaiting_approval','paused') THEN 'cancelled' ELSE status END,
                   finished_at = CASE WHEN status IN ('queued','awaiting_approval','paused') THEN now() ELSE finished_at END,
                   updated_at = now()
               WHERE id = $1 RETURNING status""",
            job_id,
        )
    return row["status"] if row else "unknown"


async def claim_next(svc) -> dict | None:
    """Atomically claim one runnable job across all tenants: a queued job whose
    time has come, or a running job whose lease expired (crash recovery)."""
    async with svc.db.admin() as conn:
        row = await conn.fetchrow(
            f"""UPDATE agent_jobs SET status='running',
                    lease_until = now() + interval '{LEASE_SECONDS} seconds',
                    started_at = COALESCE(started_at, now()), attempts = attempts + 1, updated_at = now()
                WHERE id = (
                    SELECT id FROM agent_jobs
                    WHERE (status='queued' AND scheduled_for <= now())
                       OR (status='running' AND lease_until < now())
                    ORDER BY scheduled_for
                    FOR UPDATE SKIP LOCKED LIMIT 1
                )
                RETURNING *"""
        )
    return dict(row) if row else None


async def _emit(svc, tenant_id: str, job_id: str, event: dict) -> None:
    async with svc.db.acquire(tenant_id) as conn:
        await conn.execute(
            "INSERT INTO agent_job_events (tenant_id, job_id, event) VALUES ($1,$2,$3)",
            tenant_id, job_id, json.dumps(event),
        )


async def _finish(svc, tenant_id: str, job_id: str, status: str, *, result: dict | None = None,
                  error: str | None = None, cost: float = 0.0) -> None:
    async with svc.db.acquire(tenant_id) as conn:
        await conn.execute(
            """UPDATE agent_jobs SET status=$2, result=$3, error=$4, cost=$5,
                   finished_at=now(), lease_until=NULL, updated_at=now() WHERE id=$1""",
            job_id, status, json.dumps(result or {}), error, cost,
        )


async def execute_job(svc, job: dict) -> str:
    """Run a claimed job to a terminal or parked state. Idempotent across retries:
    a checkpointed step is not re-run, and side effects are receipt-guarded."""
    tenant_id = str(job["tenant_id"])
    job_id = str(job["id"])
    checkpoint = _load(job.get("checkpoint"))

    async with svc.db.acquire(tenant_id) as conn:
        agent = await conn.fetchrow("SELECT * FROM agents WHERE id=$1", job["agent_id"])
        user = await conn.fetchrow("SELECT * FROM users WHERE id=$1", job["user_id"]) if job["user_id"] else None

    if job.get("cancel_requested"):
        await _emit(svc, tenant_id, job_id, {"type": "run.cancelled"})
        await _finish(svc, tenant_id, job_id, CANCELLED)
        return CANCELLED
    if not agent:
        await _finish(svc, tenant_id, job_id, FAILED, error="Agent not found")
        return FAILED
    if not agent["enabled"]:
        await _emit(svc, tenant_id, job_id, {"type": "error", "message": "agent disabled"})
        await _finish(svc, tenant_id, job_id, FAILED, error="Agent is disabled")
        return FAILED

    # Build the caller's principals from the stored user (permission re-check at run
    # time, with groups re-resolved so revocation takes effect on resume).
    from .security import User

    if user:
        async with svc.db.acquire(tenant_id) as conn:
            grp = await conn.fetch(
                "SELECT g.name FROM groups g JOIN user_groups ug ON ug.group_id=g.id WHERE ug.user_id=$1",
                user["id"],
            )
        principals = principals_for(User(
            id=str(user["id"]), email=user["email"], name=user["name"], role=user["role"],
            groups=tuple(r["name"] for r in grp),
        ))
    else:
        principals = ["public"]

    instructions = agent["instructions"] or ""
    agent_sources = [s for s in _load(agent["sources"]) if isinstance(s, str)] or None
    allowed_tools = {t.lower() for t in _load(agent["tools"])}
    output = agent["output"]
    wants_artifact = output if output in ("slides", "doc", "sheet") else None
    task = job["task"] or f"Run the '{agent['name']}' task: {agent['description']}"

    await _emit(svc, tenant_id, job_id, {"type": "run.started", "agent": agent["name"]})

    answer_text = ""
    sources: list = []
    cost = float(job.get("cost") or 0.0)
    # Checkpointed step: don't re-answer on a reclaimed run.
    if not checkpoint.get("answered"):
        try:
            async for event in svc.answers.answer(
                tenant_id, principals, acl_key(principals), task, mode="research",
                user_id=job["user_id"], wants_artifact=wants_artifact, allow_cache=False,
                sources=agent_sources, extra_instructions=instructions,
            ):
                await _emit(svc, tenant_id, job_id, event)
                if event.get("type") == "answer":
                    answer_text = event.get("text", "")
                elif event.get("type") == "sources":
                    sources = event.get("sources", [])
                elif event.get("type") == "done":
                    cost = event.get("cost", cost)
        except Exception as exc:  # noqa: BLE001
            await _emit(svc, tenant_id, job_id, {"type": "error", "message": str(exc)})
            await _finish(svc, tenant_id, job_id, FAILED, error=str(exc)[:500])
            return FAILED
        checkpoint["answered"] = True
        async with svc.db.acquire(tenant_id) as conn:
            await conn.execute(
                "UPDATE agent_jobs SET checkpoint=$2, cost=$3, updated_at=now() WHERE id=$1",
                job_id, json.dumps(checkpoint), cost,
            )
    else:
        await _emit(svc, tenant_id, job_id, {"type": "step", "tool": "plan",
                                             "label": "Resumed", "detail": "answer already checkpointed"})

    # Budget enforcement.
    if job.get("budget") and float(job["budget"]) > 0 and cost > float(job["budget"]):
        await _emit(svc, tenant_id, job_id, {"type": "error", "message": "budget exceeded"})
        await _finish(svc, tenant_id, job_id, FAILED, error="Budget exceeded", cost=cost)
        return FAILED

    # Side-effect tools park at an approval, with an idempotent 'proposed' receipt.
    granted = [t for t in allowed_tools if t in SIDE_EFFECT_TOOLS]
    if granted and output == "answer":
        tool = granted[0]
        action_id = f"{job_id}:proposed:{tool}"
        async with svc.db.acquire(tenant_id) as conn:
            await conn.execute(
                """INSERT INTO agent_receipts (tenant_id, job_id, action_id, step, tool, args, status)
                   VALUES ($1,$2,$3,'side_effect',$4,$5,'proposed') ON CONFLICT (job_id, action_id) DO NOTHING""",
                tenant_id, job_id, action_id, tool, json.dumps({"summary": task}),
            )
            approval_id = await conn.fetchval(
                """INSERT INTO approvals (tenant_id, run_id, user_id, tool, args)
                   VALUES ($1,$2,$3,$4,$5) RETURNING id""",
                tenant_id, None, job["user_id"], tool, json.dumps({"summary": task, "jobId": job_id}),
            )
        await _emit(svc, tenant_id, job_id, {"type": "interrupt", "reason": "approval",
                                             "approvalId": str(approval_id), "tool": tool})
        async with svc.db.acquire(tenant_id) as conn:
            # Persist the answer so the resumed run can carry it through to the result.
            await conn.execute(
                """UPDATE agent_jobs SET status='awaiting_approval', lease_until=NULL,
                       result=$2, cost=$3, updated_at=now() WHERE id=$1""",
                job_id, json.dumps({"answer": answer_text, "sources": sources}), cost,
            )
        return AWAITING_APPROVAL

    await _emit(svc, tenant_id, job_id, {"type": "run.finished", "cost": cost})
    await _finish(svc, tenant_id, job_id, SUCCEEDED,
                  result={"answer": answer_text, "sources": sources}, cost=cost)
    return SUCCEEDED


async def resume_after_decision(svc, tenant_id: str, job_id: str, approval_id: str,
                                decision: str, edited_args: dict | None = None) -> str:
    """Resume a job parked at an approval. Approve executes the (possibly edited)
    action once — idempotent via the receipt's action_id — and finishes the run;
    deny records the declined action and finishes without the side effect.

    Editing the arguments naturally invalidates the originally proposed version:
    the action that runs is the one approved here.
    """
    from .tools import execute_action

    async with svc.db.acquire(tenant_id) as conn:
        job = await conn.fetchrow("SELECT * FROM agent_jobs WHERE id=$1", job_id)
        if not job:
            return "unknown"
        if job["status"] != AWAITING_APPROVAL:
            return job["status"]  # idempotent: already resolved
        receipt = await conn.fetchrow(
            "SELECT * FROM agent_receipts WHERE job_id=$1 AND status='proposed' ORDER BY created_at DESC LIMIT 1",
            job_id,
        )
    tool = receipt["tool"] if receipt else "action"
    action_id = receipt["action_id"] if receipt else f"{job_id}:proposed:{tool}"
    base_args = _load(receipt["args"]) if receipt else {}
    args = {**base_args, **(edited_args or {})}
    result = _load(job.get("result"))

    if decision == "approve":
        async with svc.db.acquire(tenant_id) as conn:
            # Reconcile: if this action already completed (a retry), don't re-run it.
            done = await conn.fetchval(
                "SELECT 1 FROM agent_receipts WHERE job_id=$1 AND action_id=$2 AND status='done'",
                job_id, action_id,
            )
        if not done:
            outcome = execute_action(tool, args)
            async with svc.db.acquire(tenant_id) as conn:
                await conn.execute(
                    """INSERT INTO agent_receipts (tenant_id, job_id, action_id, step, tool, args, result, status)
                       VALUES ($1,$2,$3,'side_effect',$4,$5,$6,'done')
                       ON CONFLICT (job_id, action_id)
                       DO UPDATE SET args=excluded.args, result=excluded.result, status='done'""",
                    tenant_id, job_id, action_id, tool, json.dumps(args), json.dumps(outcome),
                )
            await _emit(svc, tenant_id, job_id, {"type": "tool.result", "tool": tool,
                                                 "simulated": outcome.get("simulated", False),
                                                 "ref": outcome.get("ref")})
            result = {**result, "actionTaken": True, "action": {"tool": tool, "args": args, "result": outcome}}
        await _emit(svc, tenant_id, job_id, {"type": "run.finished", "resumed": True})
        await _finish(svc, tenant_id, job_id, SUCCEEDED, result=result, cost=float(job.get("cost") or 0.0))
        return SUCCEEDED

    # Denied: record the declined action, finish without the side effect.
    async with svc.db.acquire(tenant_id) as conn:
        await conn.execute(
            "UPDATE agent_receipts SET status='denied' WHERE job_id=$1 AND action_id=$2", job_id, action_id,
        )
    await _emit(svc, tenant_id, job_id, {"type": "tool.denied", "tool": tool})
    await _emit(svc, tenant_id, job_id, {"type": "run.finished", "resumed": True})
    await _finish(svc, tenant_id, job_id, SUCCEEDED,
                  result={**result, "actionTaken": False, "denied": True}, cost=float(job.get("cost") or 0.0))
    return SUCCEEDED


async def run_worker_once(svc) -> bool:
    """Claim and execute one job. Returns True if a job was processed."""
    job = await claim_next(svc)
    if not job:
        return False
    await execute_job(svc, job)
    return True
