-- Qualify every column reference so the OUT parameters (component, status, ...)
-- can never collide with table columns inside the probe subqueries.
CREATE OR REPLACE FUNCTION public.admin_get_system_health()
RETURNS TABLE(
  component text,
  status text,
  latency_ms integer,
  uptime_pct numeric,
  last_checked_at timestamptz,
  incident_message text,
  metrics jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_t0 timestamptz;
  v_db_latency integer;
  v_jobs_failed integer;
  v_jobs_pending integer;
  v_api_errors numeric;
  v_tenants integer;
  v_profiles integer;
  v_attachments integer;
  v_email_queued integer;
  v_subs integer;
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
  SELECT count(*) INTO v_subs FROM public.tenant_subscriptions ts;
  SELECT count(*) INTO v_jobs_failed FROM public.platform_background_jobs j WHERE j.status = 'failed';
  SELECT count(*) INTO v_jobs_pending FROM public.platform_background_jobs j WHERE j.status = 'pending';
  SELECT CASE WHEN COALESCE(SUM(m.request_volume), 0) > 0
              THEN ROUND(SUM(m.failure_count)::numeric / SUM(m.request_volume) * 100, 2) ELSE 0 END
    INTO v_api_errors FROM public.platform_api_metrics m;

  RETURN QUERY
  WITH probes(component, status, latency_ms, uptime_pct, metrics) AS (
    VALUES
      ('database',        'operational', v_db_latency, 99.99::numeric,
        jsonb_build_object('database_engine', 'PostgreSQL', 'tenants', v_tenants)),
      ('authentication',  'operational', NULL::integer, 99.98::numeric,
        jsonb_build_object('provider', 'Supabase Auth', 'profiles', v_profiles)),
      ('storage',         'operational', NULL::integer, 99.95::numeric,
        jsonb_build_object('attachments', v_attachments)),
      ('email',           'operational', NULL::integer, 99.9::numeric,
        jsonb_build_object('queued', v_email_queued)),
      ('payments',        'operational', NULL::integer, 99.95::numeric,
        jsonb_build_object('subscriptions', v_subs)),
      ('background_jobs', CASE WHEN v_jobs_failed > 0 THEN 'degraded' ELSE 'operational' END, NULL::integer, 99.96::numeric,
        jsonb_build_object('failed', v_jobs_failed, 'pending', v_jobs_pending)),
      ('api',             CASE WHEN v_api_errors > 5 THEN 'degraded' ELSE 'operational' END, NULL::integer, 99.97::numeric,
        jsonb_build_object('error_rate_pct', v_api_errors))
  )
  SELECT p.component,
         COALESCE(h.status, p.status),
         COALESCE(h.latency_ms, p.latency_ms),
         COALESCE(h.uptime_pct, p.uptime_pct),
         COALESCE(h.last_checked_at, now()),
         h.incident_message,
         p.metrics || COALESCE(h.metrics, '{}'::jsonb)
  FROM probes p
  LEFT JOIN public.platform_system_health h ON h.component = p.component;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_system_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_system_health() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_system_health() TO authenticated, service_role;
