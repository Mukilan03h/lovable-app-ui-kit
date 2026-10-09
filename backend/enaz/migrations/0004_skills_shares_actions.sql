-- Gap-closing features: reusable skills, shareable chats, OpenAPI actions.

-- Skills: named, reusable bundles of instructions + tools an agent or chat can load.
CREATE TABLE IF NOT EXISTS skills (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug        text NOT NULL,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  tools       jsonb NOT NULL DEFAULT '[]'::jsonb,
  shared      boolean NOT NULL DEFAULT true,
  enabled     boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON skills;
CREATE POLICY tenant_isolation ON skills
  USING (tenant_id = current_setting('enaz.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('enaz.tenant_id', true)::uuid);

-- Shareable chats: a capability-link snapshot of a conversation (read-only).
-- The id is an unguessable token; anyone with the link can read until revoked.
CREATE TABLE IF NOT EXISTS shared_chats (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  author_name text NOT NULL DEFAULT '',
  title       text NOT NULL DEFAULT 'Shared chat',
  snapshot    jsonb NOT NULL DEFAULT '[]'::jsonb,
  revoked     boolean NOT NULL DEFAULT false,
  views       integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS for the owner's listing/management view. The public read endpoint fetches
-- by id over an admin connection (the link itself is the capability).
ALTER TABLE shared_chats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON shared_chats;
CREATE POLICY tenant_isolation ON shared_chats
  USING (tenant_id = current_setting('enaz.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('enaz.tenant_id', true)::uuid);

-- OpenAPI / HTTP actions an agent can call (built by importing an OpenAPI spec).
CREATE TABLE IF NOT EXISTS agent_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  collection  text NOT NULL DEFAULT 'default',   -- groups actions from one spec
  name        text NOT NULL,                      -- operationId
  method      text NOT NULL,
  path        text NOT NULL,
  base_url    text NOT NULL DEFAULT '',
  summary     text NOT NULL DEFAULT '',
  parameters  jsonb NOT NULL DEFAULT '[]'::jsonb,
  requires_approval boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, collection, name)
);

ALTER TABLE agent_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON agent_actions;
CREATE POLICY tenant_isolation ON agent_actions
  USING (tenant_id = current_setting('enaz.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('enaz.tenant_id', true)::uuid);
