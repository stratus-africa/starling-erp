CREATE OR REPLACE FUNCTION public.admin_add_tenant_user(_tenant_id uuid, _email text, _role public.app_role DEFAULT 'viewer', _reason text DEFAULT 'Direct workspace assignment by Super Admin')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid;
  v_email text;
  v_verified timestamptz;
  v_existing_tenant uuid;
  v_active boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()
      AND pa.is_active = true AND pa.revoked_at IS NULL
      AND pa.platform_role IN ('super_admin', 'platform_super_admin')
  ) THEN
    RAISE EXCEPTION 'Only an active Super Admin can add workspace users directly' USING ERRCODE = '42501';
  END IF;
  IF _role IS NULL OR _role = 'super_admin'::public.app_role THEN
    RAISE EXCEPTION 'Platform roles cannot be assigned as workspace roles' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.tenants t WHERE t.id = _tenant_id AND t.deleted_at IS NULL AND lower(t.status) = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active workspace is required' USING ERRCODE = 'P0002';
  END IF;
  SELECT u.id, u.email, u.email_confirmed_at INTO v_user_id, v_email, v_verified
  FROM auth.users u WHERE lower(trim(u.email)) = lower(trim(_email)) FOR UPDATE;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No existing account found for this email. The user must register first or receive an invitation.' USING ERRCODE = 'P0002';
  END IF;
  IF v_verified IS NULL THEN
    RAISE EXCEPTION 'This account must verify its email before workspace access can be granted' USING ERRCODE = '42501';
  END IF;
  SELECT p.tenant_id, p.is_active INTO v_existing_tenant, v_active FROM public.profiles p WHERE p.id = v_user_id FOR UPDATE;
  IF v_active = false THEN
    RAISE EXCEPTION 'This account is deactivated. Activate it before granting workspace access.' USING ERRCODE = '42501';
  END IF;
  IF v_existing_tenant = _tenant_id THEN
    RAISE EXCEPTION 'This user already belongs to the workspace' USING ERRCODE = '23505';
  END IF;
  IF v_existing_tenant IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_user_id AND ur.tenant_id IS NOT NULL AND ur.tenant_id <> _tenant_id
  ) OR EXISTS (
    SELECT 1 FROM public.tenant_user_custom_roles cr WHERE cr.user_id = v_user_id AND cr.tenant_id <> _tenant_id
  ) THEN
    RAISE EXCEPTION 'This user already belongs to another workspace. Remove that membership first.' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.profiles (id, tenant_id, email)
  VALUES (v_user_id, _tenant_id, v_email)
  ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, email = EXCLUDED.email, updated_at = now();
  INSERT INTO public.user_roles (user_id, tenant_id, role) VALUES (v_user_id, _tenant_id, _role) ON CONFLICT DO NOTHING;
  PERFORM public.platform_audit('tenant_user.added', 'tenant_user', v_user_id, v_email,
    jsonb_build_object('tenant_id', _tenant_id, 'role', _role, 'reason', _reason, 'method', 'direct'), 'high');
  RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'tenant_id', _tenant_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_add_tenant_user(uuid,text,public.app_role,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_tenant_user(uuid,text,public.app_role,text) TO authenticated, service_role;