-- Companion to 20260829000000: RPC for the admin hook to fetch
-- the calling admin's effective platform permission codes.

CREATE OR REPLACE FUNCTION public.get_my_platform_permissions()
RETURNS TABLE (permission_code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT prp.permission_code
  FROM   public.platform_admins pa
  JOIN   public.platform_role_permissions prp ON prp.role_name = pa.platform_role
  WHERE  pa.user_id    = auth.uid()
    AND  pa.is_active  = true
    AND  pa.revoked_at IS NULL
  ORDER  BY prp.permission_code;
$$;

REVOKE ALL ON FUNCTION public.get_my_platform_permissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_platform_permissions() TO authenticated;
