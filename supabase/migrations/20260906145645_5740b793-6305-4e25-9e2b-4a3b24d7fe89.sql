-- Remove the retired Cashier role and add tenant-scoped permission overrides.

DELETE FROM public.user_roles WHERE role::text = 'cashier';
DELETE FROM public.role_permissions WHERE role = 'cashier';

-- Preserve policies that depend on app_role/has_role while the enum is rebuilt.
CREATE TEMP TABLE _app_role_policy_backup (
  schemaname text NOT NULL,
  tablename text NOT NULL,
  policyname text NOT NULL,
  ddl text NOT NULL
) ON COMMIT DROP;

INSERT INTO _app_role_policy_backup (schemaname, tablename, policyname, ddl)
SELECT
  n.nspname,
  c.relname,
  pol.polname,
  format(
    'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
    pol.polname,
    n.nspname,
    c.relname,
    CASE WHEN pol.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
    CASE pol.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END,
    (SELECT string_agg(quote_ident(CASE WHEN role_oid = 0 THEN 'public' ELSE pg_get_userbyid(role_oid) END), ', ') FROM unnest(pol.polroles) role_oid),
    CASE WHEN pol.polqual IS NOT NULL THEN format(' USING (%s)', pg_get_expr(pol.polqual, pol.polrelid)) ELSE '' END,
    CASE WHEN pol.polwithcheck IS NOT NULL THEN format(' WITH CHECK (%s)', pg_get_expr(pol.polwithcheck, pol.polrelid)) ELSE '' END
  )
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND (
    pg_get_expr(pol.polqual, pol.polrelid) ILIKE '%has_role%'
    OR pg_get_expr(pol.polwithcheck, pol.polrelid) ILIKE '%has_role%'
    OR pg_get_expr(pol.polqual, pol.polrelid) ILIKE '%app_role%'
    OR pg_get_expr(pol.polwithcheck, pol.polrelid) ILIKE '%app_role%'
  );

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM _app_role_policy_backup LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.admin_set_user_roles(uuid, public.app_role[]);
DROP FUNCTION IF EXISTS public.tenant_write_ok(public.app_role[]);
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
ALTER TABLE public.user_roles ALTER COLUMN role TYPE text USING role::text;
DROP TYPE public.app_role;

CREATE TYPE public.app_role AS ENUM (
  'super_admin',
  'tenant_admin',
  'sales',
  'purchasing',
  'inventory',
  'accounting',
  'manufacturing',
  'viewer',
  'accountant',
  'finance_clerk',
  'auditor'
);

ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE public.app_role USING role::public.app_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tenant_write_ok(_roles public.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.tenant_id = public.current_tenant_id()
      AND (
        ur.role IN ('super_admin'::public.app_role, 'tenant_admin'::public.app_role)
        OR ur.role = ANY(_roles)
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_roles(target_user uuid, new_roles public.app_role[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.current_tenant_id();
  r public.app_role;
BEGIN
  IF NOT (public.is_super_admin() OR public.has_role(auth.uid(), 'tenant_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF NOT public.is_super_admin() THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user AND tenant_id = v_tenant) THEN
      RAISE EXCEPTION 'User is not in your tenant';
    END IF;
    IF 'super_admin'::public.app_role = ANY(new_roles) THEN
      RAISE EXCEPTION 'Only super admins can grant super_admin';
    END IF;
  END IF;
  DELETE FROM public.user_roles
  WHERE user_id = target_user
    AND tenant_id = COALESCE((SELECT tenant_id FROM public.profiles WHERE id = target_user), v_tenant);
  FOREACH r IN ARRAY new_roles LOOP
    INSERT INTO public.user_roles(user_id, tenant_id, role)
    VALUES (target_user, COALESCE((SELECT tenant_id FROM public.profiles WHERE id = target_user), v_tenant), r)
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.tenant_write_ok(public.app_role[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_user_roles(uuid, public.app_role[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_write_ok(public.app_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, public.app_role[]) TO authenticated, service_role;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT ddl FROM _app_role_policy_backup ORDER BY schemaname, tablename, policyname LOOP
    EXECUTE r.ddl;
  END LOOP;
END $$;

CREATE TABLE public.tenant_role_permission_overrides (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role text NOT NULL,
  permission_code text NOT NULL REFERENCES public.permissions(code) ON DELETE CASCADE,
  enabled boolean NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, role, permission_code),
  CONSTRAINT tenant_role_permission_overrides_role_check CHECK (
    role IN ('sales','purchasing','inventory','accounting','manufacturing','viewer','accountant','finance_clerk','auditor')
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_role_permission_overrides TO authenticated;
GRANT ALL ON public.tenant_role_permission_overrides TO service_role;
ALTER TABLE public.tenant_role_permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can read permission overrides"
ON public.tenant_role_permission_overrides
FOR SELECT TO authenticated
USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());

CREATE POLICY "Workspace admins can manage permission overrides"
ON public.tenant_role_permission_overrides
FOR ALL TO authenticated
USING (
  public.is_super_admin()
  OR (
    tenant_id = public.current_tenant_id()
    AND public.has_role(auth.uid(), 'tenant_admin'::public.app_role)
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    tenant_id = public.current_tenant_id()
    AND public.has_role(auth.uid(), 'tenant_admin'::public.app_role)
  )
);

CREATE OR REPLACE FUNCTION public.set_role_permission_override(
  _role text,
  _permission_code text,
  _enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid := public.current_tenant_id();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No active workspace' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_super_admin()
    OR public.has_role(auth.uid(), 'tenant_admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;

  IF _role NOT IN ('sales','purchasing','inventory','accounting','manufacturing','viewer','accountant','finance_clerk','auditor') THEN
    RAISE EXCEPTION 'This role cannot be customized' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE code = _permission_code) THEN
    RAISE EXCEPTION 'Unknown permission' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tenant_role_permission_overrides (
    tenant_id, role, permission_code, enabled, updated_by, updated_at
  ) VALUES (
    v_tenant_id, _role, _permission_code, _enabled, auth.uid(), now()
  )
  ON CONFLICT (tenant_id, role, permission_code)
  DO UPDATE SET
    enabled = EXCLUDED.enabled,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.set_role_permission_override(text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_role_permission_override(text, text, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_permission(
  _permission text,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = COALESCE(_user_id, auth.uid())
      AND ur.tenant_id = public.current_tenant_id()
      AND (
        ur.role IN ('super_admin'::public.app_role, 'tenant_admin'::public.app_role)
        OR COALESCE(
          (
            SELECT o.enabled
            FROM public.tenant_role_permission_overrides o
            WHERE o.tenant_id = ur.tenant_id
              AND o.role = ur.role::text
              AND o.permission_code = _permission
          ),
          EXISTS (
            SELECT 1
            FROM public.role_permissions rp
            WHERE rp.role = ur.role::text
              AND rp.permission_code = _permission
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(DISTINCT p.code ORDER BY p.code), ARRAY[]::text[])
  FROM public.permissions p
  WHERE EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.tenant_id = public.current_tenant_id()
      AND ur.role IN ('super_admin'::public.app_role, 'tenant_admin'::public.app_role)
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.tenant_id = public.current_tenant_id()
      AND COALESCE(
        (
          SELECT o.enabled
          FROM public.tenant_role_permission_overrides o
          WHERE o.tenant_id = ur.tenant_id
            AND o.role = ur.role::text
            AND o.permission_code = p.code
        ),
        EXISTS (
          SELECT 1
          FROM public.role_permissions rp
          WHERE rp.role = ur.role::text
            AND rp.permission_code = p.code
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_permission(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_permissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_permission(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated, service_role;