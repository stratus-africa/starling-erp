CREATE OR REPLACE FUNCTION public.admin_get_system_health()
 RETURNS TABLE(component text, status text, latency_ms integer, uptime_pct numeric, last_checked_at timestamp with time zone, incident_message text, metrics jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_t0 timestamptz; v_db_latency integer; v_jobs_failed integer; v_jobs_pending integer;
  v_api_errors numeric; v_tenants integer; v_profiles integer; v_attachments integer;
  v_email_queued integer; v_email_failed integer; v_subs integer;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access is required' USING ERRCODE = '42501';
  END IF;
  v_t0 := clock_timestamp();
  SELECT count(*) INTO v_tenants FROM public.tenants t;
  v_db_latency := GREATEST(1, (EXTRACT(EPOCH FROM (clock_timestamp() - v_t0)) * 1000)::integer);
  SELECT count(*) INTO v_profiles FROM public.profiles pr;
  SELECT count(*) INTO v_attachments FROM public.attachments a;
  SELECT count(*) INTO v_email_queued FROM public.email_jobs ej WHERE ej.status = 'queued';
  SELECT count(*) INTO v_email_failed FROM public.email_jobs ej WHERE ej.status = 'failed';
  SELECT count(*) INTO v_subs FROM public.tenant_subscriptions ts;
  SELECT count(*) INTO v_jobs_failed FROM public.platform_background_jobs j WHERE j.status = 'failed';
  SELECT count(*) INTO v_jobs_pending FROM public.platform_background_jobs j WHERE j.status = 'pending';
  SELECT CASE WHEN COALESCE(SUM(m.request_volume), 0) > 0
              THEN ROUND(SUM(m.failure_count)::numeric / SUM(m.request_volume) * 100, 2) ELSE NULL END
    INTO v_api_errors FROM public.platform_api_metrics m;

  RETURN QUERY
  WITH probes(component, status, latency_ms, uptime_pct, metrics) AS (
    VALUES
      ('database', 'operational', v_db_latency, NULL::numeric, jsonb_build_object('tenants', v_tenants)),
      ('authentication', 'operational', NULL::integer, NULL::numeric, jsonb_build_object('profiles', v_profiles)),
      ('storage', 'operational', NULL::integer, NULL::numeric, jsonb_build_object('attachments', v_attachments)),
      ('email', CASE WHEN v_email_failed > 0 THEN 'degraded' ELSE 'operational' END, NULL::integer, NULL::numeric, jsonb_build_object('queued', v_email_queued, 'failed', v_email_failed)),
      ('payments', 'operational', NULL::integer, NULL::numeric, jsonb_build_object('subscriptions', v_subs)),
      ('background_jobs', CASE WHEN v_jobs_failed > 0 THEN 'degraded' ELSE 'operational' END, NULL::integer, NULL::numeric, jsonb_build_object('failed', v_jobs_failed, 'pending', v_jobs_pending)),
      ('api', CASE WHEN COALESCE(v_api_errors,0) > 5 THEN 'degraded' ELSE 'operational' END, NULL::integer, NULL::numeric,
        CASE WHEN v_api_errors IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('error_rate_pct', v_api_errors) END)
  )
  SELECT p.component,
         CASE WHEN p.status = 'degraded' THEN 'degraded' ELSE COALESCE(h.status, p.status) END,
         COALESCE(h.latency_ms, p.latency_ms),
         NULL::numeric,
         CASE WHEN p.component = 'database' THEN now() ELSE h.last_checked_at END,
         h.incident_message,
         p.metrics
  FROM probes p
  LEFT JOIN public.platform_system_health h ON h.component = p.component;
END;
$function$;