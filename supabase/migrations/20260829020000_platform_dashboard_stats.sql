-- =========================================================
-- Platform Dashboard Stats — comprehensive single-RPC payload
--
-- get_platform_dashboard_stats() is replaced with a version
-- that returns everything the dashboard needs in ONE call:
--
--   tenants        — total, active, trial, suspended, cancelled,
--                    new this month, new last month, 12-month growth
--   users          — total distinct users, active (seen in 30d),
--                    new this month
--   billing        — MRR, ARR, revenue this month, revenue last month,
--                    failed_payments count, by-plan distribution
--                    (failed payments = past_due subscriptions)
--   tenant_growth  — array of {month, new_tenants, cumulative}
--                    for the last 12 months
--   recent_tenants — last 10 tenants to sign up with plan name
--   recent_activity— last 15 platform audit log entries
--   system         — placeholder counts for health signals
--   support_sessions — active count, today count
--   security_events  — unresolved critical/error counts
--   platform_admins  — total active, by role
--
-- Security: caller must be a platform admin (is_platform_admin()).
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_platform_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now         timestamptz := now();
  v_month_start date        := date_trunc('month', CURRENT_DATE)::date;
  v_last_start  date        := date_trunc('month', CURRENT_DATE - interval '1 month')::date;
  v_last_end    date        := (date_trunc('month', CURRENT_DATE) - interval '1 day')::date;
  v_12m_start   date        := date_trunc('month', CURRENT_DATE - interval '11 months')::date;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(

    -- ── TENANTS ────────────────────────────────────────────────────────────
    'tenants', jsonb_build_object(
      'total',         (SELECT COUNT(*)  FROM public.tenants WHERE deleted_at IS NULL),
      'active',        (SELECT COUNT(*)  FROM public.tenants WHERE deleted_at IS NULL AND status = 'active'),
      'trial',         (
        -- Tenants that have a trial subscription (not a separate status field)
        SELECT COUNT(DISTINCT ts.tenant_id)
        FROM   public.tenant_subscriptions ts
        JOIN   public.tenants t ON t.id = ts.tenant_id
        WHERE  ts.status = 'trial' AND t.deleted_at IS NULL
      ),
      'suspended',     (SELECT COUNT(*)  FROM public.tenants WHERE deleted_at IS NULL AND status = 'suspended'),
      'cancelled',     (SELECT COUNT(*)  FROM public.tenants WHERE deleted_at IS NULL AND status = 'cancelled'),
      'new_this_month',(SELECT COUNT(*)  FROM public.tenants WHERE deleted_at IS NULL AND created_at >= v_month_start),
      'new_last_month',(SELECT COUNT(*)  FROM public.tenants WHERE deleted_at IS NULL AND created_at >= v_last_start AND created_at < v_month_start)
    ),

    -- ── USERS ──────────────────────────────────────────────────────────────
    'users', jsonb_build_object(
      'total',         (SELECT COUNT(DISTINCT user_id) FROM public.user_roles WHERE role != 'super_admin'),
      'active',        (
        -- Users whose profile was updated (last_seen proxy) in the last 30 days
        -- Since we don't have last_login, use created_at of recent profiles
        SELECT COUNT(DISTINCT p.id)
        FROM   public.profiles p
        JOIN   public.user_roles ur ON ur.user_id = p.id
        WHERE  ur.role != 'super_admin'
          AND  p.updated_at >= now() - interval '30 days'
      ),
      'new_this_month',(
        SELECT COUNT(DISTINCT p.id)
        FROM   public.profiles p
        JOIN   public.user_roles ur ON ur.user_id = p.id
        WHERE  ur.role != 'super_admin'
          AND  p.created_at >= v_month_start
      )
    ),

    -- ── BILLING ────────────────────────────────────────────────────────────
    'billing', jsonb_build_object(
      'mrr', (
        -- MRR = sum of price_usd for all active subscriptions
        SELECT COALESCE(SUM(pl.price_usd), 0)
        FROM   public.tenant_subscriptions ts
        JOIN   public.plans pl ON pl.id = ts.plan_id
        WHERE  ts.status = 'active'
      ),
      'arr', (
        SELECT COALESCE(SUM(pl.price_usd) * 12, 0)
        FROM   public.tenant_subscriptions ts
        JOIN   public.plans pl ON pl.id = ts.plan_id
        WHERE  ts.status = 'active'
      ),
      'revenue_this_month', (
        -- New active subscriptions that started this month
        SELECT COALESCE(SUM(pl.price_usd), 0)
        FROM   public.tenant_subscriptions ts
        JOIN   public.plans pl ON pl.id = ts.plan_id
        WHERE  ts.status = 'active'
          AND  ts.current_period_start >= v_month_start
      ),
      'revenue_last_month', (
        SELECT COALESCE(SUM(pl.price_usd), 0)
        FROM   public.tenant_subscriptions ts
        JOIN   public.plans pl ON pl.id = ts.plan_id
        WHERE  ts.status = 'active'
          AND  ts.current_period_start >= v_last_start
          AND  ts.current_period_start < v_month_start
      ),
      'failed_payments', (
        -- past_due subscriptions treated as failed payment indicator
        SELECT COUNT(*) FROM public.tenant_subscriptions WHERE status = 'past_due'
      ),
      'by_plan', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'plan',  pl.name,
            'code',  pl.code,
            'count', cnt,
            'mrr',   cnt * pl.price_usd
          ) ORDER BY pl.sort_order
        )
        FROM (
          SELECT ts.plan_id, COUNT(*) AS cnt
          FROM   public.tenant_subscriptions ts
          WHERE  ts.status IN ('active','trial')
          GROUP  BY ts.plan_id
        ) sub
        JOIN public.plans pl ON pl.id = sub.plan_id
      )
    ),

    -- ── TENANT GROWTH (12 months) ──────────────────────────────────────────
    'tenant_growth', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'month',       month_label,
          'month_iso',   month_iso,
          'new_tenants', new_tenants,
          'cumulative',  cumulative
        )
        ORDER BY month_start
      )
      FROM (
        -- Window function computed in inner query, jsonb_agg in outer query
        SELECT
          m.month_start,
          to_char(m.month_start, 'Mon YY')   AS month_label,
          to_char(m.month_start, 'YYYY-MM')  AS month_iso,
          COALESCE(cnt.new_count, 0)          AS new_tenants,
          SUM(COALESCE(cnt.new_count, 0))
            OVER (ORDER BY m.month_start)     AS cumulative
        FROM (
          SELECT generate_series(
            v_12m_start,
            date_trunc('month', CURRENT_DATE)::date,
            interval '1 month'
          )::date AS month_start
        ) m
        LEFT JOIN (
          SELECT date_trunc('month', created_at)::date AS month_start,
                 COUNT(*) AS new_count
          FROM   public.tenants
          WHERE  deleted_at IS NULL
          GROUP  BY 1
        ) cnt USING (month_start)
      ) windowed
    ),

    -- ── RECENT TENANTS ──────────────────────────────────────────────────────
    'recent_tenants', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',         t.id,
          'name',       t.name,
          'slug',       t.slug,
          'status',     t.status,
          'currency',   t.currency,
          'created_at', t.created_at,
          'plan_name',  pl.name,
          'plan_code',  pl.code
        ) ORDER BY t.created_at DESC
      )
      FROM (SELECT * FROM public.tenants WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 10) t
      LEFT JOIN public.tenant_subscriptions ts ON ts.tenant_id = t.id AND ts.status IN ('active','trial')
      LEFT JOIN public.plans pl ON pl.id = ts.plan_id
    ),

    -- ── RECENT PLATFORM ACTIVITY ────────────────────────────────────────────
    'recent_activity', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',           pal.id,
          'action',       pal.action,
          'actor_email',  pal.actor_email,
          'actor_role',   pal.actor_role,
          'target_label', pal.target_label,
          'target_type',  pal.target_type,
          'created_at',   pal.created_at
        ) ORDER BY pal.created_at DESC
      )
      FROM (
        SELECT * FROM public.platform_audit_log
        ORDER BY created_at DESC LIMIT 15
      ) pal
    ),

    -- ── SYSTEM HEALTH ───────────────────────────────────────────────────────
    'system', jsonb_build_object(
      -- Stale support sessions = sessions that expired but are still "active"
      'stale_sessions', (
        SELECT COUNT(*) FROM public.platform_support_sessions
        WHERE status = 'active' AND expires_at < now()
      ),
      -- Tenants with no subscription (data quality issue)
      'tenants_no_subscription', (
        SELECT COUNT(*)
        FROM   public.tenants t
        WHERE  t.deleted_at IS NULL
          AND  NOT EXISTS (
                 SELECT 1 FROM public.tenant_subscriptions ts
                 WHERE  ts.tenant_id = t.id AND ts.status IN ('active','trial')
               )
      ),
      -- Accounting integrity findings (unresolved errors)
      'integrity_errors', (
        SELECT COUNT(*)
        FROM   public.accounting_integrity_findings
        WHERE  resolved_at IS NULL AND severity = 'error'
      ),
      'integrity_warnings', (
        SELECT COUNT(*)
        FROM   public.accounting_integrity_findings
        WHERE  resolved_at IS NULL AND severity = 'warning'
      )
    ),

    -- ── SUPPORT SESSIONS ────────────────────────────────────────────────────
    'support_sessions', jsonb_build_object(
      'active', (
        SELECT COUNT(*) FROM public.platform_support_sessions
        WHERE status = 'active' AND expires_at > now()
      ),
      'today', (
        SELECT COUNT(*) FROM public.platform_support_sessions
        WHERE started_at >= CURRENT_DATE
      ),
      'this_month', (
        SELECT COUNT(*) FROM public.platform_support_sessions
        WHERE started_at >= v_month_start
      )
    ),

    -- ── SECURITY EVENTS ─────────────────────────────────────────────────────
    'security_events', jsonb_build_object(
      'unresolved_critical', (
        SELECT COUNT(*) FROM public.platform_security_events
        WHERE resolved = false AND severity = 'critical'
      ),
      'unresolved_error', (
        SELECT COUNT(*) FROM public.platform_security_events
        WHERE resolved = false AND severity = 'error'
      ),
      'unresolved_warning', (
        SELECT COUNT(*) FROM public.platform_security_events
        WHERE resolved = false AND severity = 'warning'
      ),
      'total_unresolved', (
        SELECT COUNT(*) FROM public.platform_security_events WHERE resolved = false
      )
    ),

    -- ── PLATFORM ADMINS ─────────────────────────────────────────────────────
    'platform_admins', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM public.platform_admins WHERE is_active = true AND revoked_at IS NULL),
      'by_role', (
        SELECT jsonb_object_agg(platform_role, cnt)
        FROM (
          SELECT platform_role, COUNT(*) AS cnt
          FROM   public.platform_admins
          WHERE  is_active = true AND revoked_at IS NULL
          GROUP  BY platform_role
        ) r
      )
    ),

    -- ── METADATA ───────────────────────────────────────────────────────────
    'generated_at', v_now,
    'generated_by', (SELECT email FROM public.platform_admins WHERE user_id = auth.uid())

  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_platform_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_dashboard_stats() TO authenticated;
