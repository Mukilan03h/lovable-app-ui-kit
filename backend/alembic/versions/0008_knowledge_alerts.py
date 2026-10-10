"""knowledge alerts (saved searches with change detection)

Revision ID: 0008_knowledge_alerts
Revises: 0007_catalog_rooms
Create Date: 2026-10-10

A saved search a user subscribes to. On each check we re-run permission-aware
retrieval and compare the current top documents against the last snapshot to
report what is new or changed — the "notify me when knowledge about X changes"
capability. The snapshot is a per-alert map of doc_id -> last-seen updated_at.
"""

from __future__ import annotations

from alembic import op

revision = "0008_knowledge_alerts"
down_revision = "0007_catalog_rooms"
branch_labels = None
depends_on = None

_UP = """
CREATE TABLE IF NOT EXISTS saved_searches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  query        text NOT NULL,
  sources      jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_seen    jsonb NOT NULL DEFAULT '{}'::jsonb,   -- doc_id -> updated_at epoch
  last_checked timestamptz,
  enabled      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_searches_user_idx ON saved_searches (user_id, created_at);
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON saved_searches;
CREATE POLICY tenant_isolation ON saved_searches
  USING (tenant_id = current_setting('enaz.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('enaz.tenant_id', true)::uuid);
"""

_DOWN = "DROP TABLE IF EXISTS saved_searches;"


def upgrade() -> None:
    op.execute(_UP)


def downgrade() -> None:
    op.execute(_DOWN)
