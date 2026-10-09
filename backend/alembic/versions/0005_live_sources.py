"""live business-data sources (read-only, queried at answer time)

Revision ID: 0005_live_sources
Revises: 0004_agent_memory
Create Date: 2026-10-09

A live source is a read-only window onto current records (a SQL view or a REST
endpoint) that is queried at answer time rather than indexed, so answers can
combine documents with up-to-the-moment data and report when each source was
last checked. Read-only by construction; a small, admin-registered set.
"""

from __future__ import annotations

from alembic import op

revision = "0005_live_sources"
down_revision = "0004_agent_memory"
branch_labels = None
depends_on = None

_UP = """
CREATE TABLE IF NOT EXISTS live_sources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  kind        text NOT NULL DEFAULT 'sql',   -- sql | rest
  description text NOT NULL DEFAULT '',
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- sql: {query, read_dsn?}; rest: {url, auth_header?, items_path?}
  enabled     boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE live_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON live_sources;
CREATE POLICY tenant_isolation ON live_sources
  USING (tenant_id = current_setting('enaz.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('enaz.tenant_id', true)::uuid);
"""


def upgrade() -> None:
    op.execute(_UP)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS live_sources")
