"""SCIM 2.0 provisioning (Users and Groups) for identity-provider sync.

Authenticated with a SCIM-scoped API token. This is one of the features Onyx
gates behind its paid Enterprise tier; here it is part of the open core.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from ...services import Services
from ..deps import Principal, authenticate, get_services

router = APIRouter(prefix="/scim/v2", tags=["scim"])

USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User"
GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group"
LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse"


async def scim_auth(principal: Principal = Depends(authenticate)) -> Principal:
    scopes = principal.token_scopes or []
    if "scim" not in scopes and "*" not in scopes:
        raise HTTPException(403, "A SCIM-scoped token is required")
    return principal


def _user_resource(row: dict) -> dict:
    name_parts = (row["name"] or "").split(" ", 1)
    return {
        "schemas": [USER_SCHEMA],
        "id": str(row["id"]),
        "userName": row["email"],
        "name": {"givenName": name_parts[0], "familyName": name_parts[1] if len(name_parts) > 1 else ""},
        "displayName": row["name"],
        "emails": [{"value": row["email"], "primary": True}],
        "active": not row["disabled"],
        "externalId": row.get("external_id"),
    }


@router.get("/Users")
async def list_users(principal: Principal = Depends(scim_auth), svc: Services = Depends(get_services)) -> JSONResponse:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch("SELECT id, email, name, disabled, external_id FROM users ORDER BY created_at")
    resources = [_user_resource(dict(r)) for r in rows]
    return JSONResponse({"schemas": [LIST_SCHEMA], "totalResults": len(resources),
                         "startIndex": 1, "itemsPerPage": len(resources), "Resources": resources})


@router.get("/Users/{user_id}")
async def get_user(user_id: str, principal: Principal = Depends(scim_auth), svc: Services = Depends(get_services)) -> JSONResponse:
    async with svc.db.acquire(principal.tenant_id) as conn:
        row = await conn.fetchrow("SELECT id, email, name, disabled, external_id FROM users WHERE id = $1", user_id)
    if not row:
        raise HTTPException(404, "User not found")
    return JSONResponse(_user_resource(dict(row)))


@router.post("/Users")
async def create_user(request: Request, principal: Principal = Depends(scim_auth), svc: Services = Depends(get_services)) -> JSONResponse:
    body = await request.json()
    email = body.get("userName") or (body.get("emails") or [{}])[0].get("value")
    if not email:
        raise HTTPException(400, "userName is required")
    name = body.get("displayName") or " ".join(
        filter(None, [(body.get("name") or {}).get("givenName"), (body.get("name") or {}).get("familyName")])
    ) or email
    async with svc.db.acquire(principal.tenant_id) as conn:
        existing = await conn.fetchrow("SELECT id, email, name, disabled, external_id FROM users WHERE lower(email)=lower($1)", email)
        if existing:
            return JSONResponse(_user_resource(dict(existing)), status_code=200)
        row = await conn.fetchrow(
            "INSERT INTO users (tenant_id,email,name,role,external_id,disabled) VALUES ($1,$2,$3,'member',$4,$5) RETURNING id, email, name, disabled, external_id",
            principal.tenant_id, email, name, body.get("externalId"), not body.get("active", True),
        )
    return JSONResponse(_user_resource(dict(row)), status_code=201)


@router.patch("/Users/{user_id}")
async def patch_user(user_id: str, request: Request, principal: Principal = Depends(scim_auth), svc: Services = Depends(get_services)) -> JSONResponse:
    body = await request.json()
    active = None
    for op in body.get("Operations", []):
        if op.get("path") == "active" or "active" in (op.get("value") or {}):
            active = op.get("value") if isinstance(op.get("value"), bool) else (op.get("value") or {}).get("active")
    if active is not None:
        async with svc.db.acquire(principal.tenant_id) as conn:
            await conn.execute("UPDATE users SET disabled = $2 WHERE id = $1", user_id, not active)
    async with svc.db.acquire(principal.tenant_id) as conn:
        row = await conn.fetchrow("SELECT id, email, name, disabled, external_id FROM users WHERE id = $1", user_id)
    if not row:
        raise HTTPException(404, "User not found")
    return JSONResponse(_user_resource(dict(row)))


@router.delete("/Users/{user_id}", status_code=204)
async def delete_user(user_id: str, principal: Principal = Depends(scim_auth), svc: Services = Depends(get_services)) -> None:
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute("UPDATE users SET disabled = true WHERE id = $1", user_id)


@router.get("/Groups")
async def list_groups(principal: Principal = Depends(scim_auth), svc: Services = Depends(get_services)) -> JSONResponse:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch("SELECT id, name FROM groups ORDER BY name")
    resources = [{"schemas": [GROUP_SCHEMA], "id": str(r["id"]), "displayName": r["name"]} for r in rows]
    return JSONResponse({"schemas": [LIST_SCHEMA], "totalResults": len(resources),
                         "startIndex": 1, "itemsPerPage": len(resources), "Resources": resources})


@router.post("/Groups")
async def create_group(request: Request, principal: Principal = Depends(scim_auth), svc: Services = Depends(get_services)) -> JSONResponse:
    body = await request.json()
    name = body.get("displayName")
    if not name:
        raise HTTPException(400, "displayName is required")
    async with svc.db.acquire(principal.tenant_id) as conn:
        gid = await conn.fetchval(
            "INSERT INTO groups (tenant_id,name,source,external_id) VALUES ($1,$2,'scim',$3) ON CONFLICT (tenant_id,name) DO UPDATE SET source='scim' RETURNING id",
            principal.tenant_id, name, body.get("externalId"),
        )
    return JSONResponse({"schemas": [GROUP_SCHEMA], "id": str(gid), "displayName": name}, status_code=201)
