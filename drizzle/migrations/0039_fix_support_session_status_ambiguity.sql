CREATE OR REPLACE FUNCTION public.admin_list_support_sessions(_search text DEFAULT NULL::text, _status text DEFAULT NULL::text, _tenant_id uuid DEFAULT NULL::uuid, _admin_id uuid DEFAULT NULL::uuid, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS TABLE(id uuid, admin_id uuid, admin_email text, admin_name text, target_tenant_id uuid, target_tenant_name text, target_user_id uuid, target_user_email text, target_user_name text, reason text, status text, started_at timestamptz, expires_at timestamptz, ended_at timestamptz, end_reason text, is_revoked boolean, revoked_at timestamptz, client_ip text, user_agent text, minutes_remaining numeric, actions_count bigint, total_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $function$
DECLARE v_caller_id uuid := auth.uid();
BEGIN
 IF NOT (public.has_platform_permission('platform.support.view') OR public.has_platform_permission('platform.support.impersonate') OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = v_caller_id AND pa.platform_role = 'super_admin' AND pa.is_active = true AND pa.revoked_at IS NULL)) THEN
  RAISE EXCEPTION 'Not authorized: platform.support.view' USING ERRCODE = '42501';
 END IF;
 UPDATE public.platform_support_sessions AS expired_session
 SET status = 'expired', ended_at = expired_session.expires_at, end_reason = 'Session expired automatically'
 WHERE expired_session.status = 'active' AND expired_session.expires_at <= now();
 RETURN QUERY
 WITH filtered AS (
  SELECT s.id, s.admin_id, s.admin_email, COALESCE(pa.full_name, p.full_name, s.admin_email) AS admin_name,
   s.target_tenant_id, s.target_tenant_name, s.target_user_id, s.target_user_email, s.target_user_name,
   s.reason, s.status, s.started_at, s.expires_at, s.ended_at, s.end_reason, s.is_revoked, s.revoked_at, s.client_ip, s.user_agent,
   CASE WHEN s.status = 'active' AND s.expires_at > now() THEN ROUND(EXTRACT(EPOCH FROM (s.expires_at - now())) / 60, 1) ELSE 0 END AS minutes_remaining,
   (SELECT COUNT(*) FROM public.platform_audit_log pal WHERE pal.support_session_id = s.id) AS actions_count
  FROM public.platform_support_sessions s
  LEFT JOIN public.platform_admins pa ON pa.user_id = s.admin_id
  LEFT JOIN public.profiles p ON p.id = s.admin_id
  WHERE (_tenant_id IS NULL OR s.target_tenant_id = _tenant_id)
   AND (_admin_id IS NULL OR s.admin_id = _admin_id)
   AND (_status IS NULL OR _status = 'all' OR s.status = _status)
   AND (_search IS NULL OR trim(_search) = '' OR s.target_tenant_name ILIKE '%' || trim(_search) || '%' OR s.admin_email ILIKE '%' || trim(_search) || '%' OR s.reason ILIKE '%' || trim(_search) || '%' OR COALESCE(s.target_user_email, '') ILIKE '%' || trim(_search) || '%' OR COALESCE(s.target_user_name, '') ILIKE '%' || trim(_search) || '%')
 ), total AS (SELECT COUNT(*) AS cnt FROM filtered)
 SELECT f.*, t.cnt AS total_count FROM filtered f CROSS JOIN total t
 ORDER BY f.started_at DESC LIMIT LEAST(COALESCE(_limit, 50), 200) OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$function$;