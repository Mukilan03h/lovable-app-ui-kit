"""scoped agent memory (personal / agent / shared)

Revision ID: 0004_agent_memory
Revises: 0003_run_engine
Create Date: 2026-10-09

Memory gains a scope so it can be personal (one user), agent (one agent's
learned preferences) or shared (the whole workspace). Memory is user-visible,
editable and deletable, and is injected into agent runs — so deleting a memory
affects later runs. user_id becomes nullable for agent/shared memory.
"""

from __future__ import annotations

from alembic import op

revision = "0004_agent_memory"
down_revision = "0003_run_engine"
branch_labels = None
depends_on = None

_UP = """
ALTER TABLE memories ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'personal';
    -- personal | agent | shared
ALTER TABLE memories ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES agents(id) ON DELETE CASCADE;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS use_in_runs boolean NOT NULL DEFAULT true;
ALTER TABLE memories ALTER COLUMN user_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS memories_scope_idx ON memories (tenant_id, scope, agent_id);
"""

_DOWN = """
DROP INDEX IF EXISTS memories_scope_idx;
ALTER TABLE memories DROP COLUMN IF EXISTS use_in_runs;
ALTER TABLE memories DROP COLUMN IF EXISTS agent_id;
ALTER TABLE memories DROP COLUMN IF EXISTS scope;
"""


def upgrade() -> None:
    op.execute(_UP)


def downgrade() -> None:
    op.execute(_DOWN)
