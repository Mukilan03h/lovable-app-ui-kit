"""Admin console APIs: users, groups, workspace settings, SSO, evals, audit."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ...evals.runner import EvalRunner
from ...security import ROLE_PERMISSIONS, hash_password
from ...services import Services
from ..deps import Principal, audit, get_services, require

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/overview")
async def overview(principal: Principal = Depends(require("admin")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        users = await conn.fetchval("SELECT count(*) FROM users")
        groups = await conn.fetchval("SELECT count(*) FROM groups")
        connectors = await conn.fetchval("SELECT count(*) FROM connectors")
        stats = await svc.index.stats(conn)
        plan = await conn.fetchval("SELECT plan FROM tenants WHERE id = $1", principal.tenant_id)
    return {"users": users, "groups": groups, "connectors": connectors, "plan": plan,
            "documents": stats["documents"], "chunks": stats["chunks"],
            "llm": {"offline": svc.llm.offline, "models": {
                "small": svc.settings.model_small, "standard": svc.settings.model_standard, "deep": svc.settings.model_deep}}}


# ---- users & groups -------------------------------------------------------
@router.get("/users")
async def list_users(principal: Principal = Depends(require("admin")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch("SELECT id, email, name, role, title, avatar, disabled FROM users ORDER BY created_at")
    return {"users": [{"id": str(r["id"]), **{k: r[k] for k in ("email", "name", "role", "title", "avatar", "disabled")}} for r in rows]}


class CreateUser(BaseModel):
    email: str
    name: str
    role: str = "member"
    password: str | None = None


@router.post("/users")
async def create_user(body: CreateUser, principal: Principal = Depends(require("admin")), svc: Services = Depends(get_services)) -> dict:
    if body.role not in ROLE_PERMISSIONS:
        raise HTTPException(400, "Unknown role")
    pw = hash_password(body.password) if body.password else None
    async with svc.db.acquire(principal.tenant_id) as conn:
        uid = await conn.fetchval(
            "INSERT INTO users (tenant_id,email,name,role,password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id",
            principal.tenant_id, body.email, body.name, body.role, pw,
        )
    await audit(svc, principal, "user.create", body.email)
    return {"id": str(uid)}


class UpdateUser(BaseModel):
    role: str | None = None
    disabled: bool | None = None


@router.patch("/users/{user_id}")
async def update_user(user_id: str, body: UpdateUser, principal: Principal = Depends(require("admin")), svc: Services = Depends(get_services)) -> dict:
    sets, args = [], []
    if body.role:
        args.append(body.role); sets.append(f"role = ${len(args)}")
    if body.disabled is not None:
        args.append(body.disabled); sets.append(f"disabled = ${len(args)}")
    if sets:
        args.append(user_id)
        async with svc.db.acquire(principal.tenant_id) as conn:
            await conn.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = ${len(args)}", *args)
    await audit(svc, principal, "user.update", user_id)
    return {"ok": True}


@router.get("/groups")
async def list_groups(principal: Principal = Depends(require("admin")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch(
            "SELECT g.id, g.name, g.source, count(ug.user_id) AS members FROM groups g LEFT JOIN user_groups ug ON ug.group_id=g.id GROUP BY g.id ORDER BY g.name"
        )
    return {"groups": [{"id": str(r["id"]), "name": r["name"], "source": r["source"], "members": r["members"]} for r in rows]}


# ---- workspace settings (branding, security, routing, retention) ----------
@router.get("/settings/{key}")
async def get_ws_setting(key: str, principal: Principal = Depends(require("admin")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        row = await conn.fetchrow("SELECT value FROM workspace_settings WHERE key = $1", key)
    return {"key": key, "value": _load(row["value"]) if row else {}}


class WsSetting(BaseModel):
    value: dict


@router.put("/settings/{key}")
async def put_ws_setting(key: str, body: WsSetting, principal: Principal = Depends(require("admin")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute(
            """INSERT INTO workspace_settings (tenant_id, key, value) VALUES ($1,$2,$3)
               ON CONFLICT (tenant_id, key) DO UPDATE SET value = excluded.value""",
            principal.tenant_id, key, json.dumps(body.value),
        )
    await audit(svc, principal, "settings.update", key)
    return {"ok": True}


# ---- SSO ------------------------------------------------------------------
@router.get("/sso")
async def list_sso(principal: Principal = Depends(require("admin")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch("SELECT id, type, display_name, issuer, enabled FROM sso_providers ORDER BY created_at")
    return {"providers": [{"id": str(r["id"]), "type": r["type"], "name": r["display_name"], "issuer": r["issuer"], "enabled": r["enabled"]} for r in rows]}


class SsoBody(BaseModel):
    type: str = "oidc"
    display_name: str
    issuer: str | None = None
    client_id: str | None = None
    client_secret: str | None = None
    enabled: bool = False


@router.post("/sso")
async def create_sso(body: SsoBody, principal: Principal = Depends(require("admin")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        sid = await conn.fetchval(
            "INSERT INTO sso_providers (tenant_id,type,display_name,issuer,client_id,client_secret,enabled) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
            principal.tenant_id, body.type, body.display_name, body.issuer, body.client_id, body.client_secret, body.enabled,
        )
    await audit(svc, principal, "sso.create", body.display_name)
    return {"id": str(sid)}


# ---- verified answers -----------------------------------------------------
@router.get("/verified")
async def list_verified(principal: Principal = Depends(require("admin")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch("SELECT id, question, answer, category FROM verified_answers ORDER BY created_at DESC")
    return {"answers": [{"id": str(r["id"]), "question": r["question"], "answer": r["answer"], "category": r["category"]} for r in rows]}


class VerifiedBody(BaseModel):
    question: str
    answer: str
    category: str = ""


@router.post("/verified")
async def add_verified(body: VerifiedBody, principal: Principal = Depends(require("admin")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        vid = await conn.fetchval(
            "INSERT INTO verified_answers (tenant_id,question,answer,category,owner_id) VALUES ($1,$2,$3,$4,$5) RETURNING id",
            principal.tenant_id, body.question, body.answer, body.category, principal.user.id,
        )
    return {"id": str(vid)}


# ---- evals ----------------------------------------------------------------
@router.post("/evals/run")
async def run_eval(principal: Principal = Depends(require("admin")), svc: Services = Depends(get_services)) -> dict:
    runner = EvalRunner(svc)
    return await runner.run(principal.tenant_id, principal.principals)


@router.get("/evals")
async def eval_history(principal: Principal = Depends(require("admin")), svc: Services = Depends(get_services)) -> dict:
    runner = EvalRunner(svc)
    return {"runs": await runner.history(principal.tenant_id)}


# ---- audit ----------------------------------------------------------------
@router.get("/audit")
async def audit_log(limit: int = 50, principal: Principal = Depends(require("admin")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch(
            """SELECT a.action, a.target, extract(epoch FROM a.created_at) AS created_at, u.name
               FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT $1""",
            limit,
        )
    return {"log": [{"action": r["action"], "target": r["target"], "createdAt": r["created_at"], "user": r["name"] or "system"} for r in rows]}


def _load(value):
    return json.loads(value) if isinstance(value, str) else (value or {})
