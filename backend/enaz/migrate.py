"""Run Alembic migrations programmatically from the app.

The app runs ``alembic upgrade head`` at startup so a fresh deployment is
schema-complete before serving. Alembic is synchronous (psycopg3), so callers in
async code run this via ``asyncio.to_thread``.
"""

from __future__ import annotations

import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, pool

_BACKEND_DIR = Path(__file__).resolve().parent.parent  # .../backend


def _alembic_config(admin_dsn: str, embed_dim: int) -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", str(_BACKEND_DIR / "alembic"))
    # env.py reads the URL and embedding dim from the environment, so pass them there.
    os.environ["ENAZ_ADMIN_DATABASE_URL"] = admin_dsn
    os.environ["ENAZ_EMBED_DIM"] = str(embed_dim)
    cfg.attributes["embed_dim"] = embed_dim
    return cfg


def _driver_url(admin_dsn: str) -> str:
    if admin_dsn.startswith("postgresql://"):
        return "postgresql+psycopg://" + admin_dsn[len("postgresql://"):]
    if admin_dsn.startswith("postgres://"):
        return "postgresql+psycopg://" + admin_dsn[len("postgres://"):]
    return admin_dsn


def run_upgrade(admin_dsn: str, embed_dim: int) -> list[str]:
    """Upgrade to head. Returns the revisions that were applied (for logging)."""
    cfg = _alembic_config(admin_dsn, embed_dim)
    before = _current_revision(admin_dsn)
    command.upgrade(cfg, "head")
    after = _current_revision(admin_dsn)
    if before == after:
        return []
    script = ScriptDirectory.from_config(cfg)
    applied: list[str] = []
    for rev in script.walk_revisions(base="base", head="head"):
        applied.append(rev.revision)
        if rev.revision == before:
            break
    return list(reversed(applied))


def _current_revision(admin_dsn: str) -> str | None:
    engine = create_engine(_driver_url(admin_dsn), poolclass=pool.NullPool, future=True)
    try:
        with engine.connect() as conn:
            return MigrationContext.configure(conn).get_current_revision()
    finally:
        engine.dispose()
