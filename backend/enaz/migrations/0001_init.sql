-- Enaz Knowledge schema: multi-tenant, pgvector + full-text, row-level security.
-- {{EMBED_DIM}} is substituted with the configured embedding dimension at apply time.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Tenants (not RLS-scoped; the root of isolation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  plan        text NOT NULL DEFAULT 'business',
  settings    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email          text NOT NULL,
  name           text NOT NULL,
  role           text NOT NULL DEFAULT 'member',
  title          text NOT NULL DEFAULT '',
  avatar         text NOT NULL DEFAULT '',
  password_hash  text,
  external_id    text,
  disabled       boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS groups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         text NOT NULL,
  external_id  text,
  source       text NOT NULL DEFAULT 'manual',
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS user_groups (
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id   uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, group_id)
);

CREATE TABLE IF NOT EXISTS sso_providers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type           text NOT NULL,                 -- oidc | saml
  display_name   text NOT NULL,
  issuer         text,
  client_id      text,
  client_secret  text,
  config         jsonb NOT NULL DEFAULT '{}',
  enabled        boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  token_hash  text NOT NULL,
  prefix      text NOT NULL,
  scopes      jsonb NOT NULL DEFAULT '["search"]',
  kind        text NOT NULL DEFAULT 'user',     -- user | scim | service
  expires_at  timestamptz,
  last_used   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash);

-- ---------------------------------------------------------------------------
-- Knowledge
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS connectors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type        text NOT NULL,
  name        text NOT NULL,
  config      jsonb NOT NULL DEFAULT '{}',
  status      text NOT NULL DEFAULT 'idle',
  cursor      text,
  error       text,
  doc_count   integer NOT NULL DEFAULT 0,
  permission_sync boolean NOT NULL DEFAULT true,
  freshness   text NOT NULL DEFAULT 'manual',
  last_sync   timestamptz,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connector_id  uuid REFERENCES connectors(id) ON DELETE CASCADE,
  source        text NOT NULL,
  external_id   text NOT NULL,
  title         text NOT NULL,
  url           text,
  path          text NOT NULL DEFAULT '',
  doc_type      text NOT NULL DEFAULT 'doc',
  owner         text NOT NULL DEFAULT '',
  content_hash  text,
  metadata      jsonb NOT NULL DEFAULT '{}',
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, connector_id, external_id)
);

CREATE TABLE IF NOT EXISTS doc_acl (
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doc_id     uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  principal  text NOT NULL,
  PRIMARY KEY (doc_id, principal)
);
CREATE INDEX IF NOT EXISTS idx_doc_acl_principal ON doc_acl(tenant_id, principal);

CREATE TABLE IF NOT EXISTS chunks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doc_id       uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ord          integer NOT NULL,
  section      text NOT NULL DEFAULT '',
  text         text NOT NULL,
  context      text NOT NULL DEFAULT '',
  parent_text  text NOT NULL DEFAULT '',
  tokens       integer NOT NULL DEFAULT 0,
  embedding    vector({{EMBED_DIM}}),
  tsv          tsvector GENERATED ALWAYS AS (
                 setweight(to_tsvector('english', coalesce(context, '')), 'A') ||
                 setweight(to_tsvector('english', coalesce(section, '')), 'B') ||
                 setweight(to_tsvector('english', text), 'C')
               ) STORED
);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_id);
CREATE INDEX IF NOT EXISTS idx_chunks_tsv ON chunks USING gin(tsv);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- Enterprise graph
CREATE TABLE IF NOT EXISTS entities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind        text NOT NULL,                    -- person | project | customer | team | doc
  name        text NOT NULL,
  ref         text,
  metadata    jsonb NOT NULL DEFAULT '{}',
  mentions    integer NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, kind, name)
);

CREATE TABLE IF NOT EXISTS entity_edges (
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  src        uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  dst        uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation   text NOT NULL,
  weight     real NOT NULL DEFAULT 1,
  PRIMARY KEY (src, dst, relation)
);

-- ---------------------------------------------------------------------------
-- Conversations / artifacts / agents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id       uuid REFERENCES projects(id) ON DELETE SET NULL,
  title            text NOT NULL DEFAULT 'New chat',
  summary          text NOT NULL DEFAULT '',
  summarized_upto  integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  ord              integer NOT NULL,
  role             text NOT NULL,
  content          text NOT NULL,
  meta             jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, ord);

CREATE TABLE IF NOT EXISTS artifacts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title            text NOT NULL,
  kind             text NOT NULL,
  format           text NOT NULL DEFAULT '',
  conversation_id  uuid REFERENCES conversations(id) ON DELETE SET NULL,
  shared           text NOT NULL DEFAULT 'private',
  pinned           boolean NOT NULL DEFAULT false,
  current_version  integer NOT NULL DEFAULT 1,
  sources          integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artifact_versions (
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  artifact_id  uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  version      integer NOT NULL,
  spec         jsonb NOT NULL,
  note         text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id, version)
);

CREATE TABLE IF NOT EXISTS agents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text NOT NULL DEFAULT '',
  instructions  text NOT NULL DEFAULT '',
  tools         jsonb NOT NULL DEFAULT '[]',
  sources       jsonb NOT NULL DEFAULT '[]',
  trigger       text NOT NULL DEFAULT 'manual',
  output        text NOT NULL DEFAULT 'answer',
  owner_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  enabled       boolean NOT NULL DEFAULT true,
  last_run      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id    uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  status      text NOT NULL,
  cost        real NOT NULL DEFAULT 0,
  result      jsonb NOT NULL DEFAULT '{}',
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS approvals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id      uuid REFERENCES agent_runs(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool        text NOT NULL,
  args        jsonb NOT NULL DEFAULT '{}',
  status      text NOT NULL DEFAULT 'pending',
  result      jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  decided_at  timestamptz
);

-- ---------------------------------------------------------------------------
-- Personalization, settings, analytics
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text        text NOT NULL,
  source      text NOT NULL DEFAULT 'user',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shortcuts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  command     text NOT NULL,
  prompt      text NOT NULL,
  shared      boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS user_settings (
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  settings   jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS workspace_settings (
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key        text NOT NULL,
  value      jsonb NOT NULL,
  PRIMARY KEY (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS query_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  query          text NOT NULL,
  normalized     text NOT NULL,
  path           text NOT NULL,
  model          text,
  input_tokens   integer NOT NULL DEFAULT 0,
  output_tokens  integer NOT NULL DEFAULT 0,
  cost           real NOT NULL DEFAULT 0,
  baseline_cost  real NOT NULL DEFAULT 0,
  latency_ms     integer NOT NULL DEFAULT 0,
  confidence     real NOT NULL DEFAULT 0,
  answered       boolean NOT NULL DEFAULT true,
  cached         boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_query_log_tenant_time ON query_log(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id  uuid,
  rating      text NOT NULL,
  comment     text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS answer_cache (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  acl_key     text NOT NULL,
  query       text NOT NULL,
  embedding   vector({{EMBED_DIM}}),
  payload     jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cache_acl ON answer_cache(tenant_id, acl_key);

CREATE TABLE IF NOT EXISTS verified_answers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  question    text NOT NULL,
  answer      text NOT NULL,
  category    text NOT NULL DEFAULT '',
  owner_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  target      text NOT NULL DEFAULT '',
  detail      jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON audit_log(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS eval_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  metrics     jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
