CREATE OR REPLACE FUNCTION public.admin_remove_tenant_user(_tenant_id uuid, _user_id uuid, _reason text DEFAULT 'User removed from tenant by Super Admin'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_caller_id uuid := auth.uid();
  v_is_platform_admin boolean;
BEGIN
  IF NOT (
    public.has_platform_permission(v_caller_id, 'tenants:manage_members')
    OR public.has_platform_role(v_caller_id, 'platform_super_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: insufficient platform permissions to remove tenant member';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins pa
    WHERE pa.user_id = _user_id
      AND pa.is_active = true
      AND pa.revoked_at IS NULL
  ) INTO v_is_platform_admin;

  IF v_is_platform_admin THEN
    RAISE EXCEPTION 'Cannot remove user from tenant: user is an active Platform Administrator. Revoke platform admin privileges first if intended.';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = _user_id AND tenant_id = _tenant_id;

  UPDATE public.profiles
  SET tenant_id = NULL, updated_at = now()
  WHERE id = _user_id AND tenant_id = _tenant_id;

  PERFORM public.platform_audit(
    'tenant.user.removed', 'tenant_user', _user_id::text,
    jsonb_build_object('tenant_id', _tenant_id, 'reason', _reason)
  );

  RETURN jsonb_build_object(
    'success', true, 'user_id', _user_id, 'tenant_id', _tenant_id,
    'message', 'User removed from tenant. Authentication identity and audit references preserved.'
  );
END;
$function$;