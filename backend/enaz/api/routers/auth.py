"""Authentication: password login, demo role sign-in, session info, logout."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ...security import User, issue_token, principals_for, verify_password
from ...services import Services
from ..deps import Principal, authenticate, get_services, load_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str
    tenant: str | None = None


class RoleLoginRequest(BaseModel):
    role: str
    tenant: str | None = None


async def _resolve_tenant(svc: Services, slug: str | None) -> str:
    async with svc.db.acquire() as conn:
        tid = await conn.fetchval("SELECT id FROM tenants WHERE slug = $1", slug or svc.settings.default_tenant_slug)
    if tid is None:
        raise HTTPException(404, "Workspace not found")
    return str(tid)


def _session(user: User, tenant_id: str, svc: Services) -> dict:
    token = issue_token(user.id, tenant_id, svc.settings.secret_key, svc.settings.token_ttl_hours)
    return {"token": token, "user": user.public_dict(), "tenantId": tenant_id}


@router.post("/login")
async def login(body: LoginRequest, svc: Services = Depends(get_services)) -> dict:
    tenant_id = await _resolve_tenant(svc, body.tenant)
    async with svc.db.acquire(tenant_id) as conn:
        row = await conn.fetchrow(
            "SELECT id, password_hash FROM users WHERE lower(email) = lower($1) AND disabled = false", body.email
        )
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    user = await load_user(svc, tenant_id, str(row["id"]))
    assert user is not None
    return _session(user, tenant_id, svc)


@router.post("/demo-login")
async def demo_login(body: RoleLoginRequest, svc: Services = Depends(get_services)) -> dict:
    """Sign in as the first user with a role — powers the frontend role picker."""
    if not svc.settings.demo_mode:
        raise HTTPException(403, "Demo login is disabled")
    tenant_id = await _resolve_tenant(svc, body.tenant)
    async with svc.db.acquire(tenant_id) as conn:
        row = await conn.fetchrow(
            "SELECT id FROM users WHERE role = $1 AND disabled = false ORDER BY created_at LIMIT 1", body.role
        )
    if not row:
        raise HTTPException(404, f"No demo user with role '{body.role}'")
    user = await load_user(svc, tenant_id, str(row["id"]))
    assert user is not None
    return _session(user, tenant_id, svc)


@router.get("/me")
async def me(principal: Principal = Depends(authenticate)) -> dict:
    return {"user": principal.user.public_dict(), "tenantId": principal.tenant_id,
            "principals": principals_for(principal.user)}
