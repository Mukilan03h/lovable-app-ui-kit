"""Artifacts: list, inspect, edit by instruction, and download the Office file."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from ...services import Services
from ..deps import Principal, audit, get_services, require

router = APIRouter(prefix="/api/artifacts", tags=["artifacts"])


@router.get("")
async def list_artifacts(principal: Principal = Depends(require("artifacts")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch(
            """SELECT a.id, a.title, a.kind, a.format, a.shared, a.pinned, a.current_version, a.sources,
                      extract(epoch FROM a.updated_at) AS updated_at, u.name AS author
               FROM artifacts a LEFT JOIN users u ON u.id = a.user_id
               WHERE a.user_id = $1 OR a.shared IN ('team','org')
               ORDER BY a.updated_at DESC LIMIT 100""",
            principal.user.id,
        )
    return {
        "artifacts": [
            {
                "id": str(r["id"]), "title": r["title"], "kind": r["kind"], "format": r["format"],
                "shared": r["shared"], "pinned": r["pinned"], "versions": r["current_version"],
                "sources": r["sources"], "updatedAt": r["updated_at"], "author": r["author"] or "Assistant",
            }
            for r in rows
        ]
    }


@router.get("/{artifact_id}")
async def get_artifact(artifact_id: str, principal: Principal = Depends(require("artifacts")), svc: Services = Depends(get_services)) -> dict:
    art = await svc.artifacts.get(principal.tenant_id, artifact_id)
    if not art:
        raise HTTPException(404, "Artifact not found")
    return {
        "id": art["id"], "title": art["title"], "kind": art["kind"], "format": art["format"],
        "version": art["current_version"], "spec": art["spec"], "versions": art["versions"],
    }


@router.get("/{artifact_id}/download")
async def download(artifact_id: str, principal: Principal = Depends(require("artifacts")), svc: Services = Depends(get_services)) -> Response:
    rendered = await svc.artifacts.render_bytes(principal.tenant_id, artifact_id)
    if not rendered:
        raise HTTPException(404, "Artifact not found")
    filename, data, media_type = rendered
    return Response(
        content=data, media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class PatchRequest(BaseModel):
    instruction: str


@router.post("/{artifact_id}/patch")
async def patch(artifact_id: str, body: PatchRequest, principal: Principal = Depends(require("artifacts")), svc: Services = Depends(get_services)) -> dict:
    result = await svc.artifacts.patch(principal.tenant_id, artifact_id, body.instruction)
    if not result:
        raise HTTPException(404, "Artifact not found")
    await audit(svc, principal, "artifact.patch", artifact_id)
    return result


class UpdateRequest(BaseModel):
    pinned: bool | None = None
    shared: str | None = None


@router.patch("/{artifact_id}")
async def update(artifact_id: str, body: UpdateRequest, principal: Principal = Depends(require("artifacts")), svc: Services = Depends(get_services)) -> dict:
    sets, args = [], []
    if body.pinned is not None:
        args.append(body.pinned); sets.append(f"pinned = ${len(args)}")
    if body.shared is not None:
        args.append(body.shared); sets.append(f"shared = ${len(args)}")
    if not sets:
        return {"ok": True}
    args.append(artifact_id)
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute(f"UPDATE artifacts SET {', '.join(sets)} WHERE id = ${len(args)}", *args)
    return {"ok": True}


@router.delete("/{artifact_id}")
async def delete(artifact_id: str, principal: Principal = Depends(require("artifacts")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute("DELETE FROM artifacts WHERE id = $1 AND user_id = $2", artifact_id, principal.user.id)
    return {"ok": True}
