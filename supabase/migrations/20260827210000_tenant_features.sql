-- Tenant feature flags: one canonical source for plan/module availability.
CREATE TABLE IF NOT EXISTS public.tenant_features (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  feature text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, feature),
  CONSTRAINT tenant_features_feature_check CHECK (feature IN (
    'multi_location','manufacturing','pos','advanced_inventory',
    'banking','payroll','crm','advanced_reports'
  ))
);

CREATE INDEX IF NOT EXISTS idx_tenant_features_enabled
  ON public.tenant_features (tenant_id, feature) WHERE enabled = true;

ALTER TABLE public.tenant_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_features_select ON public.tenant_features;
CREATE POLICY tenant_features_select ON public.tenant_features
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS tenant_features_admin_write ON public.tenant_features;
CREATE POLICY tenant_features_admin_write ON public.tenant_features
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_permission('settings.features.manage'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission('settings.features.manage'));

CREATE OR REPLACE FUNCTION public.get_my_features()
RETURNS TABLE(feature text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tf.feature
  FROM public.tenant_features tf
  WHERE tf.tenant_id = public.current_tenant_id()
    AND tf.enabled = true
  ORDER BY tf.feature;
$$;

CREATE OR REPLACE FUNCTION public.has_feature(p_feature text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_features tf
    WHERE tf.tenant_id = public.current_tenant_id()
      AND tf.feature = p_feature
      AND tf.enabled = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_my_features() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_feature(text) TO authenticated;

-- Keep existing tenants functional after introducing feature gating. Platform admins
-- can disable features per tenant; new tenants start with the conservative baseline.
INSERT INTO public.tenant_features (tenant_id, feature, enabled, source)
SELECT t.id, f.feature, true, 'legacy_migration'
FROM public.tenants t
CROSS JOIN (VALUES
  ('multi_location'),('manufacturing'),('pos'),('advanced_inventory'),
  ('banking'),('payroll'),('crm'),('advanced_reports')
) AS f(feature)
ON CONFLICT (tenant_id, feature) DO NOTHING;
