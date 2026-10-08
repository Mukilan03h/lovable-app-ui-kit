"""Search: permission-aware hybrid search with facets and expert suggestions."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from ...services import Services
from ..deps import Principal, get_services, require

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("")
async def search(
    q: str = Query(..., min_length=1),
    sources: list[str] | None = Query(default=None),
    types: list[str] | None = Query(default=None),
    k: int = Query(default=12, le=50),
    principal: Principal = Depends(require("search")),
    svc: Services = Depends(get_services),
) -> dict:
    principals = principal.principals
    async with svc.db.acquire(principal.tenant_id) as conn:
        result = await svc.searcher.search(conn, q, principals, k=k, sources=sources, doc_types=types, per_doc=3)
        facet_rows = await conn.fetch(
            """SELECT d.source, count(*) AS n FROM documents d
               WHERE EXISTS (SELECT 1 FROM doc_acl a WHERE a.doc_id = d.id AND a.principal = ANY($1::text[]))
               GROUP BY d.source ORDER BY n DESC""",
            [p.lower() for p in principals],
        )
        type_rows = await conn.fetch(
            """SELECT d.doc_type, count(*) AS n FROM documents d
               WHERE EXISTS (SELECT 1 FROM doc_acl a WHERE a.doc_id = d.id AND a.principal = ANY($1::text[]))
               GROUP BY d.doc_type ORDER BY n DESC""",
            [p.lower() for p in principals],
        )
    experts: list[dict] = []
    seen = set()
    for h in result.hits:
        if h.owner and h.owner not in seen:
            seen.add(h.owner)
            experts.append({"name": h.owner, "topic": h.title})
        if len(experts) >= 3:
            break
    web = []
    if svc.web_search.enabled:
        web = [r.public() for r in await svc.web_search.search(q)]
    return {
        "query": q,
        "results": [h.public() for h in result.hits],
        "web": web,
        "webEnabled": svc.web_search.enabled,
        "facets": {
            "sources": [{"value": r["source"], "count": r["n"]} for r in facet_rows],
            "types": [{"value": r["doc_type"], "count": r["n"]} for r in type_rows],
        },
        "experts": experts,
        "confidence": result.confidence,
        "tookMs": result.latency_ms,
    }
