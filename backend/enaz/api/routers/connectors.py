"""Connectors: catalog, connected sources, credentials, scheduling, index-attempt
history, document sets, sync, and file upload.

This is the Onyx-grade connector surface: credentials live apart from connectors,
every sync is a tracked index attempt, connectors can be scheduled, paused and
resumed, and connectors can be grouped into document sets for scoped retrieval.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from ...ingest.connectors import base as connectors_base
from ...ingest.connectors.catalog_data import full_catalog
from ...ingest.markitdown_parser import parse_with_markitdown
from ...ingest.parsers import UnsupportedFile
from ...ingest.pipeline import SourceDocument
from ...ingest.sync import SyncError, run_sync
from ...services import Services
from ..deps import Principal, audit, get_services, require

router = APIRouter(prefix="/api/connectors", tags=["connectors"])


def _dump(value) -> str:
    return json.dumps(value)


def _load(value):
    return json.loads(value) if isinstance(value, str) else (value or {})


@router.get("/catalog")
async def catalog(principal: Principal = Depends(require("connectors")), svc: Services = Depends(get_services)) -> dict:
    return {"connectors": full_catalog()}


@router.get("")
async def list_connectors(principal: Principal = Depends(require("connectors")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch(
            """SELECT id, type, name, status, freshness, doc_count, permission_sync, credential_id,
                      refresh_freq_minutes, paused, new_docs, updated_docs, removed_docs,
                      extract(epoch FROM last_sync) AS last_sync, extract(epoch FROM next_sync) AS next_sync, error
               FROM connectors ORDER BY created_at"""
        )
        stats = await svc.index.stats(conn)
    connected = [
        {
            "id": str(r["id"]), "type": r["type"], "name": r["name"], "status": r["status"],
            "freshness": r["freshness"], "docs": r["doc_count"], "permissionSync": r["permission_sync"],
            "credentialId": str(r["credential_id"]) if r["credential_id"] else None,
            "refreshFreqMinutes": r["refresh_freq_minutes"], "paused": r["paused"],
            "newDocs": r["new_docs"], "updatedDocs": r["updated_docs"], "removedDocs": r["removed_docs"],
            "lastSync": r["last_sync"], "nextSync": r["next_sync"], "error": r["error"],
        }
        for r in rows
    ]
    return {"connected": connected, "stats": stats}


# ---- credentials ----------------------------------------------------------
class CredentialBody(BaseModel):
    type: str
    name: str
    secret: dict = {}


@router.get("/credentials")
async def list_credentials(principal: Principal = Depends(require("connectors:manage")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch(
            "SELECT id, type, name, secret, extract(epoch FROM created_at) AS created_at FROM credentials ORDER BY created_at DESC"
        )
    # Never return secret values — only which keys are set, so the UI can show "configured".
    out = []
    for r in rows:
        secret = _load(r["secret"])
        out.append({"id": str(r["id"]), "type": r["type"], "name": r["name"],
                    "keys": sorted(secret.keys()), "createdAt": r["created_at"]})
    return {"credentials": out}


@router.post("/credentials")
async def create_credential(body: CredentialBody, principal: Principal = Depends(require("connectors:manage")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        cid = await conn.fetchval(
            "INSERT INTO credentials (tenant_id, type, name, secret, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id",
            principal.tenant_id, body.type, body.name, _dump(body.secret), principal.user.id,
        )
    await audit(svc, principal, "credential.create", body.type)
    return {"id": str(cid)}


@router.delete("/credentials/{credential_id}")
async def delete_credential(credential_id: str, principal: Principal = Depends(require("connectors:manage")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute("DELETE FROM credentials WHERE id = $1", credential_id)
    return {"ok": True}


# ---- connectors -----------------------------------------------------------
class CreateConnector(BaseModel):
    type: str
    name: str | None = None
    config: dict = {}
    credentialId: str | None = None
    refreshFreqMinutes: int = 0
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
            """INSERT INTO connectors (tenant_id,type,name,config,status,freshness,permission_sync,
                   created_by,credential_id,refresh_freq_minutes,next_sync)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                   CASE WHEN $10 > 0 THEN now() + make_interval(mins => $10) ELSE NULL END)
               RETURNING id""",
            principal.tenant_id, body.type, body.name or meta["name"], _dump(body.config),
            "idle" if live else "available", meta["sync"].lower(), meta["acl"], principal.user.id,
            body.credentialId, body.refreshFreqMinutes,
        )
    await audit(svc, principal, "connector.create", body.type)
    result = {"id": str(cid), "live": live}
    if body.sync and live:
        try:
            result["sync"] = await run_sync(svc, principal.tenant_id, str(cid), trigger="initial")
        except SyncError as exc:
            raise HTTPException(502, str(exc))
    return result


class PatchConnector(BaseModel):
    name: str | None = None
    refreshFreqMinutes: int | None = None
    credentialId: str | None = None


@router.patch("/{connector_id}")
async def patch_connector(connector_id: str, body: PatchConnector, principal: Principal = Depends(require("connectors:manage")), svc: Services = Depends(get_services)) -> dict:
    sets, args = [], []
    if body.name is not None:
        args.append(body.name); sets.append(f"name = ${len(args)}")
    if body.refreshFreqMinutes is not None:
        args.append(body.refreshFreqMinutes); sets.append(f"refresh_freq_minutes = ${len(args)}")
        args.append(body.refreshFreqMinutes)
        sets.append(f"next_sync = CASE WHEN ${len(args)} > 0 THEN now() + make_interval(mins => ${len(args)}) ELSE NULL END")
    if body.credentialId is not None:
        args.append(body.credentialId); sets.append(f"credential_id = ${len(args)}")
    if sets:
        args.append(connector_id)
        async with svc.db.acquire(principal.tenant_id) as conn:
            await conn.execute(f"UPDATE connectors SET {', '.join(sets)} WHERE id = ${len(args)}", *args)
    return {"ok": True}


@router.post("/{connector_id}/pause")
async def pause_connector(connector_id: str, principal: Principal = Depends(require("connectors:manage")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute("UPDATE connectors SET paused = true WHERE id = $1", connector_id)
    return {"ok": True, "paused": True}


@router.post("/{connector_id}/resume")
async def resume_connector(connector_id: str, principal: Principal = Depends(require("connectors:manage")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute(
            """UPDATE connectors SET paused = false,
                   next_sync = CASE WHEN refresh_freq_minutes > 0 THEN now() ELSE next_sync END
               WHERE id = $1""",
            connector_id,
        )
    return {"ok": True, "paused": False}


@router.get("/{connector_id}/attempts")
async def list_attempts(connector_id: str, principal: Principal = Depends(require("connectors")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch(
            """SELECT id, status, trigger, new_docs, updated_docs, removed_docs, total_docs, error,
                      extract(epoch FROM started_at) AS started_at, extract(epoch FROM finished_at) AS finished_at
               FROM index_attempts WHERE connector_id = $1 ORDER BY started_at DESC LIMIT 25""",
            connector_id,
        )
    return {"attempts": [
        {"id": str(r["id"]), "status": r["status"], "trigger": r["trigger"], "new": r["new_docs"],
         "updated": r["updated_docs"], "removed": r["removed_docs"], "total": r["total_docs"],
         "error": r["error"], "startedAt": r["started_at"], "finishedAt": r["finished_at"]}
        for r in rows
    ]}


@router.post("/{connector_id}/sync")
async def sync_connector(
    connector_id: str,
    principal: Principal = Depends(require("connectors:manage")),
    svc: Services = Depends(get_services),
) -> dict:
    try:
        return await run_sync(svc, principal.tenant_id, connector_id, trigger="manual")
    except SyncError as exc:
        raise HTTPException(502, str(exc))


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


# ---- document sets --------------------------------------------------------
class DocumentSetBody(BaseModel):
    name: str
    description: str = ""
    connectorIds: list[str] = []


@router.get("/document-sets")
async def list_document_sets(principal: Principal = Depends(require("connectors")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        sets = await conn.fetch("SELECT id, name, description FROM document_sets ORDER BY name")
        links = await conn.fetch("SELECT document_set_id, connector_id FROM document_set_connectors")
    by_set: dict[str, list[str]] = {}
    for link in links:
        by_set.setdefault(str(link["document_set_id"]), []).append(str(link["connector_id"]))
    return {"documentSets": [
        {"id": str(s["id"]), "name": s["name"], "description": s["description"],
         "connectorIds": by_set.get(str(s["id"]), [])}
        for s in sets
    ]}


@router.post("/document-sets")
async def create_document_set(body: DocumentSetBody, principal: Principal = Depends(require("connectors:manage")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        try:
            sid = await conn.fetchval(
                "INSERT INTO document_sets (tenant_id, name, description, created_by) VALUES ($1,$2,$3,$4) RETURNING id",
                principal.tenant_id, body.name, body.description, principal.user.id,
            )
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(409, "A document set with that name already exists") from exc
        for conn_id in body.connectorIds:
            await conn.execute(
                "INSERT INTO document_set_connectors (tenant_id, document_set_id, connector_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
                principal.tenant_id, sid, conn_id,
            )
    return {"id": str(sid)}


@router.put("/document-sets/{set_id}")
async def update_document_set(set_id: str, body: DocumentSetBody, principal: Principal = Depends(require("connectors:manage")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute("UPDATE document_sets SET name=$2, description=$3 WHERE id=$1", set_id, body.name, body.description)
        await conn.execute("DELETE FROM document_set_connectors WHERE document_set_id=$1", set_id)
        for conn_id in body.connectorIds:
            await conn.execute(
                "INSERT INTO document_set_connectors (tenant_id, document_set_id, connector_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
                principal.tenant_id, set_id, conn_id,
            )
    return {"ok": True}


@router.delete("/document-sets/{set_id}")
async def delete_document_set(set_id: str, principal: Principal = Depends(require("connectors:manage")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute("DELETE FROM document_sets WHERE id = $1", set_id)
    return {"ok": True}


# ---- document upload ------------------------------------------------------
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
