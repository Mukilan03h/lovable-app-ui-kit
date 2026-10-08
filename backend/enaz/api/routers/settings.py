"""User settings: profile, appearance/chat prefs, memory, shortcuts, API tokens."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ...security import generate_api_token
from ...services import Services
from ..deps import Principal, authenticate, get_services

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
async def get_settings(principal: Principal = Depends(authenticate), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        row = await conn.fetchrow("SELECT settings FROM user_settings WHERE user_id = $1", principal.user.id)
    return {"profile": principal.user.public_dict(), "settings": _load(row["settings"]) if row else {}}


class SettingsBody(BaseModel):
    settings: dict


@router.put("")
async def put_settings(body: SettingsBody, principal: Principal = Depends(authenticate), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute(
            """INSERT INTO user_settings (tenant_id, user_id, settings) VALUES ($1,$2,$3)
               ON CONFLICT (user_id) DO UPDATE SET settings = excluded.settings""",
            principal.tenant_id, principal.user.id, json.dumps(body.settings),
        )
    return {"ok": True}


class ProfileBody(BaseModel):
    name: str | None = None
    title: str | None = None


@router.put("/profile")
async def update_profile(body: ProfileBody, principal: Principal = Depends(authenticate), svc: Services = Depends(get_services)) -> dict:
    sets, args = [], []
    if body.name:
        args.append(body.name); sets.append(f"name = ${len(args)}")
    if body.title is not None:
        args.append(body.title); sets.append(f"title = ${len(args)}")
    if sets:
        args.append(principal.user.id)
        async with svc.db.acquire(principal.tenant_id) as conn:
            await conn.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = ${len(args)}", *args)
    return {"ok": True}


# ---- memory ---------------------------------------------------------------
@router.get("/memory")
async def get_memory(principal: Principal = Depends(authenticate), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch("SELECT id, text, source FROM memories WHERE user_id=$1 ORDER BY created_at DESC", principal.user.id)
    return {"memories": [{"id": str(r["id"]), "text": r["text"], "source": r["source"]} for r in rows]}


class MemoryBody(BaseModel):
    text: str


@router.post("/memory")
async def add_memory(body: MemoryBody, principal: Principal = Depends(authenticate), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        mid = await conn.fetchval(
            "INSERT INTO memories (tenant_id,user_id,text) VALUES ($1,$2,$3) RETURNING id",
            principal.tenant_id, principal.user.id, body.text,
        )
    return {"id": str(mid)}


@router.delete("/memory/{memory_id}")
async def delete_memory(memory_id: str, principal: Principal = Depends(authenticate), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute("DELETE FROM memories WHERE id=$1 AND user_id=$2", memory_id, principal.user.id)
    return {"ok": True}


# ---- prompt shortcuts -----------------------------------------------------
@router.get("/shortcuts")
async def get_shortcuts(principal: Principal = Depends(authenticate), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch(
            "SELECT id, command, prompt, shared FROM shortcuts WHERE user_id=$1 OR shared=true ORDER BY command", principal.user.id
        )
    return {"shortcuts": [{"id": str(r["id"]), "command": r["command"], "prompt": r["prompt"], "shared": r["shared"]} for r in rows]}


class ShortcutBody(BaseModel):
    command: str
    prompt: str
    shared: bool = False


@router.post("/shortcuts")
async def add_shortcut(body: ShortcutBody, principal: Principal = Depends(authenticate), svc: Services = Depends(get_services)) -> dict:
    command = body.command if body.command.startswith("/") else f"/{body.command}"
    async with svc.db.acquire(principal.tenant_id) as conn:
        sid = await conn.fetchval(
            "INSERT INTO shortcuts (tenant_id,user_id,command,prompt,shared) VALUES ($1,$2,$3,$4,$5) RETURNING id",
            principal.tenant_id, principal.user.id, command, body.prompt, body.shared,
        )
    return {"id": str(sid), "command": command}


@router.delete("/shortcuts/{shortcut_id}")
async def delete_shortcut(shortcut_id: str, principal: Principal = Depends(authenticate), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute("DELETE FROM shortcuts WHERE id=$1 AND user_id=$2", shortcut_id, principal.user.id)
    return {"ok": True}


# ---- API tokens + MCP -----------------------------------------------------
@router.get("/tokens")
async def list_tokens(principal: Principal = Depends(authenticate), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch(
            "SELECT id, name, prefix, scopes, extract(epoch FROM created_at) AS created_at, extract(epoch FROM expires_at) AS expires_at, extract(epoch FROM last_used) AS last_used FROM api_tokens WHERE user_id=$1 AND kind='user' ORDER BY created_at DESC",
            principal.user.id,
        )
    base = svc.settings.cors_origins[0] if svc.settings.cors_origins else ""
    return {
        "mcpUrl": "/api/mcp",
        "tokens": [
            {"id": str(r["id"]), "name": r["name"], "prefix": r["prefix"], "scopes": _load(r["scopes"]),
             "createdAt": r["created_at"], "expiresAt": r["expires_at"], "lastUsed": r["last_used"]}
            for r in rows
        ],
    }


class TokenBody(BaseModel):
    name: str
    scopes: list[str] = ["search"]
    expiresDays: int | None = None


@router.post("/tokens")
async def create_token(body: TokenBody, principal: Principal = Depends(authenticate), svc: Services = Depends(get_services)) -> dict:
    raw, prefix, token_hash = generate_api_token()
    expires = f"now() + interval '{int(body.expiresDays)} days'" if body.expiresDays else "NULL"
    async with svc.db.acquire(principal.tenant_id) as conn:
        tid = await conn.fetchval(
            f"INSERT INTO api_tokens (tenant_id,user_id,name,token_hash,prefix,scopes,expires_at) VALUES ($1,$2,$3,$4,$5,$6,{expires}) RETURNING id",
            principal.tenant_id, principal.user.id, body.name, token_hash, prefix, json.dumps(body.scopes),
        )
    return {"id": str(tid), "token": raw, "prefix": prefix}


@router.delete("/tokens/{token_id}")
async def revoke_token(token_id: str, principal: Principal = Depends(authenticate), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute("DELETE FROM api_tokens WHERE id=$1 AND user_id=$2", token_id, principal.user.id)
    return {"ok": True}


def _load(value):
    return json.loads(value) if isinstance(value, str) else (value or {})
