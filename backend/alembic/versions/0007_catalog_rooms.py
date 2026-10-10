"""agent catalog publishing + shared task rooms

Revision ID: 0007_catalog_rooms
Revises: 0006_connected_artifacts
Create Date: 2026-10-09

Agents gain a `published` flag so an approved set can be discovered in a catalog
with ownership and metrics. Task rooms let colleagues collaborate on a task:
members, messages/comments (optionally on an artifact) and decision assignments,
each gated by room membership while document/artifact access stays per-user.
"""

from __future__ import annotations

from alembic import op

revision = "0007_catalog_rooms"
down_revision = "0006_connected_artifacts"
branch_labels = None
depends_on = None

_UP = """
ALTER TABLE agents ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS task_rooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  task        text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'open',    -- open | resolved
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE task_rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON task_rooms;
CREATE POLICY tenant_isolation ON task_rooms
  USING (tenant_id = current_setting('enaz.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('enaz.tenant_id', true)::uuid);

CREATE TABLE IF NOT EXISTS room_members (
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  room_id    uuid NOT NULL REFERENCES task_rooms(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'member',   -- owner | member
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON room_members;
CREATE POLICY tenant_isolation ON room_members
  USING (tenant_id = current_setting('enaz.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('enaz.tenant_id', true)::uuid);

CREATE TABLE IF NOT EXISTS room_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  room_id     uuid NOT NULL REFERENCES task_rooms(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  author_name text NOT NULL DEFAULT '',
  kind        text NOT NULL DEFAULT 'comment', -- comment | decision | handoff
  body        text NOT NULL DEFAULT '',
  artifact_id uuid REFERENCES artifacts(id) ON DELETE SET NULL,
  assignee    text NOT NULL DEFAULT '',        -- for decision/handoff
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS room_messages_room_idx ON room_messages (room_id, created_at);
ALTER TABLE room_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON room_messages;
CREATE POLICY tenant_isolation ON room_messages
  USING (tenant_id = current_setting('enaz.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('enaz.tenant_id', true)::uuid);
"""

_DOWN = """
DROP TABLE IF EXISTS room_messages;
DROP TABLE IF EXISTS room_members;
DROP TABLE IF EXISTS task_rooms;
ALTER TABLE agents DROP COLUMN IF EXISTS published;
"""


def upgrade() -> None:
    op.execute(_UP)


def downgrade() -> None:
    op.execute(_DOWN)
