"""baseline: full Enaz schema (RLS, connectors, skills, shares, connector engine)

Revision ID: 0001_baseline
Revises:
Create Date: 2026-10-09

This baseline applies the project's existing SQL schema files, which are all
idempotent (CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, DROP POLICY IF
EXISTS before CREATE POLICY). That makes it safe to run against both a fresh
database and one already provisioned by the earlier bespoke migration runner:
on an existing database every statement is a no-op and Alembic simply records
the version. Subsequent schema changes are authored as new Alembic revisions.
"""

from __future__ import annotations

from pathlib import Path

from alembic import context, op

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None

# The ordered SQL files that make up the baseline schema.
_FILES = [
    "0001_init.sql",
    "0002_rls.sql",
    "0003_session_files.sql",
    "0004_skills_shares_actions.sql",
    "0005_connector_engine.sql",
]


def _sql_dir() -> Path:
    import enaz

    return Path(enaz.__file__).resolve().parent / "migrations"


def upgrade() -> None:
    embed_dim = context.config.attributes.get("embed_dim", 512)
    sql_dir = _sql_dir()
    for name in _FILES:
        raw = (sql_dir / name).read_text()
        op.execute(raw.replace("{{EMBED_DIM}}", str(embed_dim)))


def downgrade() -> None:
    # The baseline is the floor of the schema; dropping it would destroy all data.
    raise NotImplementedError("The baseline revision is not reversible.")
