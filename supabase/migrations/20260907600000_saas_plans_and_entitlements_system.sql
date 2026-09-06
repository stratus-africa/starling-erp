-- ==============================================================================
-- NimbusERP SaaS Plans and Entitlements Architecture
-- Migration: 20260907600000_saas_plans_and_entitlements_system.sql
-- ==============================================================================

-- 1. Enhance `public.plans` table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'plans' AND column_name = 'billing_interval'
  ) THEN
    ALTER TABLE public.plans ADD COLUMN billing_interval text NOT NULL DEFAULT 'monthly';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'plans' AND column_name = 'currency'
  ) THEN
    ALTER TABLE public.plans ADD COLUMN currency text NOT NULL DEFAULT 'USD';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'plans' AND column_name = 'trial_days'
  ) THEN
    ALTER TABLE public.plans ADD COLUMN trial_days integer NOT NULL DEFAULT 14;
  END IF;
END $$;

-- 2. Create `public.features` table
CREATE TABLE IF NOT EXISTS public.features (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  code        text        NOT NULL UNIQUE,
  description text,
  type        text        NOT NULL DEFAULT 'boolean'
                          CONSTRAINT feature_type_check CHECK (type IN ('boolean', 'numeric_limit', 'metered', 'text')),
  category    text        NOT NULL DEFAULT 'core'
                          CONSTRAINT feature_category_check CHECK (category IN ('limits', 'modules', 'integrations', 'core', 'security')),
  unit        text,       -- e.g. 'users', 'branches', 'GB', 'invoices/mo', 'reqs/day'
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_features_updated
  BEFORE UPDATE ON public.features
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

GRANT SELECT ON public.features TO authenticated;
GRANT ALL ON public.features TO service_role;
ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read features" ON public.features;
CREATE POLICY "Authenticated users can read features"
  ON public.features FOR SELECT TO authenticated
  USING (true);

-- 3. Create `public.plan_entitlements` table
CREATE TABLE IF NOT EXISTS public.plan_entitlements (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     uuid        NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  feature_id  uuid        NOT NULL REFERENCES public.features(id) ON DELETE CASCADE,
  enabled     boolean     NOT NULL DEFAULT true,
  limit_value numeric,    -- NULL means unlimited (if enabled=true), 0 or number for specific cap
  config      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_plan_feature UNIQUE (plan_id, feature_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_entitlements_plan ON public.plan_entitlements(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_entitlements_feature ON public.plan_entitlements(feature_id);

CREATE TRIGGER trg_plan_entitlements_updated
  BEFORE UPDATE ON public.plan_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

GRANT SELECT ON public.plan_entitlements TO authenticated;
GRANT ALL ON public.plan_entitlements TO service_role;
ALTER TABLE public.plan_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read plan entitlements" ON public.plan_entitlements;
CREATE POLICY "Authenticated users can read plan entitlements"
  ON public.plan_entitlements FOR SELECT TO authenticated
  USING (true);

-- 4. Seed Standard Core Features & Modules
INSERT INTO public.features (name, code, description, type, category, unit, sort_order)
VALUES
  -- Limits
  ('User Accounts',       'users',            'Maximum active user accounts in the workspace',       'numeric_limit', 'limits',       'users',        10),
  ('Branches & Locations','branches',         'Maximum active business branch and store locations',  'numeric_limit', 'limits',       'branches',     20),
  ('Product SKUs',        'products',         'Maximum inventory items and catalog SKUs',            'numeric_limit', 'limits',       'items',        30),
  ('Storage Volume',      'storage',          'File attachment and document storage volume',         'numeric_limit', 'limits',       'GB',           40),
  ('Monthly Invoices',    'invoices',         'Maximum sales invoice documents created per month',   'numeric_limit', 'limits',       'invoices/mo',  50),
  ('API Requests',        'api_requests',     'Daily API request threshold for integrations',        'metered',       'limits',       'reqs/day',     60),

  -- Modules
  ('Accounting & GL',     'accounting',       'General ledger, journal entries, charts of accounts', 'boolean',       'modules',      NULL,           100),
  ('Inventory & Stock',   'inventory',        'Multi-warehouse stock ledger, tracking and valuation','boolean',       'modules',      NULL,           110),
  ('Manufacturing',       'manufacturing',    'Bills of materials, work orders, and production',     'boolean',       'modules',      NULL,           120),
  ('Advanced Reports',    'advanced_reports', 'Financial executive summaries and BI analytics',      'boolean',       'modules',      NULL,           130),
  ('Point of Sale',       'pos',              'Retail point-of-sale registers and cash handling',    'boolean',       'modules',      NULL,           140),
  ('CRM & Pipeline',      'crm',              'Lead management, customer pipelines, and deals',      'boolean',       'modules',      NULL,           150),
  ('Banking & Treasury',  'banking',          'Bank accounts, reconciliation, and statement import', 'boolean',       'modules',      NULL,           160),
  ('Payroll & HR',        'payroll',          'Employee payroll, wage calculation, and payslips',    'boolean',       'modules',      NULL,           170),
  ('Multi-Location Hub',  'multi_location',   'Cross-location inventory transfer and reporting',     'boolean',       'modules',      NULL,           180),

  -- Integrations
  ('API Access & Hooks',  'api_access',       'REST API, webhooks, and developer token generation',  'boolean',       'integrations', NULL,           200)
ON CONFLICT (code) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  type        = EXCLUDED.type,
  category    = EXCLUDED.category,
  unit        = EXCLUDED.unit,
  sort_order  = EXCLUDED.sort_order;

-- 5. Backfill Entitlements for Existing Plans
DO $$
DECLARE
  v_plan RECORD;
  v_feat RECORD;
  v_users_feat_id uuid;
  v_storage_feat_id uuid;
  v_legacy_has_feature boolean;
BEGIN
  SELECT id INTO v_users_feat_id FROM public.features WHERE code = 'users';
  SELECT id INTO v_storage_feat_id FROM public.features WHERE code = 'storage';

  FOR v_plan IN SELECT * FROM public.plans LOOP
    -- User Limit
    IF v_users_feat_id IS NOT NULL THEN
      INSERT INTO public.plan_entitlements (plan_id, feature_id, enabled, limit_value)
      VALUES (v_plan.id, v_users_feat_id, true, v_plan.max_users)
      ON CONFLICT (plan_id, feature_id) DO UPDATE SET limit_value = EXCLUDED.limit_value;
    END IF;

    -- Storage Limit
    IF v_storage_feat_id IS NOT NULL THEN
      INSERT INTO public.plan_entitlements (plan_id, feature_id, enabled, limit_value)
      VALUES (v_plan.id, v_storage_feat_id, true, v_plan.max_storage_gb)
      ON CONFLICT (plan_id, feature_id) DO UPDATE SET limit_value = EXCLUDED.limit_value;
    END IF;

    -- Standard modules & limits defaults
    FOR v_feat IN SELECT * FROM public.features WHERE code NOT IN ('users', 'storage') LOOP
      -- Check legacy plan_features table if present
      SELECT EXISTS (
        SELECT 1 FROM public.plan_features WHERE plan_id = v_plan.id AND feature = v_feat.code
      ) INTO v_legacy_has_feature;

      IF v_feat.type = 'boolean' THEN
        -- If in enterprise/growth or present in legacy table, enable it
        INSERT INTO public.plan_entitlements (plan_id, feature_id, enabled, limit_value)
        VALUES (
          v_plan.id,
          v_feat.id,
          CASE
            WHEN v_legacy_has_feature THEN true
            WHEN v_plan.code = 'enterprise' THEN true
            WHEN v_plan.code = 'growth' AND v_feat.code IN ('accounting','inventory','advanced_reports','crm','banking') THEN true
            WHEN v_plan.code IN ('starter', 'trial') AND v_feat.code IN ('accounting','inventory') THEN true
            ELSE false
          END,
          NULL
        )
        ON CONFLICT (plan_id, feature_id) DO NOTHING;
      ELSE
        -- Numeric limit / metered defaults based on plan tier
        INSERT INTO public.plan_entitlements (plan_id, feature_id, enabled, limit_value)
        VALUES (
          v_plan.id,
          v_feat.id,
          true,
          CASE
            WHEN v_feat.code = 'branches' THEN
              CASE WHEN v_plan.code = 'enterprise' THEN NULL WHEN v_plan.code = 'growth' THEN 5 ELSE 1 END
            WHEN v_feat.code = 'products' THEN
              CASE WHEN v_plan.code = 'enterprise' THEN NULL WHEN v_plan.code = 'growth' THEN 10000 ELSE 1000 END
            WHEN v_feat.code = 'invoices' THEN
              CASE WHEN v_plan.code = 'enterprise' THEN NULL WHEN v_plan.code = 'growth' THEN 5000 ELSE 500 END
            WHEN v_feat.code = 'api_requests' THEN
              CASE WHEN v_plan.code = 'enterprise' THEN 100000 WHEN v_plan.code = 'growth' THEN 10000 ELSE 1000 END
            ELSE NULL
          END
        )
        ON CONFLICT (plan_id, feature_id) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 6. RPC: Super Admin List Plans, Features & Entitlements
CREATE OR REPLACE FUNCTION public.admin_list_plans_and_features()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_has_perm boolean;
  v_plans jsonb;
  v_features jsonb;
  v_entitlements jsonb;
BEGIN
  v_has_perm := public.has_platform_permission(v_caller_id, 'platform.plans.view')
             OR public.has_platform_role(v_caller_id, 'super_admin')
             OR public.has_platform_role(v_caller_id, 'platform_admin')
             OR public.has_platform_role(v_caller_id, 'billing_admin');

  IF NOT v_has_perm THEN
    RAISE EXCEPTION 'Access denied: insufficient platform permissions to view plans and features';
  END IF;

  -- Plans with active subscription counts
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'code', p.code,
      'description', p.description,
      'price_usd', p.price_usd,
      'billing_interval', p.billing_interval,
      'currency', p.currency,
      'trial_days', p.trial_days,
      'max_users', p.max_users,
      'max_storage_gb', p.max_storage_gb,
      'is_public', p.is_public,
      'is_active', p.is_active,
      'sort_order', p.sort_order,
      'created_at', p.created_at,
      'updated_at', p.updated_at,
      'active_subscriptions_count', (
        SELECT COUNT(*) FROM public.tenant_subscriptions ts
        WHERE ts.plan_id = p.id AND ts.status IN ('trial', 'trialing', 'active')
      )
    ) ORDER BY p.sort_order, p.price_usd ASC
  ) INTO v_plans
  FROM public.plans p;

  -- Features catalogue
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', f.id,
      'name', f.name,
      'code', f.code,
      'description', f.description,
      'type', f.type,
      'category', f.category,
      'unit', f.unit,
      'is_active', f.is_active,
      'sort_order', f.sort_order,
      'created_at', f.created_at,
      'updated_at', f.updated_at
    ) ORDER BY f.category, f.sort_order, f.name ASC
  ) INTO v_features
  FROM public.features f;

  -- Plan Entitlements matrix
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', pe.id,
      'plan_id', pe.plan_id,
      'feature_id', pe.feature_id,
      'feature_code', f.code,
      'feature_name', f.name,
      'feature_type', f.type,
      'feature_category', f.category,
      'enabled', pe.enabled,
      'limit_value', pe.limit_value,
      'config', pe.config
    )
  ) INTO v_entitlements
  FROM public.plan_entitlements pe
  JOIN public.features f ON f.id = pe.feature_id;

  RETURN jsonb_build_object(
    'plans', COALESCE(v_plans, '[]'::jsonb),
    'features', COALESCE(v_features, '[]'::jsonb),
    'entitlements', COALESCE(v_entitlements, '[]'::jsonb)
  );
END;
$$;

-- 7. RPC: Super Admin Save / Create Plan
CREATE OR REPLACE FUNCTION public.admin_save_plan(
  _payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_plan_id uuid;
  v_name text;
  v_code text;
  v_description text;
  v_price numeric;
  v_interval text;
  v_currency text;
  v_trial_days int;
  v_max_users int;
  v_max_storage int;
  v_is_public boolean;
  v_is_active boolean;
  v_sort_order int;
  v_is_new boolean := false;
BEGIN
  IF NOT (
    public.has_platform_permission(v_caller_id, 'platform.plans.manage')
    OR public.has_platform_role(v_caller_id, 'super_admin')
    OR public.has_platform_role(v_caller_id, 'billing_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to manage subscription plans';
  END IF;

  v_plan_id     := (_payload->>'id')::uuid;
  v_name        := TRIM(_payload->>'name');
  v_code        := LOWER(TRIM(_payload->>'code'));
  v_description := _payload->>'description';
  v_price       := COALESCE((_payload->>'price_usd')::numeric, 0);
  v_interval    := COALESCE(_payload->>'billing_interval', 'monthly');
  v_currency    := COALESCE(_payload->>'currency', 'USD');
  v_trial_days  := COALESCE((_payload->>'trial_days')::int, 14);
  v_max_users   := (_payload->>'max_users')::int;
  v_max_storage := (_payload->>'max_storage_gb')::int;
  v_is_public   := COALESCE((_payload->>'is_public')::boolean, true);
  v_is_active   := COALESCE((_payload->>'is_active')::boolean, true);
  v_sort_order  := COALESCE((_payload->>'sort_order')::int, 0);

  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'Plan name is required';
  END IF;
  IF v_code IS NULL OR v_code = '' THEN
    RAISE EXCEPTION 'Plan code identifier is required';
  END IF;

  IF v_plan_id IS NULL THEN
    v_is_new := true;
    INSERT INTO public.plans (
      name, code, description, price_usd, billing_interval,
      currency, trial_days, max_users, max_storage_gb,
      is_public, is_active, sort_order
    )
    VALUES (
      v_name, v_code, v_description, v_price, v_interval,
      v_currency, v_trial_days, v_max_users, v_max_storage,
      v_is_public, v_is_active, v_sort_order
    )
    RETURNING id INTO v_plan_id;

    -- Automatically seed all current features into plan_entitlements for new plan
    INSERT INTO public.plan_entitlements (plan_id, feature_id, enabled, limit_value)
    SELECT
      v_plan_id,
      f.id,
      CASE WHEN f.type = 'boolean' THEN false ELSE true END,
      CASE
        WHEN f.code = 'users' THEN v_max_users
        WHEN f.code = 'storage' THEN v_max_storage
        ELSE NULL
      END
    FROM public.features f
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE public.plans
    SET
      name             = v_name,
      code             = v_code,
      description      = v_description,
      price_usd        = v_price,
      billing_interval = v_interval,
      currency         = v_currency,
      trial_days       = v_trial_days,
      max_users        = v_max_users,
      max_storage_gb   = v_max_storage,
      is_public        = v_is_public,
      is_active        = v_is_active,
      sort_order       = v_sort_order,
      updated_at       = now()
    WHERE id = v_plan_id;

    -- Sync user and storage entitlements if changed
    UPDATE public.plan_entitlements pe
    SET limit_value = v_max_users, updated_at = now()
    FROM public.features f
    WHERE pe.feature_id = f.id AND pe.plan_id = v_plan_id AND f.code = 'users';

    UPDATE public.plan_entitlements pe
    SET limit_value = v_max_storage, updated_at = now()
    FROM public.features f
    WHERE pe.feature_id = f.id AND pe.plan_id = v_plan_id AND f.code = 'storage';
  END IF;

  -- Platform Audit Log
  PERFORM public.platform_audit(
    CASE WHEN v_is_new THEN 'plan.created' ELSE 'plan.updated' END,
    'plan',
    v_plan_id::text,
    jsonb_build_object(
      'plan_id', v_plan_id,
      'code', v_code,
      'name', v_name,
      'price_usd', v_price,
      'billing_interval', v_interval
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', v_plan_id
  );
END;
$$;

-- 8. RPC: Super Admin Toggle Plan Active Status
CREATE OR REPLACE FUNCTION public.admin_set_plan_status(
  _plan_id uuid,
  _is_active boolean,
  _reason text DEFAULT 'Status updated by Super Admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_old_status boolean;
  v_code text;
BEGIN
  IF NOT (
    public.has_platform_permission(v_caller_id, 'platform.plans.manage')
    OR public.has_platform_role(v_caller_id, 'super_admin')
    OR public.has_platform_role(v_caller_id, 'billing_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to modify plan status';
  END IF;

  SELECT is_active, code INTO v_old_status, v_code FROM public.plans WHERE id = _plan_id;
  IF v_old_status IS NULL THEN
    RAISE EXCEPTION 'Plan not found';
  END IF;

  UPDATE public.plans
  SET is_active = _is_active, updated_at = now()
  WHERE id = _plan_id;

  PERFORM public.platform_audit(
    CASE WHEN _is_active THEN 'plan.activated' ELSE 'plan.deactivated' END,
    'plan',
    _plan_id::text,
    jsonb_build_object(
      'plan_id', _plan_id,
      'code', v_code,
      'old_status', v_old_status,
      'new_status', _is_active,
      'reason', _reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', _plan_id,
    'is_active', _is_active
  );
END;
$$;

-- 9. RPC: Super Admin Save / Create Feature
CREATE OR REPLACE FUNCTION public.admin_save_feature(
  _payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_feat_id uuid;
  v_name text;
  v_code text;
  v_description text;
  v_type text;
  v_category text;
  v_unit text;
  v_is_active boolean;
  v_sort_order int;
  v_is_new boolean := false;
BEGIN
  IF NOT (
    public.has_platform_permission(v_caller_id, 'platform.features.manage')
    OR public.has_platform_role(v_caller_id, 'super_admin')
    OR public.has_platform_role(v_caller_id, 'billing_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to manage feature definitions';
  END IF;

  v_feat_id     := (_payload->>'id')::uuid;
  v_name        := TRIM(_payload->>'name');
  v_code        := LOWER(TRIM(_payload->>'code'));
  v_description := _payload->>'description';
  v_type        := COALESCE(_payload->>'type', 'boolean');
  v_category    := COALESCE(_payload->>'category', 'core');
  v_unit        := _payload->>'unit';
  v_is_active   := COALESCE((_payload->>'is_active')::boolean, true);
  v_sort_order  := COALESCE((_payload->>'sort_order')::int, 0);

  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'Feature name is required';
  END IF;
  IF v_code IS NULL OR v_code = '' THEN
    RAISE EXCEPTION 'Feature code identifier is required';
  END IF;

  IF v_feat_id IS NULL THEN
    v_is_new := true;
    INSERT INTO public.features (
      name, code, description, type, category, unit, is_active, sort_order
    )
    VALUES (
      v_name, v_code, v_description, v_type, v_category, v_unit, v_is_active, v_sort_order
    )
    RETURNING id INTO v_feat_id;

    -- Attach new feature to all existing plans (disabled / null limit by default)
    INSERT INTO public.plan_entitlements (plan_id, feature_id, enabled, limit_value)
    SELECT
      p.id,
      v_feat_id,
      false,
      NULL
    FROM public.plans p
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE public.features
    SET
      name        = v_name,
      code        = v_code,
      description = v_description,
      type        = v_type,
      category    = v_category,
      unit        = v_unit,
      is_active   = v_is_active,
      sort_order  = v_sort_order,
      updated_at  = now()
    WHERE id = v_feat_id;
  END IF;

  PERFORM public.platform_audit(
    CASE WHEN v_is_new THEN 'feature.created' ELSE 'feature.updated' END,
    'feature',
    v_feat_id::text,
    jsonb_build_object(
      'feature_id', v_feat_id,
      'code', v_code,
      'name', v_name,
      'type', v_type
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'feature_id', v_feat_id
  );
END;
$$;

-- 10. RPC: Super Admin Batch Update Plan Entitlements
CREATE OR REPLACE FUNCTION public.admin_save_plan_entitlements(
  _plan_id uuid,
  _entitlements jsonb,
  _reason text DEFAULT 'Entitlements updated by Super Admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_item jsonb;
  v_feat_id uuid;
  v_enabled boolean;
  v_limit numeric;
  v_config jsonb;
BEGIN
  IF NOT (
    public.has_platform_permission(v_caller_id, 'platform.plans.manage')
    OR public.has_platform_role(v_caller_id, 'super_admin')
    OR public.has_platform_role(v_caller_id, 'billing_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to modify plan entitlements';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = _plan_id) THEN
    RAISE EXCEPTION 'Target plan not found';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_entitlements)
  LOOP
    v_feat_id := (v_item->>'feature_id')::uuid;
    v_enabled := COALESCE((v_item->>'enabled')::boolean, true);
    v_limit   := (v_item->>'limit_value')::numeric;
    v_config  := COALESCE(v_item->'config', '{}'::jsonb);

    IF v_feat_id IS NOT NULL THEN
      INSERT INTO public.plan_entitlements (
        plan_id, feature_id, enabled, limit_value, config, updated_at
      )
      VALUES (
        _plan_id, v_feat_id, v_enabled, v_limit, v_config, now()
      )
      ON CONFLICT (plan_id, feature_id) DO UPDATE SET
        enabled     = EXCLUDED.enabled,
        limit_value = EXCLUDED.limit_value,
        config      = EXCLUDED.config,
        updated_at  = now();
    END IF;
  END LOOP;

  PERFORM public.platform_audit(
    'plan.entitlements_updated',
    'plan',
    _plan_id::text,
    jsonb_build_object(
      'plan_id', _plan_id,
      'entitlements_count', jsonb_array_length(_entitlements),
      'reason', _reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', _plan_id
  );
END;
$$;

-- 11. RPC: Tenant Entitlements Resolution (Tenant → Subscription → Plan → Entitlements)
CREATE OR REPLACE FUNCTION public.get_tenant_entitlements(
  _tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_sub RECORD;
  v_plan RECORD;
  v_entitlements jsonb;
BEGIN
  -- 1. Find active or trial subscription
  SELECT ts.*, p.id AS plan_pk, p.name AS plan_name, p.code AS plan_code,
         p.trial_days, p.billing_interval, p.currency, p.price_usd
  INTO v_sub
  FROM public.tenant_subscriptions ts
  JOIN public.plans p ON p.id = ts.plan_id
  WHERE ts.tenant_id = _tenant_id
    AND ts.status IN ('trial', 'trialing', 'active')
  ORDER BY ts.created_at DESC
  LIMIT 1;

  -- If no subscription found, fallback to public starter or trial plan
  IF v_sub.plan_pk IS NULL THEN
    SELECT p.id AS plan_pk, p.name AS plan_name, p.code AS plan_code,
           p.trial_days, p.billing_interval, p.currency, p.price_usd
    INTO v_plan
    FROM public.plans p
    WHERE p.is_active = true
    ORDER BY p.price_usd ASC
    LIMIT 1;
  END IF;

  -- 2. Fetch base plan entitlements + override with subscription limits & tenant feature flags
  WITH base_entitlements AS (
    SELECT
      f.code,
      f.name,
      f.type,
      f.category,
      f.unit,
      pe.enabled AS plan_enabled,
      pe.limit_value AS plan_limit,
      pe.config AS plan_config,
      -- Subscription level overrides
      CASE
        WHEN f.code = 'users' AND v_sub.override_max_users IS NOT NULL THEN v_sub.override_max_users::numeric
        WHEN f.code = 'storage' AND v_sub.override_max_storage IS NOT NULL THEN v_sub.override_max_storage::numeric
        ELSE pe.limit_value
      END AS resolved_limit,
      -- Tenant feature flag override if present
      COALESCE(tff.enabled, pe.enabled) AS resolved_enabled
    FROM public.features f
    LEFT JOIN public.plan_entitlements pe ON pe.feature_id = f.id AND pe.plan_id = COALESCE(v_sub.plan_pk, v_plan.plan_pk)
    LEFT JOIN public.tenant_feature_flags tff ON tff.tenant_id = _tenant_id AND tff.feature = f.code
    WHERE f.is_active = true
  )
  SELECT jsonb_object_agg(
    be.code,
    jsonb_build_object(
      'code', be.code,
      'name', be.name,
      'type', be.type,
      'category', be.category,
      'unit', be.unit,
      'enabled', COALESCE(be.resolved_enabled, false),
      'limit', be.resolved_limit,
      'unlimited', (be.resolved_enabled = true AND be.resolved_limit IS NULL)
    )
  ) INTO v_entitlements
  FROM base_entitlements be;

  RETURN jsonb_build_object(
    'tenant_id', _tenant_id,
    'subscription', CASE
      WHEN v_sub.id IS NOT NULL THEN jsonb_build_object(
        'id', v_sub.id,
        'status', v_sub.status,
        'trial_ends_at', v_sub.trial_ends_at,
        'current_period_start', v_sub.current_period_start,
        'current_period_end', v_sub.current_period_end
      )
      ELSE NULL
    END,
    'plan', jsonb_build_object(
      'id', COALESCE(v_sub.plan_pk, v_plan.plan_pk),
      'name', COALESCE(v_sub.plan_name, v_plan.plan_name),
      'code', COALESCE(v_sub.plan_code, v_plan.plan_code),
      'price_usd', COALESCE(v_sub.price_usd, v_plan.price_usd),
      'billing_interval', COALESCE(v_sub.billing_interval, v_plan.billing_interval)
    ),
    'entitlements', COALESCE(v_entitlements, '{}'::jsonb)
  );
END;
$$;

-- 12. RPC: can_tenant_use_feature(tenant_id, feature_code)
CREATE OR REPLACE FUNCTION public.can_tenant_use_feature(
  _tenant_id uuid,
  _feature_code text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_entitlements jsonb;
  v_feature_data jsonb;
BEGIN
  v_entitlements := public.get_tenant_entitlements(_tenant_id);
  v_feature_data := v_entitlements->'entitlements'->_feature_code;

  IF v_feature_data IS NULL THEN
    RETURN false;
  END IF;

  RETURN COALESCE((v_feature_data->>'enabled')::boolean, false);
END;
$$;

-- 13. RPC: get_tenant_limit(tenant_id, feature_code)
CREATE OR REPLACE FUNCTION public.get_tenant_limit(
  _tenant_id uuid,
  _feature_code text
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_entitlements jsonb;
  v_feature_data jsonb;
  v_enabled boolean;
  v_limit numeric;
BEGIN
  v_entitlements := public.get_tenant_entitlements(_tenant_id);
  v_feature_data := v_entitlements->'entitlements'->_feature_code;

  IF v_feature_data IS NULL THEN
    RETURN 0;
  END IF;

  v_enabled := COALESCE((v_feature_data->>'enabled')::boolean, false);
  IF NOT v_enabled THEN
    RETURN 0;
  END IF;

  -- If unlimited, returns NULL
  IF (v_feature_data->>'unlimited')::boolean = true THEN
    RETURN NULL;
  END IF;

  v_limit := (v_feature_data->>'limit')::numeric;
  RETURN v_limit;
END;
$$;

-- 14. RPC: check_tenant_limit_enforcement
CREATE OR REPLACE FUNCTION public.check_tenant_limit_enforcement(
  _tenant_id uuid,
  _feature_code text,
  _current_count numeric
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_limit numeric;
  v_can_use boolean;
BEGIN
  v_can_use := public.can_tenant_use_feature(_tenant_id, _feature_code);
  IF NOT v_can_use THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'Feature disabled for current subscription plan',
      'current', _current_count,
      'limit', 0,
      'unlimited', false
    );
  END IF;

  v_limit := public.get_tenant_limit(_tenant_id, _feature_code);

  -- NULL limit means unlimited
  IF v_limit IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'current', _current_count,
      'limit', NULL,
      'unlimited', true
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', (_current_count < v_limit),
    'current', _current_count,
    'limit', v_limit,
    'unlimited', false,
    'remaining', GREATEST(0, v_limit - _current_count)
  );
END;
$$;
