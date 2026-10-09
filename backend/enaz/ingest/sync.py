"""Connector sync engine with index-attempt tracking.

One sync == one *index attempt*: we record a row the moment it starts, classify
every document as new / updated / unchanged, prune documents that vanished from
the source, advance the incremental cursor, and close the attempt with counts,
timing and any error. This mirrors Onyx's connector/index-attempt model so the
admin UI can show real indexing history and progress rather than a single status
flag.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from . import connectors as _connectors_pkg  # noqa: F401  (ensure registry import side effects)
from .connectors import base as connectors_base


def _load(value):
    return json.loads(value) if isinstance(value, str) else (value or {})


class SyncError(Exception):
    pass


async def run_sync(svc, tenant_id: str, connector_id: str, trigger: str = "manual") -> dict:
    """Run one indexing attempt for a connector. Returns the attempt summary."""
    async with svc.db.acquire(tenant_id) as conn:
        row = await conn.fetchrow(
            "SELECT type, name, config, cursor, credential_id FROM connectors WHERE id = $1", connector_id
        )
        if not row:
            raise SyncError("Connector not found")
        config = _load(row["config"])
        if row["credential_id"]:
            cred = await conn.fetchrow("SELECT secret FROM credentials WHERE id = $1", row["credential_id"])
            if cred:
                config = {**config, **_load(cred["secret"])}
        existing = await conn.fetch("SELECT external_id FROM documents WHERE connector_id = $1", connector_id)
        existing_ext = {r["external_id"] for r in existing}

    if not connectors_base.has(row["type"]):
        raise SyncError(
            f"Connector '{row['type']}' has no live sync in this build — add its credential to enable it."
        )

    # Open the index attempt.
    async with svc.db.acquire(tenant_id) as conn:
        attempt_id = await conn.fetchval(
            """INSERT INTO index_attempts (tenant_id, connector_id, status, trigger)
               VALUES ($1,$2,'in_progress',$3) RETURNING id""",
            tenant_id, connector_id, trigger,
        )
        await conn.execute("UPDATE connectors SET status='indexing', error=NULL WHERE id=$1", connector_id)

    connector = connectors_base.get_connector(row["type"], config)
    new_docs = updated_docs = 0
    seen: set[str] = set()
    try:
        async for item in connector.fetch(row["cursor"]):
            doc_id, changed = await svc.ingest.ingest(tenant_id, item, connector_id=connector_id)
            seen.add(doc_id)
            if item.external_id not in existing_ext:
                new_docs += 1
            elif changed:
                updated_docs += 1
        removed = await svc.ingest.remove_missing(tenant_id, connector_id, seen)
        cursor = datetime.now(timezone.utc).isoformat()
        async with svc.db.acquire(tenant_id) as conn:
            await conn.execute(
                """UPDATE index_attempts SET status='success', new_docs=$2, updated_docs=$3,
                       removed_docs=$4, total_docs=$5, finished_at=now() WHERE id=$1""",
                attempt_id, new_docs, updated_docs, removed, len(seen),
            )
            await conn.execute(
                """UPDATE connectors SET status='healthy', doc_count=$2, new_docs=$3, updated_docs=$4,
                       removed_docs=$5, last_sync=now(), cursor=$6, error=NULL WHERE id=$1""",
                connector_id, len(seen), new_docs, updated_docs, removed, cursor,
            )
    except Exception as exc:  # noqa: BLE001 - record the failure on both attempt and connector
        msg = str(exc)[:500]
        async with svc.db.acquire(tenant_id) as conn:
            await conn.execute(
                "UPDATE index_attempts SET status='failed', error=$2, finished_at=now() WHERE id=$1",
                attempt_id, msg,
            )
            await conn.execute("UPDATE connectors SET status='error', error=$2 WHERE id=$1", connector_id, msg)
        raise SyncError(f"Sync failed: {exc}") from exc

    return {
        "attemptId": str(attempt_id), "new": new_docs, "updated": updated_docs,
        "removed": removed, "total": len(seen),
    }


async def due_connectors(svc) -> list[tuple[str, str]]:
    """Across all tenants, connectors whose scheduled refresh is due.

    Returns (tenant_id, connector_id) pairs. Runs over an admin connection so the
    scheduler sees every tenant; each returned connector is then synced under its
    own tenant context (which enforces RLS during the actual writes).
    """
    async with svc.db.admin() as conn:
        rows = await conn.fetch(
            """SELECT id, tenant_id FROM connectors
               WHERE refresh_freq_minutes > 0 AND paused = false
                 AND status <> 'indexing'
                 AND (next_sync IS NULL OR next_sync <= now())"""
        )
    return [(str(r["tenant_id"]), str(r["id"])) for r in rows]


async def mark_scheduled(svc, tenant_id: str, connector_id: str) -> None:
    """Advance next_sync by the connector's refresh frequency before running it."""
    async with svc.db.acquire(tenant_id) as conn:
        await conn.execute(
            """UPDATE connectors
               SET next_sync = now() + make_interval(mins => refresh_freq_minutes)
               WHERE id = $1 AND refresh_freq_minutes > 0""",
            connector_id,
        )
