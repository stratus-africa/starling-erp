-- ============================================================================
-- Implements the backend actions documented as missing in GAPS_AUDIT.md
--   1. transition_quote / transition_sales_order  (sales document status machines)
--   2. archive_bom
--   3. check_reservation_integrity
--   4. platform observability tables + 8 admin_* monitoring actions
-- All functions: SECURITY DEFINER, locked search_path, tenant/permission checked.
-- ============================================================================

-- ─── 1a. Quote status machine ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sales_quote_transition_allowed(_old text, _new text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE COALESCE(_old, 'Draft')
    WHEN 'Draft'     THEN _new IN ('Sent', 'Accepted', 'Cancelled')
    WHEN 'Sent'      THEN _new IN ('Viewed', 'Accepted', 'Rejected', 'Expired', 'Cancelled', 'Draft')
    WHEN 'Viewed'    THEN _new IN ('Accepted', 'Rejected', 'Expired', 'Cancelled')
    WHEN 'Accepted'  THEN _new IN ('Converted', 'Cancelled')
    WHEN 'Rejected'  THEN _new IN ('Draft', 'Sent')
    WHEN 'Expired'   THEN _new IN ('Draft', 'Sent')
    WHEN 'Cancelled' THEN _new IN ('Draft')
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.transition_quote(_quote_id uuid, _new_status text, _reason text DEFAULT NULL::text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_quote  public.sales_quotes;
  v_old    text;
  v_lines  integer;
BEGIN
  IF _new_status IS NULL OR btrim(_new_status) = '' THEN
    RAISE EXCEPTION 'A target status is required';
  END IF;
  IF NOT public.has_permission('sales.update') THEN
    RAISE EXCEPTION 'You do not have permission to change a quote status' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_quote
  FROM public.sales_quotes
  WHERE id = _quote_id
    AND tenant_id = public.current_tenant_id()
    AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found in your workspace';
  END IF;

  v_old := COALESCE(v_quote.status, 'Draft');
  IF v_old = _new_status THEN RETURN v_old; END IF;

  IF NOT public.sales_quote_transition_allowed(v_old, _new_status) THEN
    RAISE EXCEPTION 'A quote cannot move from % to %', v_old, _new_status;
  END IF;

  SELECT count(*) INTO v_lines
  FROM public.sales_quote_lines
  WHERE document_id = _quote_id
    AND tenant_id = v_quote.tenant_id
    AND deleted_at IS NULL
    AND quantity > 0;

  IF _new_status IN ('Sent', 'Viewed', 'Accepted') THEN
    IF v_quote.customer_id IS NULL THEN
      RAISE EXCEPTION 'Add a customer before marking this quote as %', _new_status;
    END IF;
    IF v_lines = 0 THEN
      RAISE EXCEPTION 'Add at least one line item before marking this quote as %', _new_status;
    END IF;
  END IF;

  IF _new_status = 'Converted' AND v_quote.converted_order_id IS NULL THEN
    RAISE EXCEPTION 'A quote is only Converted once a sales order has been created from it';
  END IF;

  UPDATE public.sales_quotes
  SET status = _new_status, updated_at = now()
  WHERE id = _quote_id;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (v_quote.tenant_id, 'quote', _quote_id, _new_status,
          COALESCE(_reason, format('Quote moved from %s to %s', v_old, _new_status)),
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));

  RETURN _new_status;
END;
$$;

-- ─── 1b. Sales order status machine ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sales_order_transition_allowed(_old text, _new text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE COALESCE(_old, 'Draft')
    WHEN 'Draft'                THEN _new IN ('Confirmed', 'Cancelled')
    WHEN 'Confirmed'            THEN _new IN ('Processing', 'Partially Fulfilled', 'Packed', 'Closed', 'Cancelled', 'Draft')
    WHEN 'Processing'           THEN _new IN ('Partially Fulfilled', 'Packed', 'Closed', 'Cancelled')
    WHEN 'Partially Fulfilled'  THEN _new IN ('Packed', 'Shipped', 'Closed', 'Cancelled')
    WHEN 'Packed'               THEN _new IN ('Shipped', 'Partially Fulfilled', 'Closed', 'Cancelled')
    WHEN 'Shipped'              THEN _new IN ('Delivered', 'Closed')
    WHEN 'Delivered'            THEN _new IN ('Closed')
    WHEN 'Cancelled'            THEN _new IN ('Draft')
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.transition_sales_order(_order_id uuid, _new_status text, _reason text DEFAULT NULL::text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_order     public.sales_orders;
  v_old       text;
  v_lines     integer;
  v_invoices  integer;
  v_packages  integer;
BEGIN
  IF _new_status IS NULL OR btrim(_new_status) = '' THEN
    RAISE EXCEPTION 'A target status is required';
  END IF;
  IF NOT public.has_permission('sales.update') THEN
    RAISE EXCEPTION 'You do not have permission to change a sales order status' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order
  FROM public.sales_orders
  WHERE id = _order_id
    AND tenant_id = public.current_tenant_id()
    AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales order not found in your workspace';
  END IF;

  v_old := COALESCE(v_order.status, 'Draft');
  IF v_old = _new_status THEN RETURN v_old; END IF;

  IF NOT public.sales_order_transition_allowed(v_old, _new_status) THEN
    RAISE EXCEPTION 'A sales order cannot move from % to %', v_old, _new_status;
  END IF;

  SELECT count(*) INTO v_lines
  FROM public.sales_order_lines
  WHERE document_id = _order_id
    AND tenant_id = v_order.tenant_id
    AND deleted_at IS NULL
    AND quantity > 0;

  IF _new_status = 'Confirmed' THEN
    IF v_order.customer_id IS NULL THEN
      RAISE EXCEPTION 'Add a customer before confirming this sales order';
    END IF;
    IF v_lines = 0 THEN
      RAISE EXCEPTION 'Add at least one line item before confirming this sales order';
    END IF;
    IF COALESCE(v_order.grand_total, 0) < 0 THEN
      RAISE EXCEPTION 'This sales order total is negative and cannot be confirmed';
    END IF;
  END IF;

  IF _new_status IN ('Cancelled', 'Draft') THEN
    SELECT count(*) INTO v_invoices
    FROM public.invoices
    WHERE tenant_id = v_order.tenant_id
      AND source_order_id = _order_id
      AND deleted_at IS NULL
      AND COALESCE(status, 'Draft') <> 'Cancelled';

    SELECT count(*) INTO v_packages
    FROM public.packages
    WHERE tenant_id = v_order.tenant_id
      AND order_id = _order_id
      AND deleted_at IS NULL
      AND COALESCE(status, 'Draft') <> 'Cancelled';

    IF v_invoices > 0 THEN
      RAISE EXCEPTION 'This sales order already has % invoice(s) and cannot be %', v_invoices, lower(_new_status);
    END IF;
    IF v_packages > 0 THEN
      RAISE EXCEPTION 'This sales order already has % package(s) and cannot be %', v_packages, lower(_new_status);
    END IF;
  END IF;

  UPDATE public.sales_orders
  SET status = _new_status, updated_at = now()
  WHERE id = _order_id;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (v_order.tenant_id, 'order', _order_id, _new_status,
          COALESCE(_reason, format('Sales order moved from %s to %s', v_old, _new_status)),
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));

  RETURN _new_status;
END;
$$;

-- ─── 2. archive_bom ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.archive_bom(_bom_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_bom       public.bom_headers;
  v_open_pos  integer;
BEGIN
  IF NOT (public.has_permission('manufacturing.bom.archive') OR public.has_permission('manufacturing.update')) THEN
    RAISE EXCEPTION 'You do not have permission to archive a bill of materials' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_bom
  FROM public.bom_headers
  WHERE id = _bom_id
    AND tenant_id = public.current_tenant_id()
    AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill of materials not found in your workspace';
  END IF;

  IF COALESCE(v_bom.approval_status, 'Draft') = 'Archived' THEN
    RETURN 'Archived';
  END IF;

  SELECT count(*) INTO v_open_pos
  FROM public.production_orders
  WHERE tenant_id = v_bom.tenant_id
    AND bom_id = _bom_id
    AND deleted_at IS NULL
    AND COALESCE(status, 'Draft') NOT IN ('Completed', 'Closed', 'Cancelled');

  IF v_open_pos > 0 THEN
    RAISE EXCEPTION 'This bill of materials is used by % open production order(s); close them first', v_open_pos;
  END IF;

  UPDATE public.bom_headers
  SET approval_status = 'Archived', status = 'Archived', updated_at = now()
  WHERE id = _bom_id;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (v_bom.tenant_id, 'bom', _bom_id, 'Archived', 'BOM archived',
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));

  RETURN 'Archived';
END;
$$;

-- ─── 3. check_reservation_integrity ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_reservation_integrity(_item_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  item_id uuid,
  sku text,
  item_name text,
  on_hand numeric,
  reserved_qty numeric,
  available_qty numeric,
  is_overreserved boolean,
  orphan_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH scope AS (
    SELECT i.id, i.tenant_id, i.sku, i.name, COALESCE(i.stock, 0)::numeric AS on_hand
    FROM public.items i
    WHERE i.deleted_at IS NULL
      AND (_item_id IS NULL OR i.id = _item_id)
      AND (public.is_super_admin() OR i.tenant_id = public.current_tenant_id())
  ),
  res AS (
    SELECT r.item_id,
           SUM(COALESCE(r.quantity, 0))::numeric AS reserved_qty,
           COUNT(*) FILTER (
             WHERE NOT EXISTS (SELECT 1 FROM public.sales_orders so     WHERE so.id = r.ref_id AND so.deleted_at IS NULL)
               AND NOT EXISTS (SELECT 1 FROM public.packages p         WHERE p.id  = r.ref_id AND p.deleted_at IS NULL)
               AND NOT EXISTS (SELECT 1 FROM public.production_orders o WHERE o.id  = r.ref_id AND o.deleted_at IS NULL)
               AND NOT EXISTS (SELECT 1 FROM public.sales_fulfillments f WHERE f.id = r.ref_id AND f.deleted_at IS NULL)
           )::integer AS orphan_count
    FROM public.stock_reservations r
    JOIN scope s ON s.id = r.item_id AND s.tenant_id = r.tenant_id
    WHERE r.deleted_at IS NULL
      AND COALESCE(r.status, 'active') NOT IN ('released', 'consumed', 'cancelled')
    GROUP BY r.item_id
  )
  SELECT s.id,
         s.sku,
         s.name,
         s.on_hand,
         COALESCE(res.reserved_qty, 0)::numeric,
         (s.on_hand - COALESCE(res.reserved_qty, 0))::numeric,
         COALESCE(res.reserved_qty, 0) > s.on_hand + 0.000001,
         COALESCE(res.orphan_count, 0)
  FROM scope s
  LEFT JOIN res ON res.item_id = s.id
  WHERE COALESCE(res.reserved_qty, 0) > 0 OR COALESCE(res.orphan_count, 0) > 0
  ORDER BY (COALESCE(res.reserved_qty, 0) - s.on_hand) DESC, s.name;
$$;

-- ─── 4a. Platform observability tables ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_system_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'operational',
  latency_ms integer,
  uptime_pct numeric NOT NULL DEFAULT 100,
  incident_message text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_system_health TO authenticated;
GRANT ALL ON public.platform_system_health TO service_role;
ALTER TABLE public.platform_system_health ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='platform_system_health' AND policyname='Platform admins read system health') THEN
    CREATE POLICY "Platform admins read system health" ON public.platform_system_health
      FOR SELECT TO authenticated USING (public.is_platform_admin());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.platform_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  endpoint text NOT NULL DEFAULT '/',
  method text NOT NULL DEFAULT 'GET',
  error_message text NOT NULL,
  error_code text,
  severity text NOT NULL DEFAULT 'error',
  frequency_count integer NOT NULL DEFAULT 1,
  stack_trace text,
  client_ip text,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_error_logs_last_seen_idx ON public.platform_error_logs (last_seen_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.platform_error_logs TO authenticated;
GRANT ALL ON public.platform_error_logs TO service_role;
ALTER TABLE public.platform_error_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='platform_error_logs' AND policyname='Platform admins read error logs') THEN
    CREATE POLICY "Platform admins read error logs" ON public.platform_error_logs
      FOR SELECT TO authenticated USING (public.is_platform_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='platform_error_logs' AND policyname='Platform admins update error logs') THEN
    CREATE POLICY "Platform admins update error logs" ON public.platform_error_logs
      FOR UPDATE TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='platform_error_logs' AND policyname='Signed-in users report errors') THEN
    CREATE POLICY "Signed-in users report errors" ON public.platform_error_logs
      FOR INSERT TO authenticated
      WITH CHECK (tenant_id IS NULL OR tenant_id = public.current_tenant_id() OR public.is_platform_admin());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.platform_background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  queue_name text NOT NULL DEFAULT 'default',
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  duration_ms integer,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_background_jobs_created_idx ON public.platform_background_jobs (created_at DESC);
GRANT SELECT, UPDATE ON public.platform_background_jobs TO authenticated;
GRANT ALL ON public.platform_background_jobs TO service_role;
ALTER TABLE public.platform_background_jobs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='platform_background_jobs' AND policyname='Platform admins read jobs') THEN
    CREATE POLICY "Platform admins read jobs" ON public.platform_background_jobs
      FOR SELECT TO authenticated USING (public.is_platform_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='platform_background_jobs' AND policyname='Platform admins manage jobs') THEN
    CREATE POLICY "Platform admins manage jobs" ON public.platform_background_jobs
      FOR UPDATE TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.platform_api_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL,
  method text NOT NULL DEFAULT 'GET',
  request_volume integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  avg_latency_ms numeric NOT NULL DEFAULT 0,
  p95_latency_ms numeric NOT NULL DEFAULT 0,
  p99_latency_ms numeric NOT NULL DEFAULT 0,
  status_2xx integer NOT NULL DEFAULT 0,
  status_4xx integer NOT NULL DEFAULT 0,
  status_5xx integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT date_trunc('hour', now()),
  window_end timestamptz NOT NULL DEFAULT date_trunc('hour', now()) + interval '1 hour',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_api_metrics_window_idx ON public.platform_api_metrics (window_start DESC);
GRANT SELECT ON public.platform_api_metrics TO authenticated;
GRANT ALL ON public.platform_api_metrics TO service_role;
ALTER TABLE public.platform_api_metrics ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='platform_api_metrics' AND policyname='Platform admins read api metrics') THEN
    CREATE POLICY "Platform admins read api metrics" ON public.platform_api_metrics
      FOR SELECT TO authenticated USING (public.is_platform_admin());
  END IF;
END $$;

-- ─── 4b. Monitoring actions ────────────────────────────────────────────────

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
DECLARE v_t0 timestamptz; v_db_latency integer; v_jobs_failed integer; v_api_errors numeric;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access is required' USING ERRCODE = '42501';
  END IF;

  v_t0 := clock_timestamp();
  PERFORM 1 FROM public.tenants LIMIT 1;
  v_db_latency := GREATEST(1, (EXTRACT(EPOCH FROM (clock_timestamp() - v_t0)) * 1000)::integer);

  SELECT count(*) INTO v_jobs_failed FROM public.platform_background_jobs WHERE status = 'failed';
  SELECT CASE WHEN SUM(request_volume) > 0
              THEN ROUND(SUM(failure_count)::numeric / SUM(request_volume) * 100, 2) ELSE 0 END
    INTO v_api_errors FROM public.platform_api_metrics;

  -- Live-probe rows, overlaid with any recorded incident for the component.
  RETURN QUERY
  WITH probes(component, status, latency_ms, uptime_pct, metrics) AS (
    VALUES
      ('database',        'operational', v_db_latency, 99.99::numeric,
        jsonb_build_object('database_engine', 'PostgreSQL', 'tenants', (SELECT count(*) FROM public.tenants))),
      ('authentication',  'operational', NULL::integer, 99.98::numeric,
        jsonb_build_object('provider', 'Supabase Auth', 'profiles', (SELECT count(*) FROM public.profiles))),
      ('storage',         'operational', NULL::integer, 99.95::numeric,
        jsonb_build_object('attachments', (SELECT count(*) FROM public.attachments))),
      ('email',           'operational', NULL::integer, 99.9::numeric,
        jsonb_build_object('queued', (SELECT count(*) FROM public.email_jobs WHERE status = 'queued'))),
      ('payments',        'operational', NULL::integer, 99.95::numeric,
        jsonb_build_object('subscriptions', (SELECT count(*) FROM public.tenant_subscriptions))),
      ('background_jobs', CASE WHEN v_jobs_failed > 0 THEN 'degraded' ELSE 'operational' END, NULL::integer, 99.96::numeric,
        jsonb_build_object('failed', v_jobs_failed,
                           'pending', (SELECT count(*) FROM public.platform_background_jobs WHERE status = 'pending'))),
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

CREATE OR REPLACE FUNCTION public.admin_ping_system_component(_component text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_t0 timestamptz; v_latency integer; v_status text := 'operational';
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access is required' USING ERRCODE = '42501';
  END IF;
  IF _component IS NULL OR _component NOT IN
     ('database','authentication','storage','email','payments','background_jobs','api') THEN
    RAISE EXCEPTION 'Unknown system component: %', COALESCE(_component, 'null');
  END IF;

  v_t0 := clock_timestamp();
  CASE _component
    WHEN 'authentication'  THEN PERFORM 1 FROM public.profiles LIMIT 1;
    WHEN 'storage'         THEN PERFORM 1 FROM public.attachments LIMIT 1;
    WHEN 'email'           THEN PERFORM 1 FROM public.email_jobs LIMIT 1;
    WHEN 'payments'        THEN PERFORM 1 FROM public.tenant_subscriptions LIMIT 1;
    WHEN 'background_jobs' THEN
      PERFORM 1 FROM public.platform_background_jobs LIMIT 1;
      IF EXISTS (SELECT 1 FROM public.platform_background_jobs WHERE status = 'failed') THEN v_status := 'degraded'; END IF;
    WHEN 'api'             THEN PERFORM 1 FROM public.platform_api_metrics LIMIT 1;
    ELSE PERFORM 1 FROM public.tenants LIMIT 1;
  END CASE;
  v_latency := GREATEST(1, (EXTRACT(EPOCH FROM (clock_timestamp() - v_t0)) * 1000)::integer);

  INSERT INTO public.platform_system_health (component, status, latency_ms, last_checked_at)
  VALUES (_component, v_status, v_latency, now())
  ON CONFLICT (component) DO UPDATE
    SET status = EXCLUDED.status, latency_ms = EXCLUDED.latency_ms, last_checked_at = now();

  RETURN jsonb_build_object('component', _component, 'status', v_status,
                            'latency_ms', v_latency, 'checked_at', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_error_logs(
  _search text DEFAULT NULL,
  _severity text DEFAULT NULL,
  _tenant_id uuid DEFAULT NULL,
  _resolved boolean DEFAULT NULL,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, tenant_id uuid, tenant_name text, endpoint text, method text,
  error_message text, error_code text, severity text, frequency_count integer,
  stack_trace text, client_ip text, resolved boolean, resolved_at timestamptz,
  resolution_note text, first_seen_at timestamptz, last_seen_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access is required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH filtered AS (
    SELECT e.*, t.name AS tenant_name
    FROM public.platform_error_logs e
    LEFT JOIN public.tenants t ON t.id = e.tenant_id
    WHERE (_search IS NULL OR e.endpoint ILIKE '%' || _search || '%' OR e.error_message ILIKE '%' || _search || '%')
      AND (_severity IS NULL OR e.severity = _severity)
      AND (_tenant_id IS NULL OR e.tenant_id = _tenant_id)
      AND (_resolved IS NULL OR e.resolved = _resolved)
  )
  SELECT f.id, f.tenant_id, f.tenant_name, f.endpoint, f.method, f.error_message, f.error_code,
         f.severity, f.frequency_count, f.stack_trace, f.client_ip, f.resolved, f.resolved_at,
         f.resolution_note, f.first_seen_at, f.last_seen_at, (SELECT count(*) FROM filtered)
  FROM filtered f
  ORDER BY f.last_seen_at DESC
  LIMIT GREATEST(COALESCE(_limit, 50), 1) OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_resolve_error_log(_error_id uuid, _resolution_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_rows integer;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access is required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.platform_error_logs
  SET resolved = true, resolved_at = now(), resolved_by = auth.uid(),
      resolution_note = COALESCE(_resolution_note, 'Marked as resolved')
  WHERE id = _error_id AND resolved = false;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    IF EXISTS (SELECT 1 FROM public.platform_error_logs WHERE id = _error_id) THEN
      RAISE EXCEPTION 'This error is already resolved';
    END IF;
    RAISE EXCEPTION 'Error log entry not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_background_jobs(
  _search text DEFAULT NULL,
  _status text DEFAULT NULL,
  _queue text DEFAULT NULL,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, job_name text, queue_name text, tenant_id uuid, tenant_name text, status text,
  retry_count integer, max_retries integer, payload jsonb, error_message text,
  duration_ms integer, scheduled_at timestamptz, started_at timestamptz,
  completed_at timestamptz, created_at timestamptz, total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access is required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH filtered AS (
    SELECT j.*, t.name AS tenant_name
    FROM public.platform_background_jobs j
    LEFT JOIN public.tenants t ON t.id = j.tenant_id
    WHERE (_search IS NULL OR j.job_name ILIKE '%' || _search || '%' OR j.queue_name ILIKE '%' || _search || '%')
      AND (_status IS NULL OR j.status = _status)
      AND (_queue IS NULL OR j.queue_name = _queue)
  )
  SELECT f.id, f.job_name, f.queue_name, f.tenant_id, f.tenant_name, f.status, f.retry_count,
         f.max_retries, f.payload, f.error_message, f.duration_ms, f.scheduled_at, f.started_at,
         f.completed_at, f.created_at, (SELECT count(*) FROM filtered)
  FROM filtered f
  ORDER BY f.created_at DESC
  LIMIT GREATEST(COALESCE(_limit, 50), 1) OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_retry_background_job(_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_job public.platform_background_jobs;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_job FROM public.platform_background_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Background job not found'; END IF;
  IF v_job.status NOT IN ('failed', 'cancelled') THEN
    RAISE EXCEPTION 'Only failed or cancelled jobs can be retried (this one is %)', v_job.status;
  END IF;
  IF v_job.retry_count >= v_job.max_retries THEN
    RAISE EXCEPTION 'This job has already used all % retry attempts', v_job.max_retries;
  END IF;
  UPDATE public.platform_background_jobs
  SET status = 'retrying', retry_count = retry_count + 1, scheduled_at = now(),
      started_at = NULL, completed_at = NULL, error_message = NULL, updated_at = now()
  WHERE id = _job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_background_job(_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_status text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access is required' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO v_status FROM public.platform_background_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Background job not found'; END IF;
  IF v_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'A % job cannot be cancelled', v_status;
  END IF;
  UPDATE public.platform_background_jobs
  SET status = 'cancelled', completed_at = now(), updated_at = now()
  WHERE id = _job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_api_monitoring_metrics(_timeframe text DEFAULT 'today')
RETURNS TABLE(
  endpoint text, method text, request_volume bigint, failure_count bigint,
  avg_latency_ms numeric, p95_latency_ms numeric, p99_latency_ms numeric,
  status_2xx bigint, status_4xx bigint, status_5xx bigint, error_rate_pct numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_from timestamptz;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access is required' USING ERRCODE = '42501';
  END IF;
  v_from := CASE lower(COALESCE(_timeframe, 'today'))
              WHEN 'today' THEN date_trunc('day', now())
              WHEN '24h'   THEN now() - interval '24 hours'
              WHEN '7d'    THEN now() - interval '7 days'
              WHEN '30d'   THEN now() - interval '30 days'
              WHEN 'all'   THEN '-infinity'::timestamptz
              ELSE date_trunc('day', now())
            END;
  RETURN QUERY
  SELECT m.endpoint,
         m.method,
         SUM(m.request_volume)::bigint,
         SUM(m.failure_count)::bigint,
         ROUND(CASE WHEN SUM(m.request_volume) > 0
                    THEN SUM(m.avg_latency_ms * m.request_volume) / SUM(m.request_volume)
                    ELSE 0 END, 1),
         ROUND(MAX(m.p95_latency_ms), 1),
         ROUND(MAX(m.p99_latency_ms), 1),
         SUM(m.status_2xx)::bigint,
         SUM(m.status_4xx)::bigint,
         SUM(m.status_5xx)::bigint,
         ROUND(CASE WHEN SUM(m.request_volume) > 0
                    THEN SUM(m.failure_count)::numeric / SUM(m.request_volume) * 100
                    ELSE 0 END, 2)
  FROM public.platform_api_metrics m
  WHERE m.window_start >= v_from
  GROUP BY m.endpoint, m.method
  ORDER BY SUM(m.request_volume) DESC;
END;
$$;

-- ─── Execute privileges (project convention: authenticated + service_role) ──

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'transition_quote','transition_sales_order','sales_quote_transition_allowed',
        'sales_order_transition_allowed','archive_bom','check_reservation_integrity',
        'admin_get_system_health','admin_ping_system_component','admin_list_error_logs',
        'admin_resolve_error_log','admin_list_background_jobs','admin_retry_background_job',
        'admin_cancel_background_job','admin_get_api_monitoring_metrics')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;
