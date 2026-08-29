-- =========================================================
-- Tenant Detail RPC
--
-- get_tenant_detail(_tenant_id)
-- Returns a single JSONB payload with everything the Super Admin
-- tenant detail page needs in ONE round-trip:
--
--   tenant          — full tenants row
--   subscription    — active subscription + plan info
--   users           — profiles + roles for all users of this tenant
--   usage           — user count, storage proxy, feature flags
--   activity        — last 30 platform_audit_log entries for this tenant
--   audit_history   — last 50 business_events for this tenant
--   health          — integrity findings counts, stale sessions
--
-- Security: caller must be is_platform_admin() AND have
--           platform.tenants.view permission.
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_tenant_detail(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant record;
BEGIN
  IF NOT public.has_platform_permission('platform.tenants.view') THEN
    RAISE EXCEPTION 'Not authorized: platform.tenants.view' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants
  WHERE id = _tenant_id;

  IF v_tenant.id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  RETURN jsonb_build_object(

    -- ── Tenant core ───────────────────────────────────────────────────────
    'tenant', to_jsonb(v_tenant),

    -- ── Active subscription + plan ────────────────────────────────────────
    'subscription', (
      SELECT jsonb_build_object(
        'id',                   ts.id,
        'status',               ts.status,
        'plan_id',              ts.plan_id,
        'plan_name',            pl.name,
        'plan_code',            pl.code,
        'price_usd',            pl.price_usd,
        'max_users',            COALESCE(ts.override_max_users, pl.max_users),
        'max_storage_gb',       COALESCE(ts.override_max_storage, pl.max_storage_gb),
        'trial_ends_at',        ts.trial_ends_at,
        'current_period_start', ts.current_period_start,
        'current_period_end',   ts.current_period_end,
        'cancelled_at',         ts.cancelled_at,
        'external_id',          ts.external_id,
        'notes',                ts.notes,
        'created_at',           ts.created_at
      )
      FROM public.tenant_subscriptions ts
      JOIN public.plans pl ON pl.id = ts.plan_id
      WHERE ts.tenant_id = _tenant_id
      ORDER BY ts.created_at DESC
      LIMIT 1
    ),

    -- ── All subscriptions (history) ───────────────────────────────────────
    'subscription_history', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',        ts.id,
          'status',    ts.status,
          'plan_name', pl.name,
          'plan_code', pl.code,
          'price_usd', pl.price_usd,
          'created_at',ts.created_at,
          'cancelled_at', ts.cancelled_at
        ) ORDER BY ts.created_at DESC
      )
      FROM public.tenant_subscriptions ts
      JOIN public.plans pl ON pl.id = ts.plan_id
      WHERE ts.tenant_id = _tenant_id
    ),

    -- ── Users ──────────────────────────────────────────────────────────────
    'users', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',        p.id,
          'email',     p.email,
          'full_name', p.full_name,
          'roles',     (
            SELECT jsonb_agg(ur.role ORDER BY ur.role)
            FROM public.user_roles ur
            WHERE ur.user_id = p.id AND ur.tenant_id = _tenant_id
          ),
          'created_at', p.created_at,
          'updated_at', p.updated_at
        ) ORDER BY p.created_at DESC
      )
      FROM public.profiles p
      WHERE p.tenant_id = _tenant_id
    ),

    -- ── Usage ──────────────────────────────────────────────────────────────
    'usage', jsonb_build_object(
      'user_count', (
        SELECT COUNT(*) FROM public.profiles WHERE tenant_id = _tenant_id
      ),
      'active_users_30d', (
        SELECT COUNT(*) FROM public.profiles
        WHERE tenant_id = _tenant_id
          AND updated_at >= now() - interval '30 days'
      ),
      'feature_flags', (
        SELECT jsonb_object_agg(feature, enabled)
        FROM public.tenant_features
        WHERE tenant_id = _tenant_id
      ),
      'journal_count', (
        SELECT COUNT(*) FROM public.journal_entries
        WHERE tenant_id = _tenant_id AND deleted_at IS NULL
      ),
      'invoice_count', (
        SELECT COUNT(*) FROM public.invoices
        WHERE tenant_id = _tenant_id AND deleted_at IS NULL
      )
    ),

    -- ── Platform activity for this tenant ──────────────────────────────────
    'platform_activity', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',           pal.id,
          'action',       pal.action,
          'actor_email',  pal.actor_email,
          'actor_role',   pal.actor_role,
          'target_label', pal.target_label,
          'detail',       pal.detail,
          'created_at',   pal.created_at
        ) ORDER BY pal.created_at DESC
      )
      FROM (
        SELECT * FROM public.platform_audit_log
        WHERE acting_as_tenant_id = _tenant_id
           OR (target_type = 'tenant' AND target_id = _tenant_id)
        ORDER BY created_at DESC
        LIMIT 30
      ) pal
    ),

    -- ── Business events (ERP-level audit) ──────────────────────────────────
    'business_events', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',          be.id,
          'action',      be.action,
          'entity_type', be.entity_type,
          'entity_id',   be.entity_id,
          'actor_email', be.actor_email,
          'old_values',  be.old_values,
          'new_values',  be.new_values,
          'occurred_at', be.occurred_at
        ) ORDER BY be.occurred_at DESC
      )
      FROM (
        SELECT * FROM public.business_events
        WHERE tenant_id = _tenant_id
        ORDER BY occurred_at DESC
        LIMIT 50
      ) be
    ),

    -- ── Health ─────────────────────────────────────────────────────────────
    'health', jsonb_build_object(
      'integrity_errors', (
        SELECT COUNT(*) FROM public.accounting_integrity_findings
        WHERE tenant_id = _tenant_id AND resolved_at IS NULL AND severity = 'error'
      ),
      'integrity_warnings', (
        SELECT COUNT(*) FROM public.accounting_integrity_findings
        WHERE tenant_id = _tenant_id AND resolved_at IS NULL AND severity = 'warning'
      ),
      'unbalanced_journals', (
        SELECT COUNT(*) FROM public.journal_entries
        WHERE tenant_id = _tenant_id
          AND deleted_at IS NULL
          AND status = 'Posted'
          AND ABS(COALESCE(total_debit,0) - COALESCE(total_credit,0)) > 0.005
      ),
      'draft_journals', (
        SELECT COUNT(*) FROM public.journal_entries
        WHERE tenant_id = _tenant_id AND deleted_at IS NULL AND status = 'Draft'
      ),
      'unposted_invoices', (
        SELECT COUNT(*) FROM public.invoices
        WHERE tenant_id = _tenant_id AND deleted_at IS NULL
          AND voided_at IS NULL AND posted_at IS NULL
          AND status NOT IN ('Cancelled','Voided')
      ),
      'active_support_sessions', (
        SELECT COUNT(*) FROM public.platform_support_sessions
        WHERE target_tenant_id = _tenant_id AND status = 'active' AND expires_at > now()
      )
    ),

    -- ── Plans available (for Change Plan action) ────────────────────────────
    'available_plans', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',          pl.id,
          'name',        pl.name,
          'code',        pl.code,
          'price_usd',   pl.price_usd,
          'max_users',   pl.max_users,
          'max_storage_gb', pl.max_storage_gb
        ) ORDER BY pl.sort_order
      )
      FROM public.plans pl
      WHERE pl.is_active = true
    )

  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_detail(uuid) TO authenticated;
