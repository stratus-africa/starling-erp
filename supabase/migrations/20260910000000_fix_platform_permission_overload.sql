-- Migration: 20260910000000_fix_platform_permission_overload.sql
-- Description: Add a (uuid, text) overload of has_platform_permission to fix
--   call-sites in later migrations (20260907500000–20260907800000) that
--   accidentally call the function with arguments in the reversed order.
--
--   Canonical signature (20260829000000):
--     has_platform_permission(_code text, _user_id uuid DEFAULT auth.uid())
--
--   Reversed-arg call-sites that exist in the codebase:
--     has_platform_permission(v_caller_id uuid, 'some.permission' text)
--
--   This overload delegates to the canonical form so both call patterns work.

CREATE OR REPLACE FUNCTION public.has_platform_permission(
  _user_id uuid,
  _code    text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_platform_permission(_code, _user_id);
$$;

COMMENT ON FUNCTION public.has_platform_permission(uuid, text) IS
  'Compatibility overload — delegates to has_platform_permission(text, uuid).
   Exists because several migrations mistakenly call the function with
   (user_id, permission_code) instead of (permission_code, user_id).';

REVOKE ALL ON FUNCTION public.has_platform_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_platform_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_platform_permission(uuid, text) TO service_role;
