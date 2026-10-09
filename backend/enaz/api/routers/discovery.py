"""Organizational discovery: entity pages, knowledge timeline, expert handoff.

All three are permission-aware aggregations over the same hybrid retrieval the
assistant uses, so a user only ever sees entities, timelines and experts drawn
from documents they can open.
"""

from __future__ import annotations

from collections import Counter, defaultdict

from fastapi import APIRouter, Depends, Query

from ...services import Services
from ..deps import Principal, get_services, require

router = APIRouter(prefix="/api", tags=["discovery"])


@router.get("/entities/page")
async def entity_page(
    name: str = Query(..., min_length=1),
    type: str = Query(default="entity"),
    principal: Principal = Depends(require("search")),
    svc: Services = Depends(get_services),
) -> dict:
    """Assemble a permission-filtered view of an entity: related documents grouped
    by kind, the people who own them, sources, recent activity and open work."""
    async with svc.db.acquire(principal.tenant_id) as conn:
        result = await svc.searcher.search(conn, name, principal.principals, k=24, candidates=120, per_doc=1)
        # Open work referencing the entity (durable jobs the user started).
        jobs = await conn.fetch(
            """SELECT id, status, task, extract(epoch FROM created_at) AS created_at
               FROM agent_jobs WHERE user_id=$1 AND task ILIKE $2 ORDER BY created_at DESC LIMIT 10""",
            principal.user.id, f"%{name}%",
        )
    hits = result.hits
    by_kind: dict[str, list[dict]] = defaultdict(list)
    owners: Counter[str] = Counter()
    sources: Counter[str] = Counter()
    for h in hits:
        by_kind[h.doc_type or "doc"].append({
            "docId": h.doc_id, "title": h.title, "source": h.source, "url": h.url,
            "updatedAt": h.updated_at, "snippet": h.text[:180],
        })
        if h.owner:
            owners[h.owner] += 1
        sources[h.source] += 1
    recent = sorted(
        ({"title": h.title, "source": h.source, "updatedAt": h.updated_at, "docId": h.doc_id} for h in hits),
        key=lambda d: d["updatedAt"] or 0, reverse=True,
    )[:12]
    return {
        "name": name, "type": type, "confidence": result.confidence,
        "related": {k: v[:8] for k, v in by_kind.items()},
        "owners": [{"name": n, "documents": c} for n, c in owners.most_common(6)],
        "sources": [{"source": s, "documents": c} for s, c in sources.most_common()],
        "recent": recent,
        "openWork": [
            {"id": str(j["id"]), "status": j["status"], "task": j["task"], "createdAt": j["created_at"]}
            for j in jobs
        ],
    }


@router.get("/timeline")
async def timeline(
    q: str = Query(..., min_length=1),
    principal: Principal = Depends(require("search")),
    svc: Services = Depends(get_services),
) -> dict:
    """A dated trail of the documents relevant to a topic, newest first — the
    evidence behind 'what changed?'. Point-in-time reconstruction of a prior
    version requires document history, which is noted as not yet captured."""
    async with svc.db.acquire(principal.tenant_id) as conn:
        result = await svc.searcher.search(conn, q, principal.principals, k=30, candidates=120, per_doc=1)
    entries = sorted(
        ({"docId": h.doc_id, "title": h.title, "source": h.source, "url": h.url,
          "updatedAt": h.updated_at, "snippet": h.text[:200], "owner": h.owner}
         for h in result.hits),
        key=lambda d: d["updatedAt"] or 0, reverse=True,
    )
    return {
        "query": q, "entries": entries,
        "pointInTime": False,
        "note": "Dated by each document's last update. Reconstructing a document's "
                "exact state at a past date requires per-version history (planned).",
    }


@router.get("/experts")
async def experts(
    q: str = Query(..., min_length=1),
    principal: Principal = Depends(require("search")),
    svc: Services = Depends(get_services),
) -> dict:
    """Rank likely subject experts for a topic from the owners of the most
    relevant documents the user can see, and prepare a question + context the
    user can choose to send (no message is sent here)."""
    async with svc.db.acquire(principal.tenant_id) as conn:
        result = await svc.searcher.search(conn, q, principal.principals, k=20, candidates=100, per_doc=1)
    scored: dict[str, float] = defaultdict(float)
    topics: dict[str, list[str]] = defaultdict(list)
    for h in result.hits:
        if h.owner:
            scored[h.owner] += max(h.score, 0.0)
            if h.title not in topics[h.owner]:
                topics[h.owner].append(h.title)
    ranked = sorted(scored.items(), key=lambda kv: kv[1], reverse=True)[:5]
    context = "; ".join(h.title for h in result.hits[:3])
    draft = (
        f"Hi — I'm looking into: \"{q}\". Our knowledge base points to you as a likely expert"
        + (f" (related: {context})" if context else "")
        + ". Could you confirm or point me to the right source?"
    )
    return {
        "query": q, "confidence": result.confidence,
        "experts": [{"name": n, "score": round(s, 3), "topics": topics[n][:3]} for n, s in ranked],
        "preparedQuestion": draft,
        "note": "No message is sent. Use this draft to contact the expert when you choose to.",
    }
