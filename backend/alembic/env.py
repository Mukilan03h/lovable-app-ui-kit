"""Alembic environment — synchronous, via psycopg3.

The DB URL and the embedding dimension come from ENAZ settings (or env vars),
so migrations run the same way in dev, CI and production. Migrations execute as
the admin/owner role (not the RLS-restricted app role).
"""

from __future__ import annotations

import os

from alembic import context
from sqlalchemy import create_engine, pool

# Enaz has no SQLAlchemy ORM models (schema is managed as SQL), so there is no
# target_metadata for autogenerate; revisions are authored explicitly.
target_metadata = None


def _admin_url() -> str:
    url = os.environ.get("ENAZ_ADMIN_DATABASE_URL")
    if not url:
        try:
            from enaz.config import get_settings

            url = get_settings().admin_database_url
        except Exception:  # noqa: BLE001
            url = "postgresql://enaz@127.0.0.1:5433/enaz"
    # Alembic/SQLAlchemy needs an explicit driver; use psycopg (v3), which is installed.
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    elif url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    return url


def _embed_dim() -> int:
    val = os.environ.get("ENAZ_EMBED_DIM") or os.environ.get("ENAZ_EMBEDDING_DIM")
    if val:
        try:
            return int(val)
        except ValueError:
            pass
    try:
        from enaz.config import get_settings

        return get_settings().embedding_dim
    except Exception:  # noqa: BLE001
        return 512


def run_migrations_offline() -> None:
    context.configure(
        url=_admin_url(), target_metadata=target_metadata, literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_admin_url(), poolclass=pool.NullPool, future=True)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        # Make the embedding dimension available to revisions that need it.
        context.config.attributes["embed_dim"] = _embed_dim()
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
