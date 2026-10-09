"""Async PostgreSQL access: connection pools, migrations and per-request tenant context.

Runtime queries go through the ``enaz_app`` role (subject to row-level security).
Every tenant-scoped query runs inside a transaction that sets ``enaz.tenant_id``;
the RLS policies in migration 0002 then restrict rows to that tenant. Migrations
and cross-tenant seeding use the owner DSN, which bypasses RLS.
"""

from __future__ import annotations

import re
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncIterator, Iterable

import asyncpg
from pgvector.asyncpg import register_vector

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def new_uuid() -> str:
    return str(uuid.uuid4())


import json as _json


def _jsonb_encoder(value):
    # Accept either a pre-serialized string or a Python object.
    return value if isinstance(value, str) else _json.dumps(value, default=str)


async def _init_connection(conn: asyncpg.Connection) -> None:
    await register_vector(conn)
    # Decode jsonb/json to Python objects; encode objects (or pass through strings).
    for typename in ("jsonb", "json"):
        await conn.set_type_codec(typename, encoder=_jsonb_encoder, decoder=_json.loads, schema="pg_catalog")


class Database:
    def __init__(self, app_dsn: str, admin_dsn: str, embedding_dim: int, pool_min: int = 2, pool_max: int = 16):
        self.app_dsn = _normalize(app_dsn)
        self.admin_dsn = _normalize(admin_dsn)
        self.embedding_dim = embedding_dim
        self._pool_min = pool_min
        self._pool_max = pool_max
        self.pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        self.pool = await asyncpg.create_pool(
            self.app_dsn, min_size=self._pool_min, max_size=self._pool_max, init=_init_connection
        )

    async def close(self) -> None:
        if self.pool:
            await self.pool.close()
            self.pool = None

    # ---- migrations -------------------------------------------------------

    async def migrate(self) -> list[str]:
        """Run Alembic migrations to head (synchronous Alembic, off the event loop)."""
        import asyncio

        from .migrate import run_upgrade

        return await asyncio.to_thread(run_upgrade, self.admin_dsn, self.embedding_dim)

    async def admin_execute(self, sql: str, *args: Any) -> None:
        conn = await asyncpg.connect(self.admin_dsn)
        try:
            await _init_connection(conn)
            await conn.execute(sql, *args)
        finally:
            await conn.close()

    # ---- connections ------------------------------------------------------

    @asynccontextmanager
    async def acquire(self, tenant_id: str | None = None) -> AsyncIterator[asyncpg.Connection]:
        """Acquire a pooled connection inside a transaction, scoped to a tenant.

        With a tenant id, RLS restricts every statement to that tenant. Without
        one, only non-tenant tables (tenants, schema_migrations, SECURITY DEFINER
        functions) should be touched.
        """
        assert self.pool is not None, "Database.connect() was not called"
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                if tenant_id is not None:
                    await conn.execute("SELECT set_config('enaz.tenant_id', $1, true)", str(tenant_id))
                yield conn

    @asynccontextmanager
    async def admin(self) -> AsyncIterator[asyncpg.Connection]:
        conn = await asyncpg.connect(self.admin_dsn)
        try:
            await _init_connection(conn)
            async with conn.transaction():
                yield conn
        finally:
            await conn.close()


def _normalize(dsn: str) -> str:
    # asyncpg wants postgresql://, not postgresql+driver://
    return re.sub(r"^postgresql\+\w+://", "postgresql://", dsn)


# ---- row helpers ----------------------------------------------------------

def record_to_dict(row: asyncpg.Record | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def records_to_dicts(rows: Iterable[asyncpg.Record]) -> list[dict[str, Any]]:
    return [dict(r) for r in rows]
