"""Request authentication, tenant resolution, RBAC and rate limiting."""

from __future__ import annotations

import time
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request

from ..security import User, decode_token, hash_token, principals_for
from ..services import Services


@dataclass
class Principal:
    user: User
    tenant_id: str
    token_scopes: list[str] | None = None  # set for API-token auth

    @property
    def principals(self) -> list[str]:
        return principals_for(self.user)


def get_services(request: Request) -> Services:
    return request.app.state.services


async def load_user(svc: Services, tenant_id: str, user_id: str) -> User | None:
    async with svc.db.acquire(tenant_id) as conn:
        row = await conn.fetchrow("SELECT * FROM users WHERE id = $1 AND disabled = false", user_id)
        if not row:
            return None
        groups = await conn.fetch(
            "SELECT g.name FROM groups g JOIN user_groups ug ON ug.group_id = g.id WHERE ug.user_id = $1", user_id
        )
    return User(
        id=str(row["id"]), email=row["email"], name=row["name"], role=row["role"],
        title=row["title"], avatar=row["avatar"], groups=tuple(g["name"] for g in groups),
    )


async def authenticate(request: Request, svc: Services = Depends(get_services)) -> Principal:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = auth[7:].strip()

    if token.startswith("enaz_"):
        # Personal access / service / SCIM token.
        async with svc.db.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT tenant_id, user_id, scopes, kind, token_id FROM enaz_resolve_token($1)", hash_token(token)
            )
        if not row:
            raise HTTPException(401, "Invalid or expired token")
        tenant_id = str(row["tenant_id"])
        async with svc.db.acquire(tenant_id) as conn:
            await conn.execute("UPDATE api_tokens SET last_used = now() WHERE id = $1", row["token_id"])
        user = await load_user(svc, tenant_id, str(row["user_id"])) if row["user_id"] else None
        if user is None:
            raise HTTPException(401, "Token user not found")
        scopes = row["scopes"] if isinstance(row["scopes"], list) else []
        return Principal(user=user, tenant_id=tenant_id, token_scopes=scopes)

    decoded = decode_token(token, svc.settings.secret_key)
    if not decoded:
        raise HTTPException(401, "Invalid or expired session")
    user_id, tenant_id = decoded
    user = await load_user(svc, tenant_id, user_id)
    if user is None:
        raise HTTPException(401, "Session user not found")
    await _rate_limit(svc, tenant_id, user_id)
    return Principal(user=user, tenant_id=tenant_id)


def require(permission: str):
    async def dep(principal: Principal = Depends(authenticate)) -> Principal:
        if not principal.user.can(permission):
            raise HTTPException(403, f"Your role lacks the '{permission}' permission")
        if principal.token_scopes is not None and permission not in principal.token_scopes and "*" not in principal.token_scopes:
            raise HTTPException(403, f"Token is not scoped for '{permission}'")
        return principal

    return dep


# ---- rate limiting (Redis, with in-process fallback) ----------------------
_local_buckets: dict[str, list[float]] = {}


async def _rate_limit(svc: Services, tenant_id: str, user_id: str) -> None:
    limit = svc.settings.rate_limit_per_minute
    if limit <= 0:
        return
    key = f"{tenant_id}:{user_id}"
    redis = getattr(svc, "redis", None)
    now = time.time()
    if redis is not None:
        rkey = f"rl:{key}:{int(now // 60)}"
        count = await redis.incr(rkey)
        if count == 1:
            await redis.expire(rkey, 90)
        if count > limit:
            raise HTTPException(429, "Rate limit exceeded")
        return
    bucket = [t for t in _local_buckets.get(key, []) if now - t < 60]
    if len(bucket) >= limit:
        raise HTTPException(429, "Rate limit exceeded")
    bucket.append(now)
    _local_buckets[key] = bucket


async def audit(svc: Services, principal: Principal, action: str, target: str = "", detail: dict | None = None) -> None:
    import json

    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute(
            "INSERT INTO audit_log (tenant_id, user_id, action, target, detail) VALUES ($1,$2,$3,$4,$5)",
            principal.tenant_id, principal.user.id, action, target, json.dumps(detail or {}),
        )
