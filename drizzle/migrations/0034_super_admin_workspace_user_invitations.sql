CREATE OR REPLACE FUNCTION public.admin_create_tenant_invitation(
  _tenant_id uuid,
  _email text,
  _role public.app_role DEFAULT 'viewer',
  _expires_in_hours integer DEFAULT 72
)
RETURNS TABLE (
  invitation_id uuid,
  invitation_token text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
DECLARE
  v_email text := lower(trim(_email));
  v_token text;
  v_expires timestamptz;
  v_id uuid;
  v_existing_tenant uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_platform_permission('platform.users.manage')
    OR public.has_platform_permission('platform.tenants.update')
  ) THEN
    RAISE EXCEPTION 'Workspace user management permission required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = _tenant_id) THEN
    RAISE EXCEPTION 'Workspace not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_email IS NULL OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'A valid invitation email is required' USING ERRCODE = '22023';
  END IF;
  IF _role = 'super_admin'::public.app_role THEN
    RAISE EXCEPTION 'Platform roles cannot be assigned as workspace roles' USING ERRCODE = '22023';
  END IF;
  IF _expires_in_hours < 1 OR _expires_in_hours > 720 THEN
    RAISE EXCEPTION 'Invitation expiry must be between 1 and 720 hours' USING ERRCODE = '22023';
  END IF;

  SELECT p.tenant_id INTO v_existing_tenant
  FROM public.profiles p
  WHERE lower(p.email) = v_email
  LIMIT 1;

  IF v_existing_tenant = _tenant_id THEN
    RAISE EXCEPTION 'This user already belongs to the workspace' USING ERRCODE = '23505';
  END IF;
  IF v_existing_tenant IS NOT NULL AND v_existing_tenant <> _tenant_id THEN
    RAISE EXCEPTION 'This user already belongs to another workspace' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.tenant_invitations ti
    WHERE ti.tenant_id = _tenant_id
      AND lower(ti.invited_email) = v_email
      AND ti.accepted_at IS NULL
      AND ti.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'An active invitation already exists for this email' USING ERRCODE = '23505';
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := now() + make_interval(hours => _expires_in_hours);

  INSERT INTO public.tenant_invitations (
    tenant_id, invited_email, role, token_hash, invited_by, expires_at
  ) VALUES (
    _tenant_id, v_email, _role,
    encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid(), v_expires
  )
  RETURNING id INTO v_id;

  PERFORM public.platform_audit(
    'tenant_user.invited',
    'tenant_invitation',
    v_id,
    v_email,
    jsonb_build_object(
      'tenant_id', _tenant_id,
      'role', _role::text,
      'expires_at', v_expires
    ),
    'medium'
  );

  RETURN QUERY SELECT v_id, v_token, v_expires;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_create_tenant_invitation(uuid, text, public.app_role, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_tenant_invitation(uuid, text, public.app_role, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_tenant_invitation(uuid, text, public.app_role, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_list_tenant_invitations(_tenant_id uuid)
RETURNS TABLE (
  id uuid,
  invited_email text,
  role text,
  invited_by_email text,
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_platform_permission('platform.users.view')
    OR public.has_platform_permission('platform.users.manage')
    OR public.has_platform_permission('platform.tenants.view')
  ) THEN
    RAISE EXCEPTION 'Workspace user viewing permission required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ti.id,
    ti.invited_email,
    ti.role::text,
    inviter.email,
    ti.expires_at,
    ti.accepted_at,
    ti.created_at,
    CASE
      WHEN ti.accepted_at IS NOT NULL THEN 'accepted'
      WHEN ti.expires_at <= now() THEN 'expired'
      ELSE 'pending'
    END
  FROM public.tenant_invitations ti
  LEFT JOIN public.profiles inviter ON inviter.id = ti.invited_by
  WHERE ti.tenant_id = _tenant_id
  ORDER BY ti.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_tenant_invitations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_tenant_invitations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_tenant_invitations(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_revoke_tenant_invitation(
  _tenant_id uuid,
  _invitation_id uuid,
  _reason text DEFAULT 'Invitation cancelled by Super Admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_platform_permission('platform.users.manage')
    OR public.has_platform_permission('platform.tenants.update')
  ) THEN
    RAISE EXCEPTION 'Workspace user management permission required' USING ERRCODE = '42501';
  END IF;

  SELECT ti.invited_email INTO v_email
  FROM public.tenant_invitations ti
  WHERE ti.id = _invitation_id
    AND ti.tenant_id = _tenant_id
    AND ti.accepted_at IS NULL
  FOR UPDATE;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Pending invitation not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.tenant_invitations ti
  WHERE ti.id = _invitation_id
    AND ti.tenant_id = _tenant_id
    AND ti.accepted_at IS NULL;

  PERFORM public.platform_audit(
    'tenant_user.invitation_cancelled',
    'tenant_invitation',
    _invitation_id,
    v_email,
    jsonb_build_object('tenant_id', _tenant_id, 'reason', _reason),
    'medium'
  );

  RETURN jsonb_build_object('success', true, 'invitation_id', _invitation_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_revoke_tenant_invitation(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_tenant_invitation(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_tenant_invitation(uuid, uuid, text) TO service_role;