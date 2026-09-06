-- =========================================================
-- Super Admin — Tenant User Management RPCs
--
-- Four SECURITY DEFINER functions, all gated to platform
-- permissions.  None of these touch auth.users passwords,
-- secrets, or MFA data.  Referential integrity is preserved
-- by operating only on profiles + user_roles rows.
--
-- Permission map:
--   list_tenant_users          → platform.users.view
--   admin_set_tenant_user_roles → platform.users.manage
--   admin_remove_tenant_user   → platform.users.manage
--   admin_get_user_activity    → platform.users.view
--
-- Auditing: every write calls platform_audit() which inserts
-- an immutable row into platform_audit_log.
--
-- Platform vs Tenant distinction:
--   A user_roles row ties a user to ONE tenant at ONE role.
--   Super-admin roles live in user_roles with tenant_id = NULL.
--   These RPCs ONLY touch rows where tenant_id = _tenant_id,
--   preventing any escalation to platform roles.
-- =========================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  list_tenant_users
--
--     Returns all profiles + roles for a given tenant.
--     Supports search (name / email substring) and role filter.
--     Includes a flag indicating whether the user is also a
--     platform admin — for display only, NOT for access control.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.list_tenant_users(
  _tenant_id  uuid,
  _search     text    DEFAULT NULL,
  _role       text    DEFAULT NULL,
  _limit      integer DEFAULT 100,
  _offset     integer DEFAULT 0
)
RETURNS TABLE (
  user_id          uuid,
  email            text,
  full_name        text,
  avatar_url       text,
  phone            text,
  roles            text[],
  joined_at        timestamptz,
  last_active_at   timestamptz,
  is_platform_admin boolean,
  total_count      bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_name text;
BEGIN
  -- Permission check: caller must be a platform admin with users.view
  IF NOT public.has_platform_permission('platform.users.view') THEN
    RAISE EXCEPTION 'Not authorized: platform.users.view' USING ERRCODE = '42501';
  END IF;

  -- Validate the tenant exists (do NOT leak "not found" vs "no permission")
  SELECT name INTO v_tenant_name
  FROM public.tenants
  WHERE id = _tenant_id AND deleted_at IS NULL;

  IF v_tenant_name IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  RETURN QUERY
  WITH
  -- All profiles belonging to this tenant
  base AS (
    SELECT
      p.id          AS user_id,
      p.email,
      p.full_name,
      p.avatar_url,
      p.phone,
      p.created_at  AS joined_at,
      p.updated_at  AS last_active_at
    FROM public.profiles p
    WHERE p.tenant_id = _tenant_id
      -- Search: case-insensitive substring on email or full_name
      AND (
        _search IS NULL
        OR p.email     ILIKE '%' || _search || '%'
        OR p.full_name ILIKE '%' || _search || '%'
      )
  ),
  -- Aggregate roles per user for this tenant (never includes super_admin / NULL tenant rows)
  user_roles_agg AS (
    SELECT
      ur.user_id,
      array_agg(ur.role::text ORDER BY ur.role::text) AS roles
    FROM public.user_roles ur
    WHERE ur.tenant_id = _tenant_id
    GROUP BY ur.user_id
  ),
  -- Apply role filter AFTER aggregation
  filtered AS (
    SELECT
      b.*,
      COALESCE(ura.roles, ARRAY[]::text[]) AS roles
    FROM base b
    LEFT JOIN user_roles_agg ura ON ura.user_id = b.user_id
    WHERE (
      _role IS NULL
      OR (_role = 'none' AND (ura.roles IS NULL OR array_length(ura.roles, 1) = 0))
      OR (_role IS NOT NULL AND _role <> 'none' AND ura.roles @> ARRAY[_role])
    )
  ),
  -- Window count for pagination
  counted AS (
    SELECT *, COUNT(*) OVER () AS total_count FROM filtered
  )
  SELECT
    c.user_id,
    c.email,
    c.full_name,
    c.avatar_url,
    c.phone,
    c.roles,
    c.joined_at,
    c.last_active_at,
    -- Flag: user is ALSO a platform admin (display only — does not imply elevated rights here)
    EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = c.user_id
        AND pa.is_active = true
        AND pa.revoked_at IS NULL
    ) AS is_platform_admin,
    c.total_count
  FROM counted c
  ORDER BY c.joined_at DESC
  LIMIT  LEAST(COALESCE(_limit, 100), 500)
  OFFSET COALESCE(_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.list_tenant_users(uuid, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_tenant_users(uuid, text, text, integer, integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  admin_set_tenant_user_roles
--
--     Replaces a user's roles within a specific tenant.
--     ONLY operates on rows WHERE tenant_id = _tenant_id — never
--     touches the NULL-tenant super_admin rows used by platform auth.
--
--     Safety guards:
--       - Validates tenant and user both exist
--       - Validates every role is a real app_role enum value
--       - Refuses to set 'super_admin' via this RPC (platform escalation blocked)
--       - Does not touch auth.users in any way
--       - Fully audited
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_set_tenant_user_roles(
  _tenant_id uuid,
  _user_id   uuid,
  _roles     text[],   -- e.g. ARRAY['sales','inventory']
  _reason    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_name  text;
  v_user_email   text;
  v_old_roles    text[];
  v_role         text;
BEGIN
  IF NOT public.has_platform_permission('platform.users.manage') THEN
    RAISE EXCEPTION 'Not authorized: platform.users.manage' USING ERRCODE = '42501';
  END IF;

  -- Validate tenant
  SELECT name INTO v_tenant_name
  FROM public.tenants WHERE id = _tenant_id AND deleted_at IS NULL;
  IF v_tenant_name IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  -- Validate user belongs to this tenant
  SELECT email INTO v_user_email
  FROM public.profiles WHERE id = _user_id AND tenant_id = _tenant_id;
  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'User not found in this tenant';
  END IF;

  -- Block platform escalation: super_admin must never be set via this path
  IF 'super_admin' = ANY(_roles) THEN
    RAISE EXCEPTION
      'super_admin cannot be assigned via tenant user management. '
      'Use admin_grant_platform_access() for platform-level access.'
      USING ERRCODE = '42501';
  END IF;

  -- Validate all provided roles are valid app_role enum values
  FOREACH v_role IN ARRAY COALESCE(_roles, ARRAY[]::text[])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'app_role' AND e.enumlabel = v_role
    ) THEN
      RAISE EXCEPTION 'Invalid role: %. Must be a valid app_role.', v_role;
    END IF;
  END LOOP;

  -- Capture old roles for audit trail
  SELECT array_agg(ur.role::text ORDER BY ur.role::text) INTO v_old_roles
  FROM public.user_roles ur
  WHERE ur.user_id = _user_id AND ur.tenant_id = _tenant_id;

  -- Delete ALL tenant-scoped role rows for this user (tenant_id IS NOT NULL)
  DELETE FROM public.user_roles
  WHERE user_id = _user_id AND tenant_id = _tenant_id;

  -- Insert new roles (if any)
  IF array_length(_roles, 1) > 0 THEN
    INSERT INTO public.user_roles (user_id, tenant_id, role)
    SELECT _user_id, _tenant_id, r::public.app_role
    FROM   unnest(_roles) AS r
    ON CONFLICT DO NOTHING;
  END IF;

  -- Audit
  PERFORM public.platform_audit(
    'user.roles.changed',
    'user',
    _user_id,
    v_user_email,
    jsonb_build_object(
      'tenant_id',    _tenant_id,
      'tenant_name',  v_tenant_name,
      'old_roles',    v_old_roles,
      'new_roles',    _roles,
      'reason',       _reason
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_tenant_user_roles(uuid, uuid, text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_tenant_user_roles(uuid, uuid, text[], text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.  admin_remove_tenant_user
--
--     Removes a user from a tenant:
--       1. Deletes all user_roles rows for this (user, tenant) pair
--       2. NULLs out profiles.tenant_id (user profile persists — auth record intact)
--       3. Does NOT touch auth.users — the account remains valid for other tenants
--       4. Does NOT delete the profile row — preserves referential integrity
--          in audit logs, business_events, document created_by, etc.
--
--     If the user is a platform admin, the operation is REFUSED — platform
--     admin removal must go through admin_revoke_platform_access().
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_remove_tenant_user(
  _tenant_id uuid,
  _user_id   uuid,
  _reason    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_name  text;
  v_user_email   text;
  v_old_roles    text[];
BEGIN
  IF NOT public.has_platform_permission('platform.users.manage') THEN
    RAISE EXCEPTION 'Not authorized: platform.users.manage' USING ERRCODE = '42501';
  END IF;

  -- A platform admin must not be silently ejected from a tenant this way
  IF EXISTS (
    SELECT 1 FROM public.platform_admins pa
    WHERE pa.user_id = _user_id AND pa.is_active = true AND pa.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'This user is an active platform administrator. '
      'Revoke platform access first via admin_revoke_platform_access() '
      'before removing them from a tenant.'
      USING ERRCODE = '42501';
  END IF;

  -- Validate tenant
  SELECT name INTO v_tenant_name
  FROM public.tenants WHERE id = _tenant_id AND deleted_at IS NULL;
  IF v_tenant_name IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  -- Validate user belongs to this tenant
  SELECT email INTO v_user_email
  FROM public.profiles WHERE id = _user_id AND tenant_id = _tenant_id;
  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'User not found in this tenant';
  END IF;

  -- Capture roles before deletion for audit
  SELECT array_agg(ur.role::text ORDER BY ur.role::text) INTO v_old_roles
  FROM public.user_roles ur
  WHERE ur.user_id = _user_id AND ur.tenant_id = _tenant_id;

  -- Remove all tenant-scoped role assignments
  DELETE FROM public.user_roles
  WHERE user_id = _user_id AND tenant_id = _tenant_id;

  -- Disassociate profile from tenant (preserves the row and auth record)
  UPDATE public.profiles
  SET    tenant_id  = NULL,
         updated_at = now()
  WHERE  id = _user_id AND tenant_id = _tenant_id;

  -- Audit
  PERFORM public.platform_audit(
    'user.removed_from_tenant',
    'user',
    _user_id,
    v_user_email,
    jsonb_build_object(
      'tenant_id',   _tenant_id,
      'tenant_name', v_tenant_name,
      'removed_roles', v_old_roles,
      'reason',      _reason
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_remove_tenant_user(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_remove_tenant_user(uuid, uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.  admin_get_user_activity
--
--     Returns the last N business_events rows where actor_id = _user_id
--     AND tenant_id = _tenant_id.  Read-only.  No PII beyond what
--     business_events already stores.
--
--     Also returns the last N platform_audit_log entries where
--     actor_id = _user_id (platform events by this user).
--     Gated to platform.users.view.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_user_activity(
  _tenant_id uuid,
  _user_id   uuid,
  _limit     integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email text;
BEGIN
  IF NOT public.has_platform_permission('platform.users.view') THEN
    RAISE EXCEPTION 'Not authorized: platform.users.view' USING ERRCODE = '42501';
  END IF;

  SELECT email INTO v_user_email FROM public.profiles WHERE id = _user_id;
  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN jsonb_build_object(

    -- ERP-level activity for this user in this tenant
    'business_events', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',          be.id,
          'action',      be.action,
          'entity_type', be.entity_type,
          'entity_id',   be.entity_id,
          'new_values',  be.new_values,
          'old_values',  be.old_values,
          'occurred_at', be.occurred_at
        ) ORDER BY be.occurred_at DESC
      )
      FROM (
        SELECT * FROM public.business_events
        WHERE tenant_id = _tenant_id
          AND actor_id  = _user_id
        ORDER BY occurred_at DESC
        LIMIT LEAST(COALESCE(_limit, 50), 200)
      ) be
    ),

    -- Platform-level events involving this user (e.g. role changes, removals)
    'platform_events', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',           pal.id,
          'action',       pal.action,
          'actor_email',  pal.actor_email,
          'actor_role',   pal.actor_role,
          'detail',       pal.detail,
          'created_at',   pal.created_at
        ) ORDER BY pal.created_at DESC
      )
      FROM (
        SELECT * FROM public.platform_audit_log
        WHERE target_id = _user_id
          AND target_type = 'user'
        ORDER BY created_at DESC
        LIMIT LEAST(COALESCE(_limit, 50), 100)
      ) pal
    )

  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_activity(uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_user_activity(uuid, uuid, integer) TO authenticated;
