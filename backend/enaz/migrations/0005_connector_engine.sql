-- Onyx-grade connector engine: separate credentials, index-attempt history,
-- scheduled incremental indexing, pause/resume, and document sets.

-- Credentials are stored apart from connectors so one secret can back several
-- connectors and secrets never travel in a connector's public config.
CREATE TABLE IF NOT EXISTS credentials (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type        text NOT NULL,
  name        text NOT NULL,
  secret      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON credentials;
CREATE POLICY tenant_isolation ON credentials
  USING (tenant_id = current_setting('enaz.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('enaz.tenant_id', true)::uuid);

-- Per-run indexing history (Onyx "index attempts"): one row per sync, with
-- status, per-category doc counts, timing and any error.
CREATE TABLE IF NOT EXISTS index_attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connector_id  uuid NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'in_progress',  -- in_progress | success | failed
  trigger       text NOT NULL DEFAULT 'manual',       -- manual | scheduled | initial
  new_docs      integer NOT NULL DEFAULT 0,
  updated_docs  integer NOT NULL DEFAULT 0,
  removed_docs  integer NOT NULL DEFAULT 0,
  total_docs    integer NOT NULL DEFAULT 0,
  error         text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);
CREATE INDEX IF NOT EXISTS index_attempts_connector_idx ON index_attempts (connector_id, started_at DESC);
ALTER TABLE index_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON index_attempts;
CREATE POLICY tenant_isolation ON index_attempts
  USING (tenant_id = current_setting('enaz.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('enaz.tenant_id', true)::uuid);

-- Scheduling / lifecycle columns on the connector itself.
ALTER TABLE connectors ADD COLUMN IF NOT EXISTS credential_id uuid REFERENCES credentials(id) ON DELETE SET NULL;
ALTER TABLE connectors ADD COLUMN IF NOT EXISTS refresh_freq_minutes integer NOT NULL DEFAULT 0;  -- 0 = manual only
ALTER TABLE connectors ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false;
ALTER TABLE connectors ADD COLUMN IF NOT EXISTS next_sync timestamptz;
ALTER TABLE connectors ADD COLUMN IF NOT EXISTS new_docs integer NOT NULL DEFAULT 0;
ALTER TABLE connectors ADD COLUMN IF NOT EXISTS updated_docs integer NOT NULL DEFAULT 0;
ALTER TABLE connectors ADD COLUMN IF NOT EXISTS removed_docs integer NOT NULL DEFAULT 0;

-- Document sets: named groupings of connectors for scoping search and assistants.
CREATE TABLE IF NOT EXISTS document_sets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
ALTER TABLE document_sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON document_sets;
CREATE POLICY tenant_isolation ON document_sets
  USING (tenant_id = current_setting('enaz.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('enaz.tenant_id', true)::uuid);

CREATE TABLE IF NOT EXISTS document_set_connectors (
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_set_id uuid NOT NULL REFERENCES document_sets(id) ON DELETE CASCADE,
  connector_id    uuid NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  PRIMARY KEY (document_set_id, connector_id)
);
ALTER TABLE document_set_connectors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON document_set_connectors;
CREATE POLICY tenant_isolation ON document_set_connectors
  USING (tenant_id = current_setting('enaz.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('enaz.tenant_id', true)::uuid);
