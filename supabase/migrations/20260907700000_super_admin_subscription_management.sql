-- ==============================================================================
-- Super Admin Subscription Management Architecture
-- Migration: 20260907700000_super_admin_subscription_management.sql
-- ==============================================================================

-- 1. Enhance `public.tenant_subscriptions` table
DO $$
BEGIN
  -- Drop existing status check constraint if present
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_schema = 'public'
      AND table_name = 'tenant_subscriptions'
      AND constraint_name = 'sub_status_check'
  ) THEN
    ALTER TABLE public.tenant_subscriptions DROP CONSTRAINT sub_status_check;
  END IF;

  -- Re-add comprehensive status constraint
  ALTER TABLE public.tenant_subscriptions
    ADD CONSTRAINT sub_status_check
    CHECK (status IN ('trialing', 'trial', 'active', 'past_due', 'paused', 'suspended', 'cancelled', 'expired'));

  -- Add payment_status column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenant_subscriptions' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE public.tenant_subscriptions
      ADD COLUMN payment_status text NOT NULL DEFAULT 'paid'
      CONSTRAINT sub_payment_status_check CHECK (payment_status IN ('paid', 'pending', 'overdue', 'failed', 'trial'));
  END IF;

  -- Add cancel_at_period_end
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenant_subscriptions' AND column_name = 'cancel_at_period_end'
  ) THEN
    ALTER TABLE public.tenant_subscriptions ADD COLUMN cancel_at_period_end boolean NOT NULL DEFAULT false;
  END IF;

  -- Add cancellation_reason
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenant_subscriptions' AND column_name = 'cancellation_reason'
  ) THEN
    ALTER TABLE public.tenant_subscriptions ADD COLUMN cancellation_reason text;
  END IF;

  -- Add amount
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenant_subscriptions' AND column_name = 'amount'
  ) THEN
    ALTER TABLE public.tenant_subscriptions ADD COLUMN amount numeric(10,2);
  END IF;

  -- Add currency
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenant_subscriptions' AND column_name = 'currency'
  ) THEN
    ALTER TABLE public.tenant_subscriptions ADD COLUMN currency text NOT NULL DEFAULT 'USD';
  END IF;

  -- Add billing_interval
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenant_subscriptions' AND column_name = 'billing_interval'
  ) THEN
    ALTER TABLE public.tenant_subscriptions ADD COLUMN billing_interval text NOT NULL DEFAULT 'monthly';
  END IF;
END $$;

-- Populate missing amounts from plans
UPDATE public.tenant_subscriptions ts
SET amount = p.price_usd,
    currency = COALESCE(p.currency, 'USD'),
    billing_interval = COALESCE(p.billing_interval, 'monthly')
FROM public.plans p
WHERE ts.plan_id = p.id AND ts.amount IS NULL;

-- 2. RPC: Super Admin List Tenant Subscriptions
CREATE OR REPLACE FUNCTION public.admin_list_tenant_subscriptions(
  _search text DEFAULT NULL,
  _status text DEFAULT NULL,
  _plan_id uuid DEFAULT NULL,
  _payment_status text DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  tenant_name text,
  tenant_slug text,
  plan_id uuid,
  plan_name text,
  plan_code text,
  plan_price numeric,
  status text,
  payment_status text,
  amount numeric,
  currency text,
  billing_interval text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  is_trialing boolean,
  trial_days_remaining int,
  cancelled_at timestamptz,
  cancel_at_period_end boolean,
  cancellation_reason text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_has_perm boolean;
BEGIN
  v_has_perm := public.has_platform_permission(v_caller_id, 'platform.billing.view')
             OR public.has_platform_permission(v_caller_id, 'platform.plans.view')
             OR public.has_platform_role(v_caller_id, 'super_admin')
             OR public.has_platform_role(v_caller_id, 'platform_admin')
             OR public.has_platform_role(v_caller_id, 'billing_admin');

  IF NOT v_has_perm THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to view tenant subscriptions';
  END IF;

  RETURN QUERY
  WITH sub_base AS (
    SELECT
      ts.id,
      ts.tenant_id,
      t.name AS tenant_name,
      t.slug AS tenant_slug,
      ts.plan_id,
      p.name AS plan_name,
      p.code AS plan_code,
      p.price_usd AS plan_price,
      ts.status,
      ts.payment_status,
      COALESCE(ts.amount, p.price_usd, 0) AS amount,
      COALESCE(ts.currency, p.currency, 'USD') AS currency,
      COALESCE(ts.billing_interval, p.billing_interval, 'monthly') AS billing_interval,
      ts.current_period_start,
      ts.current_period_end,
      ts.trial_ends_at,
      (ts.status IN ('trial', 'trialing') OR (ts.trial_ends_at IS NOT NULL AND ts.trial_ends_at > now())) AS is_trialing,
      CASE
        WHEN ts.trial_ends_at IS NOT NULL AND ts.trial_ends_at > now()
        THEN GREATEST(0, EXTRACT(DAY FROM (ts.trial_ends_at - now()))::int)
        ELSE 0
      END AS trial_days_remaining,
      ts.cancelled_at,
      ts.cancel_at_period_end,
      ts.cancellation_reason,
      ts.notes,
      ts.created_at,
      ts.updated_at
    FROM public.tenant_subscriptions ts
    JOIN public.tenants t ON t.id = ts.tenant_id
    JOIN public.plans p ON p.id = ts.plan_id
    WHERE (
      _search IS NULL
      OR t.name ILIKE '%' || _search || '%'
      OR t.slug ILIKE '%' || _search || '%'
      OR p.name ILIKE '%' || _search || '%'
    )
    AND (
      _status IS NULL
      OR _status = 'all'
      OR (
        CASE
          WHEN _status = 'trialing' THEN ts.status IN ('trial', 'trialing')
          WHEN _status = 'paused' THEN ts.status IN ('paused', 'suspended')
          ELSE ts.status = _status
        END
      )
    )
    AND (_plan_id IS NULL OR ts.plan_id = _plan_id)
    AND (_payment_status IS NULL OR _payment_status = 'all' OR ts.payment_status = _payment_status)
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM sub_base
  )
  SELECT
    sb.id,
    sb.tenant_id,
    sb.tenant_name,
    sb.tenant_slug,
    sb.plan_id,
    sb.plan_name,
    sb.plan_code,
    sb.plan_price,
    sb.status,
    sb.payment_status,
    sb.amount,
    sb.currency,
    sb.billing_interval,
    sb.current_period_start,
    sb.current_period_end,
    sb.trial_ends_at,
    sb.is_trialing,
    sb.trial_days_remaining,
    sb.cancelled_at,
    sb.cancel_at_period_end,
    sb.cancellation_reason,
    sb.notes,
    sb.created_at,
    sb.updated_at,
    c.cnt AS total_count
  FROM sub_base sb
  CROSS JOIN counted c
  ORDER BY sb.created_at DESC
  LIMIT _limit
  OFFSET _offset;
END;
$$;

-- 3. RPC: Super Admin Get Subscription Detail
CREATE OR REPLACE FUNCTION public.admin_get_subscription_detail(
  _subscription_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_sub RECORD;
  v_history jsonb;
  v_audit_events jsonb;
BEGIN
  IF NOT (
    public.has_platform_permission(v_caller_id, 'platform.billing.view')
    OR public.has_platform_role(v_caller_id, 'super_admin')
    OR public.has_platform_role(v_caller_id, 'billing_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to view subscription details';
  END IF;

  SELECT
    ts.*,
    t.name AS tenant_name,
    t.slug AS tenant_slug,
    t.status AS tenant_status,
    p.name AS plan_name,
    p.code AS plan_code,
    p.price_usd AS plan_price_usd,
    p.billing_interval AS plan_interval,
    p.currency AS plan_currency
  INTO v_sub
  FROM public.tenant_subscriptions ts
  JOIN public.tenants t ON t.id = ts.tenant_id
  JOIN public.plans p ON p.id = ts.plan_id
  WHERE ts.id = _subscription_id;

  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  -- Fetch past subscriptions for this tenant
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', hts.id,
      'plan_name', hp.name,
      'plan_code', hp.code,
      'status', hts.status,
      'amount', hts.amount,
      'current_period_start', hts.current_period_start,
      'current_period_end', hts.current_period_end,
      'cancelled_at', hts.cancelled_at,
      'created_at', hts.created_at
    ) ORDER BY hts.created_at DESC
  ) INTO v_history
  FROM public.tenant_subscriptions hts
  JOIN public.plans hp ON hp.id = hts.plan_id
  WHERE hts.tenant_id = v_sub.tenant_id;

  -- Fetch audit logs for this subscription
  SELECT jsonb_agg(
    jsonb_build_object(
      'action', pal.action,
      'actor_user_id', pal.actor_user_id,
      'details', pal.details,
      'created_at', pal.created_at
    ) ORDER BY pal.created_at DESC
  ) INTO v_audit_events
  FROM public.platform_audit_log pal
  WHERE (pal.resource_id = _subscription_id::text OR pal.details->>'subscription_id' = _subscription_id::text)
  LIMIT 20;

  RETURN jsonb_build_object(
    'subscription', jsonb_build_object(
      'id', v_sub.id,
      'tenant_id', v_sub.tenant_id,
      'tenant_name', v_sub.tenant_name,
      'tenant_slug', v_sub.tenant_slug,
      'tenant_status', v_sub.tenant_status,
      'plan_id', v_sub.plan_id,
      'plan_name', v_sub.plan_name,
      'plan_code', v_sub.plan_code,
      'status', v_sub.status,
      'payment_status', v_sub.payment_status,
      'amount', COALESCE(v_sub.amount, v_sub.plan_price_usd),
      'currency', COALESCE(v_sub.currency, v_sub.plan_currency),
      'billing_interval', COALESCE(v_sub.billing_interval, v_sub.plan_interval),
      'current_period_start', v_sub.current_period_start,
      'current_period_end', v_sub.current_period_end,
      'trial_ends_at', v_sub.trial_ends_at,
      'cancelled_at', v_sub.cancelled_at,
      'cancel_at_period_end', v_sub.cancel_at_period_end,
      'cancellation_reason', v_sub.cancellation_reason,
      'notes', v_sub.notes,
      'created_at', v_sub.created_at,
      'updated_at', v_sub.updated_at
    ),
    'history', COALESCE(v_history, '[]'::jsonb),
    'audit_events', COALESCE(v_audit_events, '[]'::jsonb)
  );
END;
$$;

-- 4. RPC: Super Admin Change Subscription Plan
CREATE OR REPLACE FUNCTION public.admin_change_subscription_plan(
  _subscription_id uuid,
  _new_plan_id uuid,
  _notes text DEFAULT NULL,
  _reason text DEFAULT 'Plan changed by Super Admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_sub RECORD;
  v_new_plan RECORD;
  v_old_plan_name text;
BEGIN
  IF NOT (
    public.has_platform_permission(v_caller_id, 'platform.billing.manage')
    OR public.has_platform_permission(v_caller_id, 'platform.plans.manage')
    OR public.has_platform_role(v_caller_id, 'super_admin')
    OR public.has_platform_role(v_caller_id, 'billing_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to change subscription plan';
  END IF;

  SELECT ts.*, p.name AS plan_name INTO v_sub
  FROM public.tenant_subscriptions ts
  JOIN public.plans p ON p.id = ts.plan_id
  WHERE ts.id = _subscription_id;

  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'Subscription record not found';
  END IF;

  SELECT * INTO v_new_plan FROM public.plans WHERE id = _new_plan_id;
  IF v_new_plan.id IS NULL THEN
    RAISE EXCEPTION 'Target plan not found';
  END IF;

  v_old_plan_name := v_sub.plan_name;

  UPDATE public.tenant_subscriptions
  SET
    plan_id          = _new_plan_id,
    amount           = v_new_plan.price_usd,
    currency         = v_new_plan.currency,
    billing_interval = v_new_plan.billing_interval,
    notes            = COALESCE(_notes, notes),
    updated_at       = now()
  WHERE id = _subscription_id;

  -- Platform Audit Log
  PERFORM public.platform_audit(
    'subscription.plan_changed',
    'subscription',
    _subscription_id::text,
    jsonb_build_object(
      'subscription_id', _subscription_id,
      'tenant_id', v_sub.tenant_id,
      'old_plan_id', v_sub.plan_id,
      'old_plan_name', v_old_plan_name,
      'new_plan_id', _new_plan_id,
      'new_plan_name', v_new_plan.name,
      'new_price_usd', v_new_plan.price_usd,
      'reason', _reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', _subscription_id,
    'plan_id', _new_plan_id,
    'plan_name', v_new_plan.name
  );
END;
$$;

-- 5. RPC: Super Admin Extend Trial
CREATE OR REPLACE FUNCTION public.admin_extend_subscription_trial(
  _subscription_id uuid,
  _days int DEFAULT NULL,
  _new_trial_end timestamptz DEFAULT NULL,
  _reason text DEFAULT 'Trial extended by Super Admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_sub RECORD;
  v_target_end timestamptz;
  v_old_trial_end timestamptz;
BEGIN
  IF NOT (
    public.has_platform_permission(v_caller_id, 'platform.billing.manage')
    OR public.has_platform_role(v_caller_id, 'super_admin')
    OR public.has_platform_role(v_caller_id, 'billing_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to extend trial period';
  END IF;

  SELECT * INTO v_sub FROM public.tenant_subscriptions WHERE id = _subscription_id;
  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  v_old_trial_end := v_sub.trial_ends_at;

  IF _new_trial_end IS NOT NULL THEN
    v_target_end := _new_trial_end;
  ELSIF _days IS NOT NULL THEN
    v_target_end := COALESCE(v_sub.trial_ends_at, now()) + (_days || ' days')::interval;
  ELSE
    v_target_end := now() + interval '14 days';
  END IF;

  UPDATE public.tenant_subscriptions
  SET
    trial_ends_at = v_target_end,
    status        = CASE WHEN status IN ('cancelled', 'expired') THEN 'trialing' ELSE status END,
    payment_status= 'trial',
    updated_at    = now()
  WHERE id = _subscription_id;

  PERFORM public.platform_audit(
    'subscription.trial_extended',
    'subscription',
    _subscription_id::text,
    jsonb_build_object(
      'subscription_id', _subscription_id,
      'tenant_id', v_sub.tenant_id,
      'old_trial_ends_at', v_old_trial_end,
      'new_trial_ends_at', v_target_end,
      'reason', _reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', _subscription_id,
    'trial_ends_at', v_target_end
  );
END;
$$;

-- 6. RPC: Super Admin Suspend / Pause Subscription
CREATE OR REPLACE FUNCTION public.admin_suspend_subscription(
  _subscription_id uuid,
  _reason text DEFAULT 'Subscription suspended by Super Admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_sub RECORD;
BEGIN
  IF NOT (
    public.has_platform_permission(v_caller_id, 'platform.billing.manage')
    OR public.has_platform_role(v_caller_id, 'super_admin')
    OR public.has_platform_role(v_caller_id, 'billing_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to suspend subscription';
  END IF;

  SELECT * INTO v_sub FROM public.tenant_subscriptions WHERE id = _subscription_id;
  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  UPDATE public.tenant_subscriptions
  SET
    status     = 'paused',
    updated_at = now()
  WHERE id = _subscription_id;

  PERFORM public.platform_audit(
    'subscription.suspended',
    'subscription',
    _subscription_id::text,
    jsonb_build_object(
      'subscription_id', _subscription_id,
      'tenant_id', v_sub.tenant_id,
      'previous_status', v_sub.status,
      'new_status', 'paused',
      'reason', _reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', _subscription_id,
    'status', 'paused'
  );
END;
$$;

-- 7. RPC: Super Admin Reactivate Subscription
CREATE OR REPLACE FUNCTION public.admin_reactivate_subscription(
  _subscription_id uuid,
  _reason text DEFAULT 'Subscription reactivated by Super Admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_sub RECORD;
BEGIN
  IF NOT (
    public.has_platform_permission(v_caller_id, 'platform.billing.manage')
    OR public.has_platform_role(v_caller_id, 'super_admin')
    OR public.has_platform_role(v_caller_id, 'billing_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to reactivate subscription';
  END IF;

  SELECT * INTO v_sub FROM public.tenant_subscriptions WHERE id = _subscription_id;
  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  UPDATE public.tenant_subscriptions
  SET
    status               = 'active',
    payment_status       = 'paid',
    cancel_at_period_end = false,
    cancelled_at         = NULL,
    cancellation_reason  = NULL,
    current_period_start = now(),
    current_period_end   = now() + interval '1 month',
    updated_at           = now()
  WHERE id = _subscription_id;

  PERFORM public.platform_audit(
    'subscription.reactivated',
    'subscription',
    _subscription_id::text,
    jsonb_build_object(
      'subscription_id', _subscription_id,
      'tenant_id', v_sub.tenant_id,
      'previous_status', v_sub.status,
      'new_status', 'active',
      'reason', _reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', _subscription_id,
    'status', 'active'
  );
END;
$$;

-- 8. RPC: Super Admin Cancel Subscription
CREATE OR REPLACE FUNCTION public.admin_cancel_subscription(
  _subscription_id uuid,
  _immediate boolean DEFAULT true,
  _cancellation_reason text DEFAULT 'Cancelled by customer or Super Admin',
  _reason text DEFAULT 'Subscription cancelled by Super Admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_sub RECORD;
BEGIN
  IF NOT (
    public.has_platform_permission(v_caller_id, 'platform.billing.manage')
    OR public.has_platform_role(v_caller_id, 'super_admin')
    OR public.has_platform_role(v_caller_id, 'billing_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to cancel subscription';
  END IF;

  SELECT * INTO v_sub FROM public.tenant_subscriptions WHERE id = _subscription_id;
  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  IF _immediate THEN
    UPDATE public.tenant_subscriptions
    SET
      status               = 'cancelled',
      cancelled_at         = now(),
      cancellation_reason  = _cancellation_reason,
      cancel_at_period_end = false,
      updated_at           = now()
    WHERE id = _subscription_id;
  ELSE
    UPDATE public.tenant_subscriptions
    SET
      cancel_at_period_end = true,
      cancellation_reason  = _cancellation_reason,
      updated_at           = now()
    WHERE id = _subscription_id;
  END IF;

  PERFORM public.platform_audit(
    'subscription.cancelled',
    'subscription',
    _subscription_id::text,
    jsonb_build_object(
      'subscription_id', _subscription_id,
      'tenant_id', v_sub.tenant_id,
      'immediate', _immediate,
      'cancellation_reason', _cancellation_reason,
      'reason', _reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', _subscription_id,
    'immediate', _immediate,
    'status', CASE WHEN _immediate THEN 'cancelled' ELSE v_sub.status END,
    'cancel_at_period_end', NOT _immediate
  );
END;
$$;
