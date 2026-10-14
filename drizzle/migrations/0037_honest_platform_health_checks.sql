CREATE OR REPLACE FUNCTION public.admin_get_system_health()
RETURNS TABLE(component text, status text, latency_ms integer, uptime_pct numeric, last_checked_at timestamptz, incident_message text, metrics jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp AS $$
DECLARE v_start timestamptz; v_latency integer; v_tenants bigint;
BEGIN
 IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator access is required' USING ERRCODE='42501'; END IF;
 v_start := clock_timestamp();
 SELECT count(*) INTO v_tenants FROM public.tenants;
 v_latency := (extract(epoch FROM (clock_timestamp()-v_start))*1000)::integer;
 RETURN QUERY
 SELECT 'database'::text, 'operational'::text, v_latency, NULL::numeric, clock_timestamp(), NULL::text, jsonb_build_object('tenants',v_tenants,'measurement','database query');
 RETURN QUERY
 WITH records(component, metrics) AS (
  VALUES
  ('authentication',jsonb_build_object('profiles',(SELECT count(*) FROM public.profiles))),
  ('storage',jsonb_build_object('attachments',(SELECT count(*) FROM public.attachments))),
  ('email',jsonb_build_object('queued',(SELECT count(*) FROM public.email_jobs WHERE status='queued'),'failed',(SELECT count(*) FROM public.email_jobs WHERE status='failed'))),
  ('payments',jsonb_build_object('subscriptions',(SELECT count(*) FROM public.tenant_subscriptions))),
  ('background_jobs',jsonb_build_object('pending',(SELECT count(*) FROM public.platform_background_jobs WHERE status='pending'),'failed',(SELECT count(*) FROM public.platform_background_jobs WHERE status='failed'))),
  ('api',jsonb_build_object('recorded_requests',(SELECT coalesce(sum(request_volume),0) FROM public.platform_api_metrics),'recorded_failures',(SELECT coalesce(sum(failure_count),0) FROM public.platform_api_metrics)))
 )
 SELECT r.component, 'unknown'::text, NULL::integer, NULL::numeric, NULL::timestamptz,
 'Service availability has not been independently probed. Counts reflect database records only.'::text, r.metrics
 FROM records r;
END $$;
CREATE OR REPLACE FUNCTION public.admin_ping_system_component(_component text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp AS $$
DECLARE v_start timestamptz; v_latency integer; v_checked timestamptz;
BEGIN
 IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator access is required' USING ERRCODE='42501'; END IF;
 IF _component IS DISTINCT FROM 'database' THEN RAISE EXCEPTION 'No independent live service probe is configured for this component'; END IF;
 v_start:=clock_timestamp(); PERFORM 1 FROM public.tenants LIMIT 1;
 v_latency:=(extract(epoch FROM (clock_timestamp()-v_start))*1000)::integer; v_checked:=clock_timestamp();
 INSERT INTO public.platform_system_health(component,status,latency_ms,last_checked_at) VALUES('database','operational',v_latency,v_checked)
 ON CONFLICT(component) DO UPDATE SET status=excluded.status,latency_ms=excluded.latency_ms,last_checked_at=excluded.last_checked_at;
 RETURN jsonb_build_object('component','database','status','operational','latency_ms',v_latency,'checked_at',v_checked);
END $$;
REVOKE ALL ON FUNCTION public.admin_get_system_health() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_ping_system_component(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_system_health() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_ping_system_component(text) TO authenticated, service_role;