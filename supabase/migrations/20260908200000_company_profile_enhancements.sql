-- ==============================================================================
-- Company Profile Enhancements & Permissions
-- File: supabase/migrations/20260908200000_company_profile_enhancements.sql
-- ==============================================================================

-- 1. Extend public.tenants with canonical company profile & regional configuration
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS trading_name text,
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS year_established integer,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state_province text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'Kenya',
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Africa/Nairobi',
  ADD COLUMN IF NOT EXISTS date_format text DEFAULT 'DD/MM/YYYY',
  ADD COLUMN IF NOT EXISTS number_format text DEFAULT '1,234.56',
  ADD COLUMN IF NOT EXISTS fiscal_year_start text DEFAULT '01-01',
  ADD COLUMN IF NOT EXISTS fiscal_year_end text DEFAULT '12-31',
  ADD COLUMN IF NOT EXISTS tax_authority text DEFAULT 'KRA',
  ADD COLUMN IF NOT EXISTS tax_regime text DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS tax_inclusive_pricing boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS signature_url text,
  ADD COLUMN IF NOT EXISTS stamp_url text;

-- 2. Add granular Company Profile permissions
INSERT INTO public.permissions (code, module, action, description)
VALUES
  ('settings.company.view', 'settings.company', 'view', 'View company profile and workspace identity'),
  ('settings.company.update', 'settings.company', 'update', 'Update company profile, branding, and regional configuration')
ON CONFLICT (code) DO UPDATE SET
  module = EXCLUDED.module,
  action = EXCLUDED.action,
  description = EXCLUDED.description;

-- Grant permissions to default administrative roles
INSERT INTO public.role_permissions (role, permission_code)
VALUES
  ('tenant_admin', 'settings.company.view'),
  ('tenant_admin', 'settings.company.update'),
  ('super_admin', 'settings.company.view'),
  ('super_admin', 'settings.company.update')
ON CONFLICT (role, permission_code) DO NOTHING;

-- Also allow viewer and accountants to view company profile
INSERT INTO public.role_permissions (role, permission_code)
VALUES
  ('viewer', 'settings.company.view'),
  ('accountant', 'settings.company.view'),
  ('finance_clerk', 'settings.company.view'),
  ('auditor', 'settings.company.view')
ON CONFLICT (role, permission_code) DO NOTHING;

-- 3. RLS policies on public.tenants
-- Ensure RLS is active
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Tenant members can view their own tenant profile
DROP POLICY IF EXISTS "tenant_members_select" ON public.tenants;
CREATE POLICY "tenant_members_select" ON public.tenants
  FOR SELECT TO authenticated
  USING (
    id = public.current_tenant_id()
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = auth.uid() AND pa.is_active = true AND pa.revoked_at IS NULL
    )
  );

-- Tenant admins can update their own company profile
DROP POLICY IF EXISTS "tenant_admins_update" ON public.tenants;
CREATE POLICY "tenant_admins_update" ON public.tenants
  FOR UPDATE TO authenticated
  USING (
    (
      id = public.current_tenant_id()
      AND (
        public.has_role(auth.uid(), 'tenant_admin'::public.app_role)
        OR public.has_permission('settings.company.update')
      )
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = auth.uid() AND pa.is_active = true AND pa.revoked_at IS NULL
    )
  )
  WITH CHECK (
    (
      id = public.current_tenant_id()
      AND (
        public.has_role(auth.uid(), 'tenant_admin'::public.app_role)
        OR public.has_permission('settings.company.update')
      )
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = auth.uid() AND pa.is_active = true AND pa.revoked_at IS NULL
    )
  );
