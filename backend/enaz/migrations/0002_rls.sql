-- Row-level security: every tenant-scoped table is filtered by the
-- `enaz.tenant_id` session setting. The app connects as the non-superuser role
-- `enaz_app` (subject to RLS); migrations and seeding run as the owner/superuser
-- (which bypasses RLS). Tenant isolation is therefore enforced by the database,
-- not by application code.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'enaz_app') THEN
    CREATE ROLE enaz_app LOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO enaz_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO enaz_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO enaz_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO enaz_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO enaz_app;

-- tenants is the isolation root: readable (slug resolution) but not RLS-scoped.

DO $$
DECLARE
  t text;
  rls_tables text[] := ARRAY[
    'users','groups','user_groups','sso_providers','api_tokens','connectors',
    'documents','doc_acl','chunks','entities','entity_edges','projects',
    'conversations','messages','artifacts','artifact_versions','agents',
    'agent_runs','approvals','memories','shortcuts','user_settings',
    'workspace_settings','query_log','feedback','answer_cache','verified_answers',
    'audit_log','eval_runs'
  ];
BEGIN
  FOREACH t IN ARRAY rls_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''enaz.tenant_id'', true)::uuid) '
      'WITH CHECK (tenant_id = current_setting(''enaz.tenant_id'', true)::uuid)', t);
  END LOOP;
END $$;

-- Token authentication happens before a tenant is known, so resolve it with a
-- SECURITY DEFINER function that runs as the owner (bypassing RLS) and returns
-- only the ids needed to then set the tenant context.
CREATE OR REPLACE FUNCTION enaz_resolve_token(p_hash text)
RETURNS TABLE (tenant_id uuid, user_id uuid, scopes jsonb, kind text, token_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id, user_id, scopes, kind, id
  FROM api_tokens
  WHERE token_hash = p_hash AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION enaz_resolve_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION enaz_resolve_token(text) TO enaz_app;
