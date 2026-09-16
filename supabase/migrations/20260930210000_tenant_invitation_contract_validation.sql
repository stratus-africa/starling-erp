-- Validate the invitation provisioning contract after its schema migration.

DO $$
DECLARE
  missing_objects text;
BEGIN
  SELECT string_agg(object_name, ', ' ORDER BY object_name)
  INTO missing_objects
  FROM (
    SELECT 'table: tenant_invitations' AS object_name
    WHERE to_regclass('public.tenant_invitations') IS NULL
    UNION ALL
    SELECT 'column: tenant_invitations.token_hash'
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tenant_invitations' AND column_name = 'token_hash'
    )
    UNION ALL
    SELECT 'rpc: create_tenant_invitation(text,app_role,integer)'
    WHERE to_regprocedure('public.create_tenant_invitation(text,public.app_role,integer)') IS NULL
    UNION ALL
    SELECT 'rpc: accept_tenant_invitation(text)'
    WHERE to_regprocedure('public.accept_tenant_invitation(text)') IS NULL
    UNION ALL
    SELECT 'policy: tenant_invitations_admin_read'
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'tenant_invitations' AND policyname = 'tenant_invitations_admin_read'
    )
  ) missing;

  IF missing_objects IS NOT NULL THEN
    RAISE EXCEPTION 'Tenant invitation contract validation failed: %', missing_objects;
  END IF;
END;
$$;
