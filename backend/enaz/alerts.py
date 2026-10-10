"""Knowledge alerts: re-run a saved search and detect what changed.

Evaluation is permission-aware (it runs the same hybrid searcher as normal
search, with the subscriber's own principals) and stateless apart from a
per-alert snapshot of doc_id -> last-seen updated_at. Comparing the current
top documents against that snapshot yields what is new or newly changed.
"""

from __future__ import annotations

from typing import Any

# A document counts as "changed" only if its updated_at advanced by more than
# this many seconds, so floating-point noise never produces a false alert.
_CHANGE_EPS = 1.0


async def evaluate(
    svc: Any,
    conn: Any,
    query: str,
    principals: list[str],
    sources: list[str] | None,
    last_seen: dict[str, float],
    *,
    k: int = 12,
) -> dict[str, Any]:
    """Run the saved search and classify each top document against the snapshot.

    Returns the hit list (each tagged new|changed|existing), the fresh snapshot
    to persist, and the ids that are new / changed this time.
    """
    result = await svc.searcher.search(
        conn, query, principals, k=k, sources=sources or None, per_doc=1
    )
    hits: list[dict[str, Any]] = []
    snapshot: dict[str, float] = {}
    new_ids: list[str] = []
    changed_ids: list[str] = []
    for h in result.hits:
        did = str(h.doc_id)
        updated = float(h.updated_at or 0.0)
        snapshot[did] = updated
        prev = last_seen.get(did)
        if prev is None:
            status = "new"
            new_ids.append(did)
        elif updated > float(prev) + _CHANGE_EPS:
            status = "changed"
            changed_ids.append(did)
        else:
            status = "existing"
        hits.append({
            "docId": did, "title": h.title, "source": h.source, "url": h.url,
            "snippet": (h.text or "")[:240], "updatedAt": updated or None, "status": status,
        })
    return {"hits": hits, "snapshot": snapshot, "new": new_ids, "changed": changed_ids,
            "confidence": round(result.confidence, 3)}
