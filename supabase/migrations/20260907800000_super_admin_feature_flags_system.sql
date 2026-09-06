-- ==============================================================================
-- Super Admin Feature Flag System Architecture
-- Migration: 20260907800000_super_admin_feature_flags_system.sql
-- ==============================================================================

-- 1. Create `public.feature_flags` table
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text        NOT NULL UNIQUE,
  name               text        NOT NULL,
  description        text,
  enabled            boolean     NOT NULL DEFAULT false,
  environment        text        NOT NULL DEFAULT 'all'
                                 CONSTRAINT ff_environment_check CHECK (environment IN ('all', 'production', 'staging', 'development')),
  rollout_percentage integer     NOT NULL DEFAULT 100
                                 CONSTRAINT ff_rollout_check CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  target_plans       text[]      NOT NULL DEFAULT '{}',
  target_tenants     uuid[]      NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_feature_flags_updated
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

GRANT SELECT ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read feature flags" ON public.feature_flags;
CREATE POLICY "Authenticated users can read feature flags"
  ON public.feature_flags FOR SELECT TO authenticated
  USING (true);

-- 2. Ensure `public.tenant_feature_flags` exists for explicit tenant overrides
CREATE TABLE IF NOT EXISTS public.tenant_feature_flags (
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  feature     text        NOT NULL,
  enabled     boolean     NOT NULL DEFAULT true,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, feature)
);

CREATE TRIGGER trg_tenant_feature_flags_updated
  BEFORE UPDATE ON public.tenant_feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

GRANT SELECT ON public.tenant_feature_flags TO authenticated;
GRANT ALL ON public.tenant_feature_flags TO service_role;
ALTER TABLE public.tenant_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read tenant feature flags" ON public.tenant_feature_flags;
CREATE POLICY "Authenticated users can read tenant feature flags"
  ON public.tenant_feature_flags FOR SELECT TO authenticated
  USING (true);

-- 3. Seed Example Feature Flags
INSERT INTO public.feature_flags (code, name, description, enabled, environment, rollout_percentage, target_plans, target_tenants)
VALUES
  ('accounting_v2',       'Accounting NextGen Engine V2',   'New double-entry ledger calculation core and multi-currency engine', false, 'all',         0,   '{}', '{}'),
  ('manufacturing',       'Manufacturing & BOMs Module',    'Bills of materials, production work orders, and shop floor routings', true,  'all',         100, '{}', '{}'),
  ('advanced_reporting',  'Advanced Financial Reporting',   'Executive cash flow projections, EBITDA analytics, and custom BI',  true,  'all',         100, ARRAY['growth', 'enterprise'], '{}'),
  ('new_inventory',       'High-Throughput Inventory Engine','Optimized real-time FIFO/LIFO warehouse transaction journal',       true,  'all',         50,  '{}', '{}'),
  ('ai_assistant',        'Nimbus AI Enterprise Assistant', 'Generative assistant for transaction categorization & document OCR', false, 'staging',     0,   '{}', '{}'),
  ('api_v2',              'REST & Webhooks V2 Engine',      'High-performance REST API endpoints with granular webhook events',    true,  'production',  100, ARRAY['enterprise'], '{}')
ON CONFLICT (code) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description;

-- 4. Central Evaluation Function (Database Layer)
CREATE OR REPLACE FUNCTION public.evaluate_feature_flag(
  _flag_code text,
  _tenant_id uuid DEFAULT NULL,
  _user_id uuid DEFAULT NULL,
  _env text DEFAULT 'production'
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_flag RECORD;
  v_tenant_override boolean;
  v_tenant_plan_code text;
  v_hash_seed text;
  v_hash_val int;
BEGIN
  -- 1. Check explicit tenant-level override first
  IF _tenant_id IS NOT NULL THEN
    SELECT enabled INTO v_tenant_override
    FROM public.tenant_feature_flags
    WHERE tenant_id = _tenant_id AND feature = _flag_code;

    IF v_tenant_override IS NOT NULL THEN
      RETURN v_tenant_override;
    END IF;
  END IF;

  -- 2. Lookup global flag definition
  SELECT * INTO v_flag FROM public.feature_flags WHERE code = _flag_code;
  IF v_flag.id IS NULL THEN
    -- Fallback: check if active in public.features catalog
    RETURN EXISTS (
      SELECT 1 FROM public.features WHERE code = _flag_code AND is_active = true
    );
  END IF;

  -- 3. Environment check
  IF v_flag.environment <> 'all' AND v_flag.environment <> _env THEN
    RETURN false;
  END IF;

  -- 4. Global Killswitch / Enabled state
  IF NOT v_flag.enabled THEN
    RETURN false;
  END IF;

  -- 5. Plan Targeting
  IF cardinality(v_flag.target_plans) > 0 AND _tenant_id IS NOT NULL THEN
    SELECT p.code INTO v_tenant_plan_code
    FROM public.tenant_subscriptions ts
    JOIN public.plans p ON p.id = ts.plan_id
    WHERE ts.tenant_id = _tenant_id AND ts.status IN ('trial', 'trialing', 'active')
    ORDER BY ts.created_at DESC
    LIMIT 1;

    IF v_tenant_plan_code IS NULL OR NOT (v_tenant_plan_code = ANY(v_flag.target_plans)) THEN
      RETURN false;
    END IF;
  END IF;

  -- 6. Specific Tenant Targeting
  IF cardinality(v_flag.target_tenants) > 0 THEN
    IF _tenant_id IS NULL OR NOT (_tenant_id = ANY(v_flag.target_tenants)) THEN
      RETURN false;
    END IF;
  END IF;

  -- 7. Percentage Rollout (Deterministic MD5 Hash)
  IF v_flag.rollout_percentage < 100 THEN
    IF v_flag.rollout_percentage <= 0 THEN
      RETURN false;
    END IF;

    v_hash_seed := _flag_code || '_' || COALESCE(_tenant_id::text, _user_id::text, 'anonymous');
    -- Convert 4 bytes of md5 hex to int modulo 100
    v_hash_val := ('x' || substr(md5(v_hash_seed), 1, 8))::bit(32)::bigint % 100;
    IF v_hash_val < 0 THEN
      v_hash_val := v_hash_val + 100;
    END IF;

    IF v_hash_val >= v_flag.rollout_percentage THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

-- 5. Batch Evaluation for Context (Tenant / User / Env)
CREATE OR REPLACE FUNCTION public.get_all_evaluated_feature_flags(
  _tenant_id uuid DEFAULT NULL,
  _user_id uuid DEFAULT NULL,
  _env text DEFAULT 'production'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_object_agg(
    f.code,
    public.evaluate_feature_flag(f.code, _tenant_id, _user_id, _env)
  ) INTO v_result
  FROM public.feature_flags f;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- 6. Super Admin List Feature Flags & Metadata
CREATE OR REPLACE FUNCTION public.admin_list_feature_flags()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_flags jsonb;
  v_overrides jsonb;
BEGIN
  IF NOT (
    public.has_platform_permission(v_caller_id, 'platform.features.view')
    OR public.has_platform_role(v_caller_id, 'super_admin')
    OR public.has_platform_role(v_caller_id, 'platform_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to view feature flags';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', ff.id,
      'code', ff.code,
      'name', ff.name,
      'description', ff.description,
      'enabled', ff.enabled,
      'environment', ff.environment,
      'rollout_percentage', ff.rollout_percentage,
      'target_plans', ff.target_plans,
      'target_tenants', ff.target_tenants,
      'created_at', ff.created_at,
      'updated_at', ff.updated_at,
      'overrides_count', (
        SELECT COUNT(*) FROM public.tenant_feature_flags tff WHERE tff.feature = ff.code
      )
    ) ORDER BY ff.code ASC
  ) INTO v_flags
  FROM public.feature_flags ff;

  -- Tenant overrides list
  SELECT jsonb_agg(
    jsonb_build_object(
      'tenant_id', tff.tenant_id,
      'tenant_name', t.name,
      'tenant_slug', t.slug,
      'feature', tff.feature,
      'enabled', tff.enabled,
      'reason', tff.reason,
      'updated_at', tff.updated_at
    ) ORDER BY tff.updated_at DESC
  ) INTO v_overrides
  FROM public.tenant_feature_flags tff
  JOIN public.tenants t ON t.id = tff.tenant_id;

  RETURN jsonb_build_object(
    'flags', COALESCE(v_flags, '[]'::jsonb),
    'overrides', COALESCE(v_overrides, '[]'::jsonb)
  );
END;
$$;

-- 7. Super Admin Save / Create Feature Flag
CREATE OR REPLACE FUNCTION public.admin_save_feature_flag(
  _payload jsonb,
  _reason text DEFAULT 'Feature flag saved by Super Admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_flag_id uuid;
  v_code text;
  v_name text;
  v_description text;
  v_enabled boolean;
  v_environment text;
  v_rollout int;
  v_plans text[];
  v_tenants uuid[];
  v_is_new boolean := false;
BEGIN
  IF NOT (
    public.has_platform_permission(v_caller_id, 'platform.features.manage')
    OR public.has_platform_role(v_caller_id, 'super_admin')
    OR public.has_platform_role(v_caller_id, 'platform_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to manage feature flags';
  END IF;

  v_flag_id     := (_payload->>'id')::uuid;
  v_code        := LOWER(TRIM(_payload->>'code'));
  v_name        := TRIM(_payload->>'name');
  v_description := _payload->>'description';
  v_enabled     := COALESCE((_payload->>'enabled')::boolean, false);
  v_environment := COALESCE(_payload->>'environment', 'all');
  v_rollout     := COALESCE((_payload->>'rollout_percentage')::int, 100);

  -- Extract plan targets array
  SELECT COALESCE(ARRAY_AGG(val::text), '{}')
  INTO v_plans
  FROM jsonb_array_elements_text(COALESCE(_payload->'target_plans', '[]'::jsonb)) AS val;

  -- Extract tenant targets array
  SELECT COALESCE(ARRAY_AGG(val::uuid), '{}')
  INTO v_tenants
  FROM jsonb_array_elements_text(COALESCE(_payload->'target_tenants', '[]'::jsonb)) AS val;

  IF v_code IS NULL OR v_code = '' THEN
    RAISE EXCEPTION 'Feature flag code is required';
  END IF;
  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'Feature flag name is required';
  END IF;

  IF v_flag_id IS NULL THEN
    v_is_new := true;
    INSERT INTO public.feature_flags (
      code, name, description, enabled, environment,
      rollout_percentage, target_plans, target_tenants
    )
    VALUES (
      v_code, v_name, v_description, v_enabled, v_environment,
      v_rollout, v_plans, v_tenants
    )
    RETURNING id INTO v_flag_id;
  ELSE
    UPDATE public.feature_flags
    SET
      name               = v_name,
      description        = v_description,
      enabled            = v_enabled,
      environment        = v_environment,
      rollout_percentage = v_rollout,
      target_plans       = v_plans,
      target_tenants     = v_tenants,
      updated_at         = now()
    WHERE id = v_flag_id;
  END IF;

  PERFORM public.platform_audit(
    CASE WHEN v_is_new THEN 'feature_flag.created' ELSE 'feature_flag.updated' END,
    'feature_flag',
    v_flag_id::text,
    jsonb_build_object(
      'flag_id', v_flag_id,
      'code', v_code,
      'name', v_name,
      'enabled', v_enabled,
      'environment', v_environment,
      'rollout_percentage', v_rollout,
      'reason', _reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'flag_id', v_flag_id,
    'code', v_code
  );
END;
$$;

-- 8. Super Admin Toggle Feature Flag
CREATE OR REPLACE FUNCTION public.admin_toggle_feature_flag(
  _flag_id uuid,
  _enabled boolean,
  _reason text DEFAULT 'Status toggled by Super Admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_code text;
  v_old_enabled boolean;
BEGIN
  IF NOT (
    public.has_platform_permission(v_caller_id, 'platform.features.manage')
    OR public.has_platform_role(v_caller_id, 'super_admin')
    OR public.has_platform_role(v_caller_id, 'platform_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to toggle feature flag';
  END IF;

  SELECT code, enabled INTO v_code, v_old_enabled FROM public.feature_flags WHERE id = _flag_id;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'Feature flag not found';
  END IF;

  UPDATE public.feature_flags
  SET enabled = _enabled, updated_at = now()
  WHERE id = _flag_id;

  PERFORM public.platform_audit(
    CASE WHEN _enabled THEN 'feature_flag.enabled' ELSE 'feature_flag.disabled' END,
    'feature_flag',
    _flag_id::text,
    jsonb_build_object(
      'flag_id', _flag_id,
      'code', v_code,
      'old_enabled', v_old_enabled,
      'new_enabled', _enabled,
      'reason', _reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'flag_id', _flag_id,
    'code', v_code,
    'enabled', _enabled
  );
END;
$$;

-- 9. Super Admin Set Tenant Override
CREATE OR REPLACE FUNCTION public.admin_set_tenant_flag_override(
  _tenant_id uuid,
  _flag_code text,
  _enabled boolean,
  _reason text DEFAULT 'Tenant override set by Super Admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
BEGIN
  IF NOT (
    public.has_platform_permission(v_caller_id, 'platform.features.manage')
    OR public.has_platform_role(v_caller_id, 'super_admin')
    OR public.has_platform_role(v_caller_id, 'platform_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to set tenant feature flag override';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant_id) THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  INSERT INTO public.tenant_feature_flags (
    tenant_id, feature, enabled, reason, updated_at
  )
  VALUES (
    _tenant_id, _flag_code, _enabled, _reason, now()
  )
  ON CONFLICT (tenant_id, feature) DO UPDATE SET
    enabled    = EXCLUDED.enabled,
    reason     = EXCLUDED.reason,
    updated_at = now();

  PERFORM public.platform_audit(
    'feature_flag.tenant_override_set',
    'tenant_feature_flag',
    _tenant_id::text,
    jsonb_build_object(
      'tenant_id', _tenant_id,
      'feature_code', _flag_code,
      'enabled', _enabled,
      'reason', _reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', _tenant_id,
    'feature_code', _flag_code,
    'enabled', _enabled
  );
END;
$$;

-- 10. Super Admin Get Flag History
CREATE OR REPLACE FUNCTION public.admin_get_flag_history(
  _flag_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_events jsonb;
BEGIN
  IF NOT (
    public.has_platform_permission(v_caller_id, 'platform.features.view')
    OR public.has_platform_role(v_caller_id, 'super_admin')
    OR public.has_platform_role(v_caller_id, 'platform_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'action', pal.action,
      'actor_user_id', pal.actor_user_id,
      'details', pal.details,
      'created_at', pal.created_at
    ) ORDER BY pal.created_at DESC
  ) INTO v_events
  FROM public.platform_audit_log pal
  WHERE (pal.details->>'code' = _flag_code OR pal.details->>'feature_code' = _flag_code)
  LIMIT 50;

  RETURN COALESCE(v_events, '[]'::jsonb);
END;
$$;
