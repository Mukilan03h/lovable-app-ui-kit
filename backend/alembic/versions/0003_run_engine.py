"""self-owned durable agent run engine (jobs, events, receipts)

Revision ID: 0003_run_engine
Revises: 0002_release_a
Create Date: 2026-10-09

A durable run survives the chat closing and a worker restart. Jobs are claimed
with SELECT ... FOR UPDATE SKIP LOCKED under a lease (visibility timeout) so a
crashed worker's job is reclaimed. Completed steps are checkpointed so a resumed
run skips them, and every side effect writes a receipt keyed by an idempotency
id so a retry reconciles instead of double-acting. The event log is our own
AG-UI-aligned stream, replayable by sequence on reconnect. No third-party runtime.
"""

from __future__ import annotations

from alembic import op

revision = "0003_run_engine"
down_revision = "0002_release_a"
branch_labels = None
depends_on = None

_UP = """
CREATE TABLE IF NOT EXISTS agent_jobs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id       uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'queued',
     -- queued | running | awaiting_approval | paused | succeeded | failed | cancelled | interrupted
  task           text NOT NULL DEFAULT '',
  checkpoint     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- completed step names -> result refs
  result         jsonb NOT NULL DEFAULT '{}'::jsonb,
  error          text,
  idempotency_key text,
  budget         real NOT NULL DEFAULT 0,              -- 0 = no budget cap
  cost           real NOT NULL DEFAULT 0,
  attempts       integer NOT NULL DEFAULT 0,
  cancel_requested boolean NOT NULL DEFAULT false,
  lease_until    timestamptz,                          -- visibility timeout while running
  scheduled_for  timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  started_at     timestamptz,
  finished_at    timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS agent_jobs_claim_idx ON agent_jobs (status, scheduled_for);
ALTER TABLE agent_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON agent_jobs;
CREATE POLICY tenant_isolation ON agent_jobs
  USING (tenant_id = current_setting('enaz.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('enaz.tenant_id', true)::uuid);

CREATE TABLE IF NOT EXISTS agent_job_events (
  seq         bigserial PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id      uuid NOT NULL REFERENCES agent_jobs(id) ON DELETE CASCADE,
  event       jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_job_events_job_idx ON agent_job_events (job_id, seq);
ALTER TABLE agent_job_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON agent_job_events;
CREATE POLICY tenant_isolation ON agent_job_events
  USING (tenant_id = current_setting('enaz.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('enaz.tenant_id', true)::uuid);

CREATE TABLE IF NOT EXISTS agent_receipts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id      uuid NOT NULL REFERENCES agent_jobs(id) ON DELETE CASCADE,
  action_id   text NOT NULL,            -- idempotency key for one side effect
  step        text NOT NULL DEFAULT '',
  tool        text NOT NULL DEFAULT '',
  args        jsonb NOT NULL DEFAULT '{}'::jsonb,
  result      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status      text NOT NULL DEFAULT 'done',   -- done | failed | proposed
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, action_id)
);
ALTER TABLE agent_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON agent_receipts;
CREATE POLICY tenant_isolation ON agent_receipts
  USING (tenant_id = current_setting('enaz.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('enaz.tenant_id', true)::uuid);
"""


def upgrade() -> None:
    op.execute(_UP)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS agent_receipts")
    op.execute("DROP TABLE IF EXISTS agent_job_events")
    op.execute("DROP TABLE IF EXISTS agent_jobs")
