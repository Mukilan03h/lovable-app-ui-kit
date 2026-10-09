-- Files attached to a conversation (code-interpreter session context).

CREATE TABLE IF NOT EXISTS session_files (
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  size             integer NOT NULL DEFAULT 0,
  content_type     text NOT NULL DEFAULT '',
  markdown         text NOT NULL DEFAULT '',
  source           text NOT NULL DEFAULT 'upload',  -- upload | generated
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, name)
);

ALTER TABLE session_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON session_files;
CREATE POLICY tenant_isolation ON session_files
  USING (tenant_id = current_setting('enaz.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('enaz.tenant_id', true)::uuid);
