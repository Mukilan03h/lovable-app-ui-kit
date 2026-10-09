"""Live business-data sources: register read-only windows onto current records
and query them. Registration is admin-managed (configuring a SQL/REST source is
powerful); querying is available to anyone who can search."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ...live import LiveQueryError, run_live_query
from ...services import Services
from ..deps import Principal, audit, get_services, require

router = APIRouter(prefix="/api/live", tags=["live"])


def _load(v):
    return json.loads(v) if isinstance(v, str) else (v or {})


@router.get("")
async def list_sources(principal: Principal = Depends(require("search")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch(
            "SELECT id, name, kind, description, enabled FROM live_sources ORDER BY created_at DESC"
        )
    return {"sources": [
        {"id": str(r["id"]), "name": r["name"], "kind": r["kind"], "description": r["description"],
         "enabled": r["enabled"]}
        for r in rows
    ]}


class SourceBody(BaseModel):
    name: str
    kind: str = "sql"            # sql | rest
    description: str = ""
    config: dict = {}


@router.post("")
async def create_source(body: SourceBody, principal: Principal = Depends(require("connectors:manage")), svc: Services = Depends(get_services)) -> dict:
    if body.kind not in ("sql", "rest"):
        raise HTTPException(422, "kind must be 'sql' or 'rest'")
    async with svc.db.acquire(principal.tenant_id) as conn:
        sid = await conn.fetchval(
            "INSERT INTO live_sources (tenant_id, name, kind, description, config, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
            principal.tenant_id, body.name, body.kind, body.description, json.dumps(body.config), principal.user.id,
        )
    await audit(svc, principal, "live_source.create", body.name)
    return {"id": str(sid)}


@router.delete("/{source_id}")
async def delete_source(source_id: str, principal: Principal = Depends(require("connectors:manage")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute("DELETE FROM live_sources WHERE id=$1", source_id)
    return {"ok": True}


@router.post("/{source_id}/query")
async def query_source(source_id: str, principal: Principal = Depends(require("search")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        row = await conn.fetchrow("SELECT name, kind, config, enabled FROM live_sources WHERE id=$1", source_id)
    if not row:
        raise HTTPException(404, "Live source not found")
    if not row["enabled"]:
        raise HTTPException(409, "Live source is disabled")
    try:
        result = await run_live_query(row["kind"], _load(row["config"]), svc.settings.admin_database_url)
    except LiveQueryError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Live query failed: {exc}")
    return {"name": row["name"], **result}
