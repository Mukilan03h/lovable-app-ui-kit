"""connected artifacts: link artifacts to their source docs + versions

Revision ID: 0006_connected_artifacts
Revises: 0005_live_sources
Create Date: 2026-10-09

An artifact remembers which documents it was built from and each document's
content hash at build time, plus the query that produced it. That lets us detect
when a source has changed and offer a diffed refresh instead of silently
overwriting the user's work.
"""

from __future__ import annotations

from alembic import op

revision = "0006_connected_artifacts"
down_revision = "0005_live_sources"
branch_labels = None
depends_on = None

_UP = """
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS source_query text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS artifact_sources (
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  artifact_id    uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  doc_id         uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  title          text NOT NULL DEFAULT '',
  built_hash     text NOT NULL DEFAULT '',   -- document content_hash when the artifact was built
  PRIMARY KEY (artifact_id, doc_id)
);
ALTER TABLE artifact_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON artifact_sources;
CREATE POLICY tenant_isolation ON artifact_sources
  USING (tenant_id = current_setting('enaz.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('enaz.tenant_id', true)::uuid);
"""


def upgrade() -> None:
    op.execute(_UP)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS artifact_sources")
    op.execute("ALTER TABLE artifacts DROP COLUMN IF EXISTS source_query")
