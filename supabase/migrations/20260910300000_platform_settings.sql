-- ==============================================================================
-- Platform Settings System
-- Migration: 20260910300000_platform_settings.sql
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key           text        PRIMARY KEY,
  value         text,
  type          text        NOT NULL DEFAULT 'string'
                            CONSTRAINT settings_type_check CHECK (type IN ('string', 'number', 'boolean', 'json')),
  category      text        NOT NULL DEFAULT 'general',
  label         text        NOT NULL,
  description   text,
  is_secret     boolean     NOT NULL DEFAULT false,
  updated_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_settings_category_idx ON public.platform_settings(category);

GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can read settings" ON public.platform_settings;
CREATE POLICY "Platform admins can read settings"
  ON public.platform_settings FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "No direct writes to platform_settings" ON public.platform_settings;
CREATE POLICY "No direct writes to platform_settings"
  ON public.platform_settings FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- Seed default settings
INSERT INTO public.platform_settings (key, value, type, category, label, description) VALUES
  ('platform.name',            'NimbusERP',    'string',  'branding',  'Platform Name',           'The name shown to all users across the platform.'),
  ('platform.support_email',   '',             'string',  'branding',  'Support Email',           'Primary support contact email.'),
  ('platform.max_tenants',     '1000',         'number',  'limits',    'Max Tenants',             'Hard cap on total tenant accounts.'),
  ('platform.max_users_per_tenant', '200',     'number',  'limits',    'Max Users per Tenant',    'Default user seat limit for new tenants.'),
  ('platform.trial_days',      '14',           'number',  'billing',   'Trial Days',              'Default free trial period for new tenants.'),
  ('platform.maint_mode',      'false',        'boolean', 'system',    'Maintenance Mode',        'When true, tenant logins are blocked with a maintenance message.'),
  ('platform.maint_message',   '',             'string',  'system',    'Maintenance Message',     'Message displayed during maintenance mode.')
ON CONFLICT (key) DO NOTHING;

-- RPC: upsert a setting
CREATE OR REPLACE FUNCTION public.admin_set_platform_setting(_key text, _value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_platform_permission('platform.settings.manage', auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied: platform.settings.manage required';
  END IF;
  UPDATE public.platform_settings
  SET value = _value, updated_by = auth.uid(), updated_at = now()
  WHERE key = _key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'setting_not_found: % does not exist', _key;
  END IF;
  PERFORM public.platform_audit('settings.updated', 'setting', NULL, _key, jsonb_build_object('key', _key));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_platform_setting(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_platform_setting(text, text) TO service_role;
