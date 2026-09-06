-- Migration: 20260910500000_add_has_platform_role_functions.sql
-- Description: Define public.has_platform_role(uuid, text) and public.has_platform_role(text, uuid)
-- Fixes error: function public.has_platform_role(uuid, unknown) does not exist in
-- tenant subscriptions, feature flags, plans & entitlements, and user management RPCs.

CREATE OR REPLACE FUNCTION public.has_platform_role(
  _user_id uuid,
  _role    text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := COALESCE(_user_id, auth.uid());
  v_role text := lower(trim(_role));
  v_actual_role text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- 1. Check platform_admins table
  SELECT lower(platform_role) INTO v_actual_role
  FROM public.platform_admins
  WHERE user_id = v_uid
    AND is_active = true
    AND revoked_at IS NULL;

  IF v_actual_role IS NOT NULL THEN
    -- A super_admin or platform_super_admin has all platform privileges
    IF v_actual_role IN ('super_admin', 'platform_super_admin') THEN
      RETURN true;
    END IF;

    -- Direct role match
    IF v_actual_role = v_role THEN
      RETURN true;
    END IF;

    -- Role equivalence & common aliases
    IF v_role IN ('super_admin', 'platform_super_admin') AND v_actual_role IN ('super_admin', 'platform_super_admin') THEN
      RETURN true;
    END IF;

    IF v_role IN ('platform_admin') AND v_actual_role IN ('platform_admin', 'super_admin') THEN
      RETURN true;
    END IF;

    IF v_role IN ('billing_admin', 'billing') AND v_actual_role IN ('billing_admin', 'billing') THEN
      RETURN true;
    END IF;

    IF v_role IN ('support_admin', 'support', 'platform_support_lead') AND v_actual_role IN ('support_admin', 'support') THEN
      RETURN true;
    END IF;

    IF v_role IN ('readonly', 'platform_auditor', 'auditor') AND v_actual_role IN ('readonly', 'platform_auditor', 'auditor') THEN
      RETURN true;
    END IF;

    IF v_role IN ('security_admin', 'security') AND v_actual_role IN ('security_admin', 'security') THEN
      RETURN true;
    END IF;
  END IF;

  -- 2. Fallback check user_roles table for super_admin
  IF EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_uid
      AND lower(ur.role) IN ('super_admin', 'platform_super_admin')
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- Overload with (_role text, _user_id uuid DEFAULT auth.uid())
CREATE OR REPLACE FUNCTION public.has_platform_role(
  _role    text,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.has_platform_role(_user_id, _role);
$$;

COMMENT ON FUNCTION public.has_platform_role(uuid, text) IS
  'Checks if a user holds a given platform role or higher. Primary overload used by super-admin RPCs.';

COMMENT ON FUNCTION public.has_platform_role(text, uuid) IS
  'Compatibility overload accepting role name first, defaulting user_id to auth.uid().';

REVOKE ALL ON FUNCTION public.has_platform_role(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_platform_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_platform_role(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.has_platform_role(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_platform_role(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_platform_role(text, uuid) TO service_role;
