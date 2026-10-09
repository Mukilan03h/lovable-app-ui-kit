"""Shareable chats.

Turn a conversation into a read-only capability link. The share id is an
unguessable UUID; anyone with the link can read the snapshot until the owner
revokes it. The sharer vouches for the content, so the public read does not
re-check per-viewer ACLs (the Notion/Glean "share by link" model) — it only
serves non-revoked snapshots.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ...services import Services
from ..deps import Principal, get_services, require

router = APIRouter(tags=["shares"])


class ShareBody(BaseModel):
    title: str = "Shared chat"
    turns: list[dict]


@router.post("/api/assistant/share")
async def create_share(
    body: ShareBody,
    principal: Principal = Depends(require("assistant")),
    svc: Services = Depends(get_services),
) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        sid = await conn.fetchval(
            """INSERT INTO shared_chats (tenant_id, created_by, author_name, title, snapshot)
               VALUES ($1,$2,$3,$4,$5) RETURNING id""",
            principal.tenant_id, principal.user.id, principal.user.name, body.title[:200],
            json.dumps(body.turns),
        )
    return {"id": str(sid), "url": f"/shared/{sid}"}


@router.get("/api/assistant/shares")
async def list_shares(principal: Principal = Depends(require("assistant")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch(
            """SELECT id, title, views, revoked, extract(epoch FROM created_at) AS created_at
               FROM shared_chats WHERE created_by = $1 ORDER BY created_at DESC LIMIT 100""",
            principal.user.id,
        )
    return {"shares": [
        {"id": str(r["id"]), "title": r["title"], "views": r["views"], "revoked": r["revoked"],
         "createdAt": r["created_at"], "url": f"/shared/{r['id']}"}
        for r in rows
    ]}


@router.post("/api/assistant/shares/{share_id}/revoke")
async def revoke_share(share_id: str, principal: Principal = Depends(require("assistant")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute("UPDATE shared_chats SET revoked = true WHERE id = $1 AND created_by = $2",
                           share_id, principal.user.id)
    return {"ok": True}


@router.get("/api/shared/{share_id}")
async def read_share(share_id: str, svc: Services = Depends(get_services)) -> dict:
    """Public read — the link is the capability. No auth, no ACL re-check."""
    async with svc.db.admin() as conn:
        row = await conn.fetchrow(
            """SELECT title, author_name, snapshot, revoked, extract(epoch FROM created_at) AS created_at
               FROM shared_chats WHERE id = $1""",
            share_id,
        )
        if not row or row["revoked"]:
            raise HTTPException(404, "This shared chat is not available")
        await conn.execute("UPDATE shared_chats SET views = views + 1 WHERE id = $1", share_id)
    snapshot = row["snapshot"]
    if isinstance(snapshot, str):
        snapshot = json.loads(snapshot)
    return {"title": row["title"], "author": row["author_name"], "turns": snapshot, "createdAt": row["created_at"]}
