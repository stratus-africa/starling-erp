-- ==============================================================================
-- Super Admin Tenant User Management Suite
-- File: supabase/migrations/20260907500000_admin_tenant_user_management_suite.sql
-- ==============================================================================

-- 1. Ensure `is_active` column exists on `public.profiles`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN is_active boolean DEFAULT true NOT NULL;
  END IF;
END $$;

-- 2. Enhanced list_tenant_users RPC with status & role filtering + platform_role indicator
CREATE OR REPLACE FUNCTION public.list_tenant_users(
  _tenant_id uuid,
  _search text DEFAULT NULL,
  _role text DEFAULT NULL,
  _status text DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  avatar_url text,
  phone text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  last_sign_in_at timestamptz,
  roles text[],
  platform_role text,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_has_perm boolean;
BEGIN
  -- Strict Super Admin Platform Permission Check
  v_has_perm := public.has_platform_permission(v_caller_id, 'tenants:read')
             OR public.has_platform_role(v_caller_id, 'platform_super_admin')
             OR public.has_platform_role(v_caller_id, 'platform_support_lead');

  IF NOT v_has_perm THEN
    RAISE EXCEPTION 'Access denied: insufficient platform permissions to view tenant users';
  END IF;

  RETURN QUERY
  WITH user_base AS (
    SELECT
      p.id,
      p.email,
      p.full_name,
      p.avatar_url,
      p.phone,
      COALESCE(p.is_active, true) AS is_active,
      p.created_at,
      p.updated_at,
      au.last_sign_in_at,
      COALESCE(
        ARRAY_AGG(DISTINCT ur.role::text) FILTER (WHERE ur.role IS NOT NULL),
        ARRAY[]::text[]
      ) AS roles,
      pa.role::text AS platform_role
    FROM public.profiles p
    LEFT JOIN auth.users au ON au.id = p.id
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id AND ur.tenant_id = _tenant_id
    LEFT JOIN public.platform_admins pa ON pa.user_id = p.id AND pa.status = 'active'
    WHERE (p.tenant_id = _tenant_id OR ur.tenant_id = _tenant_id)
      AND (
        _search IS NULL
        OR p.email ILIKE '%' || _search || '%'
        OR p.full_name ILIKE '%' || _search || '%'
      )
    GROUP BY p.id, p.email, p.full_name, p.avatar_url, p.phone, p.is_active, p.created_at, p.updated_at, au.last_sign_in_at, pa.role
  ),
  filtered_users AS (
    SELECT *
    FROM user_base ub
    WHERE (
      _role IS NULL
      OR _role = 'all'
      OR _role = ANY(ub.roles)
    )
    AND (
      _status IS NULL
      OR _status = 'all'
      OR (_status = 'active' AND ub.is_active = true)
      OR (_status = 'inactive' AND ub.is_active = false)
    )
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM filtered_users
  )
  SELECT
    fu.id,
    fu.email,
    fu.full_name,
    fu.avatar_url,
    fu.phone,
    fu.is_active,
    fu.created_at,
    fu.updated_at,
    fu.last_sign_in_at,
    fu.roles,
    fu.platform_role,
    c.cnt AS total_count
  FROM filtered_users fu
  CROSS JOIN counted c
  ORDER BY fu.created_at DESC
  LIMIT _limit
  OFFSET _offset;
END;
$$;

-- 3. Set Tenant User Roles (Guarding against privilege escalation & logging audit)
CREATE OR REPLACE FUNCTION public.admin_set_tenant_user_roles(
  _tenant_id uuid,
  _user_id uuid,
  _roles text[],
  _reason text DEFAULT 'Role updated by Super Admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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

  -- Ensure user belongs to this tenant or profile matches
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = _user_id AND (tenant_id = _tenant_id OR tenant_id IS NULL)
  ) AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND tenant_id = _tenant_id
  ) THEN
    RAISE EXCEPTION 'Target user does not exist in this tenant';
  END IF;

  -- Collect old roles for audit log
  SELECT COALESCE(ARRAY_AGG(role::text), ARRAY[]::text[])
  INTO v_old_roles
  FROM public.user_roles
  WHERE user_id = _user_id AND tenant_id = _tenant_id;

  -- Remove existing tenant roles for this user
  DELETE FROM public.user_roles
  WHERE user_id = _user_id AND tenant_id = _tenant_id;

  -- Insert new roles after verifying they are valid tenant roles and NOT platform escalation
  FOREACH v_role_text IN ARRAY _roles
  LOOP
    IF v_role_text IN ('platform_super_admin', 'platform_security_admin', 'platform_support_lead', 'platform_auditor', 'super_admin') THEN
      RAISE EXCEPTION 'Invalid role assignment: platform roles cannot be assigned as tenant roles';
    END IF;

    -- Insert role casting to app_role
    BEGIN
      INSERT INTO public.user_roles (user_id, tenant_id, role)
      VALUES (_user_id, _tenant_id, v_role_text::public.app_role);
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid role value: %', v_role_text;
    END;
  END LOOP;

  SELECT COALESCE(ARRAY_AGG(role::text), ARRAY[]::text[])
  INTO v_new_roles
  FROM public.user_roles
  WHERE user_id = _user_id AND tenant_id = _tenant_id;

  -- Log platform audit event
  PERFORM public.platform_audit(
    'tenant.user.roles_updated',
    'tenant_user',
    _user_id::text,
    jsonb_build_object(
      'tenant_id', _tenant_id,
      'old_roles', v_old_roles,
      'new_roles', v_new_roles,
      'reason', _reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', _user_id,
    'tenant_id', _tenant_id,
    'roles', v_new_roles
  );
END;
$$;

-- 4. Activate / Deactivate Tenant User
CREATE OR REPLACE FUNCTION public.admin_set_tenant_user_status(
  _tenant_id uuid,
  _user_id uuid,
  _is_active boolean,
  _reason text DEFAULT 'User status updated by Super Admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_old_status boolean;
BEGIN
  IF NOT (
    public.has_platform_permission(v_caller_id, 'tenants:manage_members')
    OR public.has_platform_role(v_caller_id, 'platform_super_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: insufficient platform permissions to change user status';
  END IF;

  -- Verify user exists in tenant
  SELECT is_active INTO v_old_status
  FROM public.profiles
  WHERE id = _user_id AND (tenant_id = _tenant_id OR tenant_id IS NULL);

  IF v_old_status IS NULL THEN
    RAISE EXCEPTION 'User profile not found in specified tenant';
  END IF;

  UPDATE public.profiles
  SET is_active = _is_active,
      updated_at = now()
  WHERE id = _user_id;

  -- Audit log
  PERFORM public.platform_audit(
    CASE WHEN _is_active THEN 'tenant.user.activated' ELSE 'tenant.user.deactivated' END,
    'tenant_user',
    _user_id::text,
    jsonb_build_object(
      'tenant_id', _tenant_id,
      'previous_status', v_old_status,
      'new_status', _is_active,
      'reason', _reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', _user_id,
    'is_active', _is_active
  );
END;
$$;

-- 5. Revoke / Reset Sessions for Tenant User
CREATE OR REPLACE FUNCTION public.admin_revoke_tenant_user_sessions(
  _tenant_id uuid,
  _user_id uuid,
  _reason text DEFAULT 'Sessions revoked by Super Admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_sessions_cleared int := 0;
BEGIN
  IF NOT (
    public.has_platform_permission(v_caller_id, 'tenants:manage_members')
    OR public.has_platform_role(v_caller_id, 'platform_super_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: insufficient platform permissions to revoke sessions';
  END IF;

  -- Verify user exists
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = _user_id AND (tenant_id = _tenant_id OR tenant_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  -- Clear refresh tokens / active sessions in auth schema if accessible
  BEGIN
    DELETE FROM auth.refresh_tokens WHERE user_id = _user_id::text;
    GET DIAGNOSTICS v_sessions_cleared = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_sessions_cleared := 0;
  END;

  -- Update profiles.updated_at to invalidate client-side caching
  UPDATE public.profiles
  SET updated_at = now()
  WHERE id = _user_id;

  -- Audit log
  PERFORM public.platform_audit(
    'tenant.user.sessions_revoked',
    'tenant_user',
    _user_id::text,
    jsonb_build_object(
      'tenant_id', _tenant_id,
      'sessions_cleared', v_sessions_cleared,
      'reason', _reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', _user_id,
    'sessions_cleared', v_sessions_cleared
  );
END;
$$;

-- 6. Remove User from Tenant (preserving auth record & referential integrity)
CREATE OR REPLACE FUNCTION public.admin_remove_tenant_user(
  _tenant_id uuid,
  _user_id uuid,
  _reason text DEFAULT 'User removed from tenant by Super Admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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

  -- Check if user is an active platform admin
  SELECT EXISTS(
    SELECT 1 FROM public.platform_admins WHERE user_id = _user_id AND status = 'active'
  ) INTO v_is_platform_admin;

  IF v_is_platform_admin THEN
    RAISE EXCEPTION 'Cannot remove user from tenant: user is an active Platform Administrator. Revoke platform admin privileges first if intended.';
  END IF;

  -- Remove tenant roles
  DELETE FROM public.user_roles
  WHERE user_id = _user_id AND tenant_id = _tenant_id;

  -- If user profile is bound directly to this tenant, disassociate tenant_id
  UPDATE public.profiles
  SET tenant_id = NULL,
      updated_at = now()
  WHERE id = _user_id AND tenant_id = _tenant_id;

  -- Log platform audit event
  PERFORM public.platform_audit(
    'tenant.user.removed',
    'tenant_user',
    _user_id::text,
    jsonb_build_object(
      'tenant_id', _tenant_id,
      'reason', _reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', _user_id,
    'tenant_id', _tenant_id,
    'message', 'User removed from tenant. Authentication identity and audit references preserved.'
  );
END;
$$;

-- 7. Get User Activity (both ERP business events and platform audit logs)
CREATE OR REPLACE FUNCTION public.admin_get_user_activity(
  _tenant_id uuid,
  _user_id uuid,
  _limit int DEFAULT 50
)
RETURNS TABLE (
  source text,
  event_type text,
  entity_type text,
  entity_id text,
  details jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
BEGIN
  IF NOT (
    public.has_platform_permission(v_caller_id, 'tenants:read')
    OR public.has_platform_role(v_caller_id, 'platform_super_admin')
    OR public.has_platform_role(v_caller_id, 'platform_auditor')
  ) THEN
    RAISE EXCEPTION 'Access denied: insufficient platform permissions to view user activity';
  END IF;

  RETURN QUERY
  SELECT * FROM (
    -- Platform Audit Log events involving or executed by this user
    SELECT
      'platform_audit'::text AS source,
      pal.action::text AS event_type,
      pal.resource_type::text AS entity_type,
      pal.resource_id::text AS entity_id,
      pal.details AS details,
      pal.created_at
    FROM public.platform_audit_log pal
    WHERE (pal.actor_user_id = _user_id OR pal.resource_id = _user_id::text)
      AND (pal.details->>'tenant_id' = _tenant_id::text OR pal.resource_id = _user_id::text)

    UNION ALL

    -- ERP Business Events in this tenant created by this user (if business_events table exists)
    SELECT
      'business_event'::text AS source,
      be.event_type::text AS event_type,
      be.entity_type::text AS entity_type,
      be.entity_id::text AS entity_id,
      be.metadata AS details,
      be.created_at
    FROM public.business_events be
    WHERE be.tenant_id = _tenant_id
      AND be.actor_id = _user_id
  ) combined
  ORDER BY combined.created_at DESC
  LIMIT _limit;
END;
$$;
