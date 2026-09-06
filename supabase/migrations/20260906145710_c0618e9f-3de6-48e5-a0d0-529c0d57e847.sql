CREATE OR REPLACE FUNCTION public.set_role_permission_override(
  _role text,
  _permission_code text,
  _enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
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