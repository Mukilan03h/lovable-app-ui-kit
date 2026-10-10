"""Knowledge alerts — saved searches that report what changed.

A user subscribes to a query; checking an alert re-runs permission-aware
retrieval and reports which documents are new or changed since the last check.
Alerts are per-user and tenant-isolated by RLS; each check sees only documents
the subscriber may read, so an alert never leaks across access boundaries.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ...alerts import evaluate
from ...db import new_uuid
from ...services import Services
from ..deps import Principal, get_services, require

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


def _load(v, default):
    if v is None:
        return default
    return json.loads(v) if isinstance(v, str) else v


class CreateAlert(BaseModel):
    name: str
    query: str
    sources: list[str] = []


@router.post("")
async def create_alert(body: CreateAlert, principal: Principal = Depends(require("search")),
                       svc: Services = Depends(get_services)) -> dict:
    query = body.query.strip()
    name = body.name.strip() or query
    if not query:
        raise HTTPException(400, "A saved search needs a query")
    alert_id = new_uuid()
    sources = [s for s in body.sources if isinstance(s, str)]
    async with svc.db.acquire(principal.tenant_id) as conn:
        # Seed the snapshot with what matches now, so the first check reports real
        # change rather than flagging every current document as new.
        seed = await evaluate(svc, conn, query, principal.principals, sources, {})
        await conn.execute(
            """INSERT INTO saved_searches (id, tenant_id, user_id, name, query, sources, last_seen, last_checked)
               VALUES ($1,$2,$3,$4,$5,$6,$7, now())""",
            alert_id, principal.tenant_id, principal.user.id, name, query,
            json.dumps(sources), json.dumps(seed["snapshot"]),
        )
    return {"id": alert_id, "name": name, "query": query, "tracked": len(seed["snapshot"])}


@router.get("")
async def list_alerts(principal: Principal = Depends(require("search")),
                      svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch(
            """SELECT id, name, query, sources, last_seen, enabled,
                      extract(epoch FROM last_checked) AS last_checked,
                      extract(epoch FROM created_at) AS created_at
               FROM saved_searches WHERE user_id=$1 ORDER BY created_at DESC""",
            principal.user.id,
        )
    return {"alerts": [
        {"id": str(r["id"]), "name": r["name"], "query": r["query"],
         "sources": _load(r["sources"], []), "enabled": r["enabled"],
         "tracked": len(_load(r["last_seen"], {})),
         "lastChecked": r["last_checked"], "createdAt": r["created_at"]}
        for r in rows
    ]}


@router.post("/{alert_id}/check")
async def check_alert(alert_id: str, principal: Principal = Depends(require("search")),
                      svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        row = await conn.fetchrow(
            "SELECT query, sources, last_seen FROM saved_searches WHERE id=$1 AND user_id=$2",
            alert_id, principal.user.id,
        )
        if not row:
            raise HTTPException(404, "Alert not found")
        last_seen = _load(row["last_seen"], {})
        out = await evaluate(svc, conn, row["query"], principal.principals,
                             _load(row["sources"], []), last_seen)
        # Persist the new snapshot and the check time.
        await conn.execute(
            "UPDATE saved_searches SET last_seen=$2, last_checked=now() WHERE id=$1",
            alert_id, json.dumps(out["snapshot"]),
        )
    return {"hits": out["hits"], "new": len(out["new"]), "changed": len(out["changed"]),
            "confidence": out["confidence"]}


class PatchAlert(BaseModel):
    enabled: bool


@router.patch("/{alert_id}")
async def patch_alert(alert_id: str, body: PatchAlert, principal: Principal = Depends(require("search")),
                      svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        res = await conn.execute(
            "UPDATE saved_searches SET enabled=$3 WHERE id=$1 AND user_id=$2",
            alert_id, principal.user.id, body.enabled,
        )
    if res.endswith("0"):
        raise HTTPException(404, "Alert not found")
    return {"ok": True, "enabled": body.enabled}


@router.delete("/{alert_id}")
async def delete_alert(alert_id: str, principal: Principal = Depends(require("search")),
                       svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute("DELETE FROM saved_searches WHERE id=$1 AND user_id=$2", alert_id, principal.user.id)
    return {"ok": True}
