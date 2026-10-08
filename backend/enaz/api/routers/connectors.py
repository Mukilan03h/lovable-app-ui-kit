"""Connectors: catalog, connected sources, sync, and file upload."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from ...ingest.connectors import base as connectors_base
from ...ingest.connectors.catalog_data import full_catalog
from ...ingest.markitdown_parser import parse_with_markitdown
from ...ingest.parsers import UnsupportedFile
from ...ingest.pipeline import SourceDocument
from ...services import Services
from ..deps import Principal, audit, get_services, require

router = APIRouter(prefix="/api/connectors", tags=["connectors"])


@router.get("/catalog")
async def catalog(principal: Principal = Depends(require("connectors")), svc: Services = Depends(get_services)) -> dict:
    return {"connectors": full_catalog()}


@router.get("")
async def list_connectors(principal: Principal = Depends(require("connectors")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch(
            "SELECT id, type, name, status, freshness, doc_count, permission_sync, extract(epoch FROM last_sync) AS last_sync FROM connectors ORDER BY created_at"
        )
        stats = await svc.index.stats(conn)
    connected = [
        {
            "id": str(r["id"]), "type": r["type"], "name": r["name"], "status": r["status"],
            "freshness": r["freshness"], "docs": r["doc_count"], "permissionSync": r["permission_sync"],
            "lastSync": r["last_sync"],
        }
        for r in rows
    ]
    return {"connected": connected, "stats": stats}


class CreateConnector(BaseModel):
    type: str
    name: str | None = None
    config: dict = {}
    sync: bool = True


@router.post("")
async def create_connector(
    body: CreateConnector,
    principal: Principal = Depends(require("connectors:manage")),
    svc: Services = Depends(get_services),
) -> dict:
    meta = next((c for c in full_catalog() if c["type"] == body.type), None)
    if not meta:
        raise HTTPException(404, f"Unknown connector type '{body.type}'")
    live = connectors_base.has(body.type)
    async with svc.db.acquire(principal.tenant_id) as conn:
        cid = await conn.fetchval(
            "INSERT INTO connectors (tenant_id,type,name,config,status,freshness,permission_sync,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
            principal.tenant_id, body.type, body.name or meta["name"], _dump(body.config),
            "idle" if live else "available", meta["sync"].lower(), meta["acl"], principal.user.id,
        )
    await audit(svc, principal, "connector.create", body.type)
    result = {"id": str(cid), "live": live}
    if body.sync and live:
        result["sync"] = await _run_sync(svc, principal.tenant_id, str(cid))
    return result


@router.post("/{connector_id}/sync")
async def sync_connector(
    connector_id: str,
    principal: Principal = Depends(require("connectors:manage")),
    svc: Services = Depends(get_services),
) -> dict:
    return await _run_sync(svc, principal.tenant_id, connector_id)


@router.post("/upload")
async def upload(
    file: UploadFile = File(...),
    access: str = Form(default="public"),
    p: Principal = Depends(require("connectors:manage")),
    svc: Services = Depends(get_services),
) -> dict:
    data = await file.read()
    if len(data) > svc.settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, "File too large")
    try:
        parsed = parse_with_markitdown(file.filename or "upload", data)
    except UnsupportedFile as exc:
        raise HTTPException(415, str(exc))
    acl = [a.strip() for a in access.split(",") if a.strip()] or ["public"]
    doc_id, _ = await svc.ingest.ingest(
        p.tenant_id, SourceDocument(external_id=file.filename or parsed.title, title=parsed.title,
                                    source="file", acl=acl, parsed=parsed, owner=p.user.name)
    )
    await audit(svc, p, "document.upload", file.filename or "")
    return {"docId": doc_id, "title": parsed.title, "sections": len(parsed.sections)}


@router.delete("/{connector_id}")
async def delete_connector(
    connector_id: str,
    principal: Principal = Depends(require("connectors:manage")),
    svc: Services = Depends(get_services),
) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute("DELETE FROM connectors WHERE id = $1", connector_id)
    await audit(svc, principal, "connector.delete", connector_id)
    return {"ok": True}


async def _run_sync(svc: Services, tenant_id: str, connector_id: str) -> dict:
    async with svc.db.acquire(tenant_id) as conn:
        row = await conn.fetchrow("SELECT type, config, cursor FROM connectors WHERE id = $1", connector_id)
    if not row:
        raise HTTPException(404, "Connector not found")
    if not connectors_base.has(row["type"]):
        raise HTTPException(400, f"Connector '{row['type']}' has no live sync in this build — configure its credentials to enable it.")
    connector = connectors_base.get_connector(row["type"], _load(row["config"]))
    indexed = 0
    seen: set[str] = set()
    try:
        async for item in connector.fetch(row["cursor"]):
            doc_id, changed = await svc.ingest.ingest(tenant_id, item, connector_id=connector_id)
            seen.add(doc_id)
            if changed:
                indexed += 1
        removed = await svc.ingest.remove_missing(tenant_id, connector_id, seen)
        async with svc.db.acquire(tenant_id) as conn:
            await conn.execute(
                "UPDATE connectors SET status='healthy', doc_count=$2, last_sync=now(), error=NULL WHERE id=$1",
                connector_id, len(seen),
            )
    except Exception as exc:  # noqa: BLE001 - record sync failures on the connector
        async with svc.db.acquire(tenant_id) as conn:
            await conn.execute("UPDATE connectors SET status='error', error=$2 WHERE id=$1", connector_id, str(exc)[:500])
        raise HTTPException(502, f"Sync failed: {exc}")
    return {"indexed": indexed, "total": len(seen), "removed": removed}


def _dump(value) -> str:
    import json

    return json.dumps(value)


def _load(value):
    import json

    return json.loads(value) if isinstance(value, str) else value
