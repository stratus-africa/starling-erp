CREATE OR REPLACE FUNCTION public.admin_get_system_health()
RETURNS TABLE(component text, status text, latency_ms integer, uptime_pct numeric, last_checked_at timestamptz, incident_message text, metrics jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp AS $$
DECLARE v_start timestamptz; v_latency integer; v_tenants bigint;
BEGIN
 IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator access is required' USING ERRCODE='42501'; END IF;
 v_start := clock_timestamp();
 SELECT count(*) INTO v_tenants FROM public.tenants;
 v_latency := (extract(epoch FROM (clock_timestamp()-v_start))*1000)::integer;
 RETURN QUERY SELECT 'database'::text, 'operational'::text, v_latency, NULL::numeric, clock_timestamp(), NULL::text, jsonb_build_object('tenants',v_tenants,'measurement','database query');
 RETURN QUERY
 WITH records(component, metrics) AS (
  VALUES
  ('authentication',jsonb_build_object('profiles',(SELECT count(*) FROM public.profiles))),
  ('storage',jsonb_build_object('attachments',(SELECT count(*) FROM public.attachments))),
  ('email',jsonb_build_object('queued',(SELECT count(*) FROM public.email_jobs ej WHERE ej.status='queued'),'failed',(SELECT count(*) FROM public.email_jobs ej WHERE ej.status='failed'))),
  ('payments',jsonb_build_object('subscriptions',(SELECT count(*) FROM public.tenant_subscriptions))),
  ('background_jobs',jsonb_build_object('pending',(SELECT count(*) FROM public.platform_background_jobs bj WHERE bj.status='pending'),'failed',(SELECT count(*) FROM public.platform_background_jobs bj WHERE bj.status='failed'))),
  ('api',jsonb_build_object('recorded_requests',(SELECT coalesce(sum(am.request_volume),0) FROM public.platform_api_metrics am),'recorded_failures',(SELECT coalesce(sum(am.failure_count),0) FROM public.platform_api_metrics am)))
 )
 SELECT r.component, 'unknown'::text, NULL::integer, NULL::numeric, NULL::timestamptz, 'Service availability has not been independently probed. Counts reflect database records only.'::text, r.metrics FROM records r;
END $$;
REVOKE ALL ON FUNCTION public.admin_get_system_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_system_health() TO authenticated, service_role;