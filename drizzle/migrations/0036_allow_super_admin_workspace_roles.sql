CREATE OR REPLACE FUNCTION public.admin_set_tenant_user_roles(_tenant_id uuid, _user_id uuid, _roles text[], _reason text DEFAULT 'Role updated by Super Admin'::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_caller_id uuid := auth.uid();
  v_role_text text;
  v_old_roles text[];
  v_new_roles text[];
BEGIN
  IF NOT (
    public.has_platform_permission(v_caller_id, 'tenants:manage_members')
    OR public.has_platform_role(v_caller_id, 'platform_super_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: insufficient platform permissions to modify user roles';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND (tenant_id = _tenant_id OR tenant_id IS NULL))
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND tenant_id = _tenant_id) THEN
    RAISE EXCEPTION 'Target user does not exist in this tenant';
  END IF;

  SELECT COALESCE(ARRAY_AGG(role::text), ARRAY[]::text[]) INTO v_old_roles
  FROM public.user_roles WHERE user_id = _user_id AND tenant_id = _tenant_id;

  -- Keep any existing super_admin grant untouched; only workspace roles are replaced
  DELETE FROM public.user_roles
  WHERE user_id = _user_id AND tenant_id = _tenant_id AND role <> 'super_admin';

  FOREACH v_role_text IN ARRAY COALESCE(_roles, ARRAY[]::text[])
  LOOP
    IF v_role_text = 'super_admin' THEN
      IF 'super_admin' = ANY(v_old_roles) THEN CONTINUE; END IF;
      RAISE EXCEPTION 'Invalid role assignment: platform roles cannot be assigned as tenant roles';
    END IF;
    IF v_role_text LIKE 'platform\_%' THEN
      RAISE EXCEPTION 'Invalid role assignment: platform roles cannot be assigned as tenant roles';
    END IF;
    BEGIN
      INSERT INTO public.user_roles (user_id, tenant_id, role)
      VALUES (_user_id, _tenant_id, v_role_text::public.app_role)
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid role value: %', v_role_text;
    END;
  END LOOP;

  SELECT COALESCE(ARRAY_AGG(role::text), ARRAY[]::text[]) INTO v_new_roles
  FROM public.user_roles WHERE user_id = _user_id AND tenant_id = _tenant_id;

  PERFORM public.platform_audit('tenant.user.roles_updated', 'tenant_user', _user_id::text,
    jsonb_build_object('tenant_id', _tenant_id, 'old_roles', v_old_roles, 'new_roles', v_new_roles, 'reason', _reason));

  RETURN jsonb_build_object('success', true, 'user_id', _user_id, 'tenant_id', _tenant_id, 'roles', v_new_roles);
END;
$function$;