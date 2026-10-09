"""Universal work inbox.

One view of everything that needs the user's attention or records what the AI
did: approvals awaiting a decision, agent runs (running / failed / completed),
and answer corrections (to review, or the user's own that were reviewed). Each
item carries a bucket and the next action, so an always-on agent platform stays
manageable instead of scattering across separate conversations.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends

from ...services import Services
from ..deps import Principal, get_services, require

router = APIRouter(prefix="/api/inbox", tags=["inbox"])

REVIEWER_ROLES = {"admin", "manager"}

# Which bucket a status falls in.
NEEDS_DECISION = "needs_decision"
RUNNING = "running"
COMPLETED = "completed"
FAILED = "failed"


def _load(v):
    return json.loads(v) if isinstance(v, str) else (v or {})


@router.get("")
async def get_inbox(principal: Principal = Depends(require("assistant")), svc: Services = Depends(get_services)) -> dict:
    items: list[dict] = []
    can_review = principal.user.role in REVIEWER_ROLES
    async with svc.db.acquire(principal.tenant_id) as conn:
        # Approvals awaiting a decision.
        for r in await conn.fetch(
            """SELECT ap.id, ap.tool, ap.args, extract(epoch FROM ap.created_at) AS created_at, a.name AS agent
               FROM approvals ap
               LEFT JOIN agent_runs r ON r.id = ap.run_id
               LEFT JOIN agents a ON a.id = r.agent_id
               WHERE ap.status='pending' ORDER BY ap.created_at DESC LIMIT 50"""
        ):
            args = _load(r["args"])
            items.append({
                "id": str(r["id"]), "type": "approval", "bucket": NEEDS_DECISION,
                "title": f"Approve {r['tool']}" + (f" · {r['agent']}" if r["agent"] else ""),
                "detail": args.get("summary", ""), "nextAction": "Review the proposed change",
                "tool": r["tool"], "ref": {"kind": "approval", "id": str(r["id"])},
                "createdAt": r["created_at"],
            })

        # Agent runs — running / failed / completed.
        for r in await conn.fetch(
            """SELECT r.id, r.status, r.cost, extract(epoch FROM r.started_at) AS started_at,
                      extract(epoch FROM r.finished_at) AS finished_at, a.name AS agent
               FROM agent_runs r LEFT JOIN agents a ON a.id = r.agent_id
               WHERE r.user_id = $1 ORDER BY r.started_at DESC LIMIT 40""",
            principal.user.id,
        ):
            status = r["status"]
            bucket = (
                RUNNING if status == "running"
                else FAILED if status in ("failed", "interrupted")
                else NEEDS_DECISION if status == "needs_approval"
                else COMPLETED
            )
            items.append({
                "id": str(r["id"]), "type": "run", "bucket": bucket,
                "title": f"{r['agent'] or 'Agent'} run", "detail": f"status: {status}",
                "nextAction": {
                    RUNNING: "In progress", FAILED: "Retry or inspect",
                    NEEDS_DECISION: "Approve the proposed action", COMPLETED: "Open the result",
                }[bucket],
                "ref": {"kind": "run", "id": str(r["id"])},
                "createdAt": r["started_at"],
            })

        # Corrections: to review (reviewers) and the user's own that were reviewed.
        if can_review:
            pending = await conn.fetch(
                "SELECT id, query, submitter_name, extract(epoch FROM created_at) AS created_at FROM answer_corrections WHERE status='pending' ORDER BY created_at DESC LIMIT 30"
            )
            for r in pending:
                items.append({
                    "id": str(r["id"]), "type": "correction", "bucket": NEEDS_DECISION,
                    "title": "Review correction", "detail": f"“{r['query'][:80]}” · from {r['submitter_name']}",
                    "nextAction": "Approve or reject", "ref": {"kind": "correction", "id": str(r["id"])},
                    "createdAt": r["created_at"],
                })
        reviewed = await conn.fetch(
            """SELECT id, query, status, extract(epoch FROM approved_at) AS approved_at,
                      extract(epoch FROM created_at) AS created_at
               FROM answer_corrections WHERE submitted_by=$1 AND status<>'pending'
               ORDER BY created_at DESC LIMIT 20""",
            principal.user.id,
        )
        for r in reviewed:
            items.append({
                "id": str(r["id"]), "type": "correction", "bucket": COMPLETED,
                "title": f"Correction {r['status']}", "detail": f"“{r['query'][:80]}”",
                "nextAction": "View" if r["status"] == "approved" else "See why",
                "ref": {"kind": "correction", "id": str(r["id"])},
                "createdAt": r["approved_at"] or r["created_at"],
            })

    items.sort(key=lambda i: i["createdAt"] or 0, reverse=True)
    counts = {NEEDS_DECISION: 0, RUNNING: 0, COMPLETED: 0, FAILED: 0}
    for it in items:
        counts[it["bucket"]] = counts.get(it["bucket"], 0) + 1
    return {"items": items, "counts": counts, "canReview": can_review}
