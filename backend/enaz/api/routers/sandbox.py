"""Code interpreter + per-session files.

Upload files to a conversation, run Python in a network-isolated sandbox over that
workspace, and read/edit/download the files. Files persist for the session, so the
AI can analyze an uploaded spreadsheet, edit a document, or generate a chart and
keep it available — the Claude-style "file in the session" behaviour.
"""

from __future__ import annotations

import base64

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from ...ingest.markitdown_parser import extract_markdown
from ...sandbox.executor import run_python
from ...sandbox.workspace import Workspace, safe_name
from ...services import Services
from ..deps import Principal, audit, get_services, require

router = APIRouter(prefix="/api/conversations", tags=["sandbox"])


async def _ensure_conversation(svc: Services, principal: Principal, cid: str) -> None:
    async with svc.db.acquire(principal.tenant_id) as conn:
        exists = await conn.fetchval("SELECT 1 FROM conversations WHERE id = $1", cid)
        if not exists:
            await conn.execute(
                "INSERT INTO conversations (id, tenant_id, user_id, title) VALUES ($1,$2,$3,'Session') ON CONFLICT DO NOTHING",
                cid, principal.tenant_id, principal.user.id,
            )


def _workspace(svc: Services, principal: Principal, cid: str) -> Workspace:
    return Workspace(svc.settings.data_dir, principal.tenant_id, cid)


@router.post("/{cid}/files")
async def upload_file(
    cid: str,
    file: UploadFile = File(...),
    principal: Principal = Depends(require("assistant")),
    svc: Services = Depends(get_services),
) -> dict:
    data = await file.read()
    if len(data) > svc.settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, "File too large")
    await _ensure_conversation(svc, principal, cid)
    ws = _workspace(svc, principal, cid)
    name = safe_name(file.filename or "file")
    ws.write(name, data)
    markdown = extract_markdown(name, data) or ""
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute(
            """INSERT INTO session_files (tenant_id, conversation_id, name, size, content_type, markdown, source)
               VALUES ($1,$2,$3,$4,$5,$6,'upload')
               ON CONFLICT (conversation_id, name) DO UPDATE SET size=excluded.size, markdown=excluded.markdown""",
            principal.tenant_id, cid, name, len(data), file.content_type or "", markdown[:200_000],
        )
    await audit(svc, principal, "session.file.upload", name)
    return {"name": name, "size": len(data), "markdownChars": len(markdown),
            "preview": markdown[:600], "extracted": bool(markdown)}


@router.get("/{cid}/files")
async def list_files(cid: str, principal: Principal = Depends(require("assistant")), svc: Services = Depends(get_services)) -> dict:
    ws = _workspace(svc, principal, cid)
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch("SELECT name, source, size FROM session_files WHERE conversation_id = $1", cid)
    sources = {r["name"]: r["source"] for r in rows}
    files = [
        {"name": f.name, "size": f.size, "isImage": f.is_image, "source": sources.get(f.name, "generated")}
        for f in ws.list()
    ]
    return {"files": files}


@router.get("/{cid}/files/{name}/download")
async def download_file(cid: str, name: str, principal: Principal = Depends(require("assistant")), svc: Services = Depends(get_services)) -> Response:
    ws = _workspace(svc, principal, cid)
    if not ws.exists(name):
        raise HTTPException(404, "File not found")
    data = ws.read(name)
    return Response(content=data, headers={"Content-Disposition": f'attachment; filename="{safe_name(name)}"'})


class EditFile(BaseModel):
    content: str


@router.put("/{cid}/files/{name}")
async def edit_file(cid: str, name: str, body: EditFile, principal: Principal = Depends(require("assistant")), svc: Services = Depends(get_services)) -> dict:
    await _ensure_conversation(svc, principal, cid)
    ws = _workspace(svc, principal, cid)
    f = ws.write_text(name, body.content)
    return {"name": f.name, "size": f.size}


@router.delete("/{cid}/files/{name}")
async def delete_file(cid: str, name: str, principal: Principal = Depends(require("assistant")), svc: Services = Depends(get_services)) -> dict:
    ws = _workspace(svc, principal, cid)
    ws.delete(name)
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute("DELETE FROM session_files WHERE conversation_id=$1 AND name=$2", cid, safe_name(name))
    return {"ok": True}


class RunCode(BaseModel):
    code: str


@router.post("/{cid}/run")
async def run_code(cid: str, body: RunCode, principal: Principal = Depends(require("assistant")), svc: Services = Depends(get_services)) -> dict:
    await _ensure_conversation(svc, principal, cid)
    ws = _workspace(svc, principal, cid)
    result = run_python(ws.root, body.code)
    # Record generated files so they appear in the session file list.
    images: list[dict] = []
    async with svc.db.acquire(principal.tenant_id) as conn:
        for change in result.files:
            await conn.execute(
                """INSERT INTO session_files (tenant_id, conversation_id, name, size, source)
                   VALUES ($1,$2,$3,$4,'generated')
                   ON CONFLICT (conversation_id, name) DO UPDATE SET size=excluded.size""",
                principal.tenant_id, cid, change.name, change.size,
            )
            if change.is_image and change.size < 2_000_000:
                images.append({"name": change.name,
                               "dataUrl": "data:image/png;base64," + base64.b64encode(ws.read(change.name)).decode()})
    await audit(svc, principal, "session.code.run", f"rc={result.return_code}")
    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "returnCode": result.return_code,
        "timedOut": result.timed_out,
        "durationMs": result.duration_ms,
        "networkIsolated": result.network_isolated,
        "files": [{"name": f.name, "size": f.size, "isNew": f.is_new, "isImage": f.is_image} for f in result.files],
        "images": images,
    }
