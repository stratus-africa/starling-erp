-- =========================================================
-- list_platform_tenants(_search, _status, _plan_code, _limit, _offset)
--
-- Called by the Super Admin tenant list page.
-- Returns all tenants with their active subscription plan and user count.
-- Supports full-text search on name/slug, status filter, plan filter,
-- and cursor-based pagination via limit/offset.
--
-- Security: caller must have platform.tenants.view permission.
-- =========================================================

CREATE OR REPLACE FUNCTION public.list_platform_tenants(
  _search    text    DEFAULT NULL,
  _status    text    DEFAULT NULL,
  _plan_code text    DEFAULT NULL,
  _limit     integer DEFAULT 100,
  _offset    integer DEFAULT 0
)
RETURNS TABLE (
  id            uuid,
  name          text,
  slug          text,
  currency      text,
  status        text,
  created_at    timestamptz,
  updated_at    timestamptz,
  user_count    bigint,
  plan_id       uuid,
  plan_name     text,
  plan_code     text,
  plan_price    numeric,
  sub_status    text,
  trial_ends_at timestamptz,
  total_count   bigint    -- window count for pagination
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_platform_permission('platform.tenants.view') THEN
    RAISE EXCEPTION 'Not authorized: platform.tenants.view' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      t.id,
      t.name,
      t.slug,
      t.currency,
      t.status,
      t.created_at,
      t.updated_at
    FROM public.tenants t
    WHERE t.deleted_at IS NULL
      -- Status filter
      AND (_status IS NULL OR t.status = _status)
      -- Search filter (case-insensitive substring on name or slug)
      AND (
        _search IS NULL
        OR t.name  ILIKE '%' || _search || '%'
        OR t.slug  ILIKE '%' || _search || '%'
      )
  ),
  with_counts AS (
    SELECT
      b.*,
      COUNT(*) OVER () AS total_count,
      -- User count: profiles linked to this tenant
      (
        SELECT COUNT(*)
        FROM public.profiles p
        WHERE p.tenant_id = b.id
      ) AS user_count
    FROM base b
  ),
  with_sub AS (
    SELECT
      wc.*,
      ts.id        AS sub_id,
      ts.plan_id,
      ts.status    AS sub_status,
      ts.trial_ends_at,
      pl.name      AS plan_name,
      pl.code      AS plan_code,
      pl.price_usd AS plan_price
    FROM with_counts wc
    LEFT JOIN LATERAL (
      SELECT ts2.id, ts2.plan_id, ts2.status, ts2.trial_ends_at
      FROM public.tenant_subscriptions ts2
      WHERE ts2.tenant_id = wc.id
      ORDER BY
        -- Prefer active/trial over cancelled/suspended
        CASE ts2.status
          WHEN 'active'    THEN 1
          WHEN 'trial'     THEN 2
          WHEN 'past_due'  THEN 3
          WHEN 'suspended' THEN 4
          ELSE             5
        END,
        ts2.created_at DESC
      LIMIT 1
    ) ts ON true
    LEFT JOIN public.plans pl ON pl.id = ts.plan_id
    -- Plan code filter (applied after join)
    WHERE (_plan_code IS NULL OR pl.code = _plan_code)
  )
  SELECT
    ws.id,
    ws.name,
    ws.slug,
    ws.currency,
    ws.status,
    ws.created_at,
    ws.updated_at,
    ws.user_count,
    ws.plan_id,
    ws.plan_name,
    ws.plan_code,
    ws.plan_price,
    ws.sub_status,
    ws.trial_ends_at,
    ws.total_count
  FROM with_sub ws
  ORDER BY ws.created_at DESC
  LIMIT  LEAST(COALESCE(_limit, 100), 500)
  OFFSET COALESCE(_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.list_platform_tenants(text, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_platform_tenants(text, text, text, integer, integer) TO authenticated;
