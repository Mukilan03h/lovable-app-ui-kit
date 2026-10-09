"""Answer corrections → reusable knowledge.

A user corrects an answer, attaches supporting evidence, and submits it. A
knowledge owner (admin/manager) reviews it. Approved corrections influence future
answers, but only within an access scope and until an expiry/review date — a
correction never silently becomes company-wide truth. Provenance (who submitted,
who approved, scope, expiry) is recorded.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ...services import Services
from ..deps import Principal, audit, get_services, require

router = APIRouter(prefix="/api/corrections", tags=["corrections"])

REVIEWER_ROLES = {"admin", "manager"}


def _load(value):
    return json.loads(value) if isinstance(value, str) else (value or [])


class CorrectionBody(BaseModel):
    query: str
    correctedAnswer: str
    originalAnswer: str = ""
    evidenceUrl: str = ""
    scope: list[str] | None = None


@router.post("")
async def submit_correction(body: CorrectionBody, principal: Principal = Depends(require("assistant")), svc: Services = Depends(get_services)) -> dict:
    if not body.correctedAnswer.strip():
        raise HTTPException(422, "A corrected answer is required")
    # Default scope = the submitter's own principals, so an approved correction
    # reaches people who share their access — not the whole company.
    scope = body.scope if body.scope else [p for p in principal.principals if p != "external"]
    async with svc.db.acquire(principal.tenant_id) as conn:
        cid = await conn.fetchval(
            """INSERT INTO answer_corrections
                   (tenant_id, query, normalized, original_answer, corrected_answer, evidence_url, scope,
                    submitted_by, submitter_name)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id""",
            principal.tenant_id, body.query.strip(), body.query.lower().strip(), body.originalAnswer,
            body.correctedAnswer.strip(), body.evidenceUrl, json.dumps(scope),
            principal.user.id, principal.user.name,
        )
    await audit(svc, principal, "correction.submit", body.query[:80])
    return {"id": str(cid), "status": "pending"}


def _row(r) -> dict:
    return {
        "id": str(r["id"]), "query": r["query"], "originalAnswer": r["original_answer"],
        "correctedAnswer": r["corrected_answer"], "evidenceUrl": r["evidence_url"],
        "scope": _load(r["scope"]), "status": r["status"], "submitter": r["submitter_name"],
        "reviewer": r["reviewer_name"], "reviewNote": r["review_note"],
        "approvedAt": r["approved_at"].timestamp() if r["approved_at"] else None,
        "expiresAt": r["expires_at"].timestamp() if r["expires_at"] else None,
        "createdAt": r["created_at"].timestamp(),
    }


@router.get("")
async def list_corrections(principal: Principal = Depends(require("assistant")), svc: Services = Depends(get_services)) -> dict:
    can_review = principal.user.role in REVIEWER_ROLES
    async with svc.db.acquire(principal.tenant_id) as conn:
        if can_review:
            rows = await conn.fetch("SELECT * FROM answer_corrections ORDER BY created_at DESC LIMIT 100")
        else:
            rows = await conn.fetch(
                "SELECT * FROM answer_corrections WHERE submitted_by = $1 ORDER BY created_at DESC LIMIT 100",
                principal.user.id,
            )
    return {"corrections": [_row(r) for r in rows], "canReview": can_review}


class ReviewBody(BaseModel):
    decision: str  # approve | reject
    scope: list[str] | None = None
    expiresDays: int | None = 180
    note: str = ""


@router.post("/{correction_id}/review")
async def review_correction(correction_id: str, body: ReviewBody, principal: Principal = Depends(require("assistant")), svc: Services = Depends(get_services)) -> dict:
    if principal.user.role not in REVIEWER_ROLES:
        raise HTTPException(403, "Only a knowledge owner (admin or manager) can review corrections")
    status = "approved" if body.decision == "approve" else "rejected"
    expires = None
    if status == "approved" and body.expiresDays:
        expires = datetime.now(timezone.utc) + timedelta(days=int(body.expiresDays))
    async with svc.db.acquire(principal.tenant_id) as conn:
        sets = ["status=$2", "reviewed_by=$3", "reviewer_name=$4", "review_note=$5",
                "approved_at = CASE WHEN $2='approved' THEN now() ELSE NULL END", "expires_at=$6"]
        args = [correction_id, status, principal.user.id, principal.user.name, body.note, expires]
        if body.scope is not None:
            args.append(json.dumps(body.scope)); sets.append(f"scope=${len(args)}")
        await conn.execute(f"UPDATE answer_corrections SET {', '.join(sets)} WHERE id=$1", *args)
    await audit(svc, principal, f"correction.{status}", correction_id)
    return {"ok": True, "status": status}


@router.delete("/{correction_id}")
async def delete_correction(correction_id: str, principal: Principal = Depends(require("assistant")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        # Submitters can withdraw their own; reviewers can remove any.
        if principal.user.role in REVIEWER_ROLES:
            await conn.execute("DELETE FROM answer_corrections WHERE id=$1", correction_id)
        else:
            await conn.execute("DELETE FROM answer_corrections WHERE id=$1 AND submitted_by=$2",
                               correction_id, principal.user.id)
    return {"ok": True}
