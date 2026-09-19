-- Platform-level access to every workspace's permission matrix

CREATE OR REPLACE FUNCTION public.admin_list_tenant_permission_matrices()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.has_platform_permission('platform.tenants.view') THEN
    RAISE EXCEPTION 'Platform permission required';
  END IF;

  SELECT jsonb_build_object(
    'tenants', COALESCE((
      SELECT jsonb_agg(t ORDER BY t->>'name')
      FROM (
        SELECT jsonb_build_object(
          'id', tn.id,
          'name', tn.name,
          'slug', tn.slug,
          'status', tn.status,
          'override_count', (
            SELECT count(*) FROM public.tenant_role_permission_overrides o WHERE o.tenant_id = tn.id
          ),
          'user_count', (
            SELECT count(*) FROM public.profiles p WHERE p.tenant_id = tn.id
          )
        ) AS t
        FROM public.tenants tn
      ) s
    ), '[]'::jsonb),
    'permissions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('code', p.code, 'module', p.module, 'action', p.action, 'description', p.description) ORDER BY p.module, p.code)
      FROM public.permissions p
    ), '[]'::jsonb),
    'grants', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('role', rp.role, 'permission_code', rp.permission_code))
      FROM public.role_permissions rp
    ), '[]'::jsonb),
    'overrides', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('tenant_id', o.tenant_id, 'role', o.role, 'permission_code', o.permission_code, 'enabled', o.enabled))
      FROM public.tenant_role_permission_overrides o
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_tenant_permission_matrices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_tenant_permission_matrices() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_tenant_role_permission_override(
  _tenant_id uuid,
  _role text,
  _permission_code text,
  _enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_platform_permission('platform.tenants.update') THEN
    RAISE EXCEPTION 'Platform permission required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant_id) THEN
    RAISE EXCEPTION 'Workspace not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE code = _permission_code) THEN
    RAISE EXCEPTION 'Unknown permission %', _permission_code;
  END IF;

  IF _role = 'tenant_admin' OR _role = 'super_admin' THEN
    RAISE EXCEPTION 'Administrator roles always retain full access';
  END IF;

  IF _enabled = EXISTS (
    SELECT 1 FROM public.role_permissions rp WHERE rp.role = _role AND rp.permission_code = _permission_code
  ) THEN
    DELETE FROM public.tenant_role_permission_overrides
    WHERE tenant_id = _tenant_id AND role = _role AND permission_code = _permission_code;
    RETURN;
  END IF;

  INSERT INTO public.tenant_role_permission_overrides (tenant_id, role, permission_code, enabled, updated_at, updated_by)
  VALUES (_tenant_id, _role, _permission_code, _enabled, now(), auth.uid())
  ON CONFLICT (tenant_id, role, permission_code)
  DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now(), updated_by = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_tenant_role_permission_override(uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_tenant_role_permission_override(uuid, text, text, boolean) TO authenticated, service_role;
