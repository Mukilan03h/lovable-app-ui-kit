"""Authentication (JWT), password hashing and role-based permissions.

The permission map mirrors `src/lib/auth.tsx` in the frontend so the UI and API
agree on who can do what. Document-level access is separate: see `principals_for`.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import time
from dataclasses import dataclass, field

import jwt

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "admin": {
        "assistant", "search", "connectors", "connectors:manage", "agents", "artifacts",
        "insights", "admin", "settings",
    },
    "manager": {"assistant", "search", "connectors", "agents", "artifacts", "insights", "settings"},
    "member": {"assistant", "search", "agents", "artifacts", "settings"},
    "client": {"assistant", "search", "artifacts", "settings"},
}

ROLE_LABEL = {"admin": "Admin", "manager": "Curator", "member": "Member", "client": "Guest"}

# Principal granted to every internal (non-guest) user. Guests only see documents
# shared with them explicitly or marked "external".
PUBLIC = "public"
EXTERNAL = "external"


@dataclass(frozen=True)
class User:
    id: str
    email: str
    name: str
    role: str
    title: str = ""
    avatar: str = ""
    groups: tuple[str, ...] = field(default_factory=tuple)

    def can(self, permission: str) -> bool:
        return permission in ROLE_PERMISSIONS.get(self.role, set())

    @property
    def principals(self) -> list[str]:
        return principals_for(self)

    def public_dict(self) -> dict:
        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "role": self.role,
            "roleLabel": ROLE_LABEL.get(self.role, self.role),
            "title": self.title,
            "avatar": self.avatar,
            "groups": list(self.groups),
            "permissions": sorted(ROLE_PERMISSIONS.get(self.role, set())),
        }


def principals_for(user: User) -> list[str]:
    principals = [f"user:{user.email.lower()}", EXTERNAL]
    principals += [f"group:{g.lower()}" for g in user.groups]
    if user.role != "client":
        principals.append(PUBLIC)
    return sorted(set(principals))


def acl_key(principals: list[str]) -> str:
    """Stable hash of a principal set, used to scope caches by permissions."""
    return hashlib.sha256("|".join(sorted(principals)).encode()).hexdigest()[:24]


_ITERATIONS = 240_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITERATIONS)
    return f"pbkdf2${_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        _, iterations, salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations))
    return hmac.compare_digest(digest.hex(), digest_hex)


def issue_token(user_id: str, tenant_id: str, secret: str, ttl_hours: int) -> str:
    now = int(time.time())
    return jwt.encode(
        {"sub": user_id, "tid": tenant_id, "iat": now, "exp": now + ttl_hours * 3600},
        secret,
        algorithm="HS256",
    )


def decode_token(token: str, secret: str) -> tuple[str, str] | None:
    """Return (user_id, tenant_id) or None."""
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    sub, tid = payload.get("sub"), payload.get("tid")
    if isinstance(sub, str) and isinstance(tid, str):
        return sub, tid
    return None


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def generate_api_token() -> tuple[str, str, str]:
    """Return (raw, prefix, hash) for a new personal access token."""
    raw = "enaz_" + os.urandom(24).hex()
    return raw, raw[:12], hash_token(raw)
