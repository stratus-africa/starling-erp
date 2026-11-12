DROP POLICY IF EXISTS "Authenticated users can read permissions" ON public.permissions;
CREATE POLICY "Role managers can read permissions"
  ON public.permissions
  FOR SELECT TO authenticated
  USING (
    public.has_permission('settings.roles')
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "Authenticated users can read role permissions" ON public.role_permissions;
CREATE POLICY "Role managers can read role permissions"
  ON public.role_permissions
  FOR SELECT TO authenticated
  USING (
    public.has_permission('settings.roles')
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "Authenticated users can read tenant feature flags" ON public.tenant_feature_flags;
CREATE POLICY "Tenant members can read own feature flags"
  ON public.tenant_feature_flags
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "Everyone can read system_account_mappings" ON public.system_account_mappings;
CREATE POLICY "Accounting configurators can read system account mappings"
  ON public.system_account_mappings
  FOR SELECT TO authenticated
  USING (
    public.has_permission('accounting.settings.manage')
    OR public.has_permission('accounting.update')
    OR public.is_platform_admin()
  );