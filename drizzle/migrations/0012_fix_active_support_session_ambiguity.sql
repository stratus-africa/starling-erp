CREATE OR REPLACE FUNCTION public.get_active_support_session()
 RETURNS TABLE(session_id uuid, target_tenant_id uuid, target_tenant_name text, target_user_id uuid, target_user_email text, target_user_name text, reason text, started_at timestamp with time zone, expires_at timestamp with time zone, minutes_remaining numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.platform_support_sessions ps
  SET status = 'expired',
      ended_at = ps.expires_at,
      end_reason = 'Session expired automatically'
  WHERE ps.status = 'active'
    AND ps.expires_at <= now();

  RETURN QUERY
  SELECT
    ps.id AS session_id,
    ps.target_tenant_id,
    ps.target_tenant_name,
    ps.target_user_id,
    ps.target_user_email,
    ps.target_user_name,
    ps.reason,
    ps.started_at,
    ps.expires_at,
    ROUND(EXTRACT(EPOCH FROM (ps.expires_at - now())) / 60, 1) AS minutes_remaining
  FROM public.platform_support_sessions ps
  WHERE ps.admin_id = auth.uid()
    AND ps.status = 'active'
    AND ps.expires_at > now()
    AND ps.is_revoked = false
  ORDER BY ps.started_at DESC
  LIMIT 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_active_support_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_support_session() TO authenticated, service_role;
