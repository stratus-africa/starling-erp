-- Authentication, RBAC, and tenant isolation hardening.
-- Platform authorization is separate from tenant authorization. Platform roles
-- must not become global tenant super_admins.

-- Remove the historical global tenant-role grants for delegated platform roles.
-- True platform super admins retain platform_admins authorization and may also
-- retain an explicitly assigned tenant role where required by the tenant model.
DELETE FROM public.user_roles ur
USING public.platform_admins pa
WHERE pa.user_id = ur.user_id
  AND ur.tenant_id IS NULL
  AND ur.role = 'super_admin'::public.app_role
  AND pa.platform_role <> 'super_admin';

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT (
    (auth.uid() IS NULL OR _user_id IS NULL OR _user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = COALESCE(_user_id, auth.uid())
        AND pa.is_active = true
        AND pa.revoked_at IS NULL
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_platform_permission(
  _code text,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT (
    (auth.uid() IS NULL OR _user_id IS NULL OR _user_id = auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.platform_admins pa
      JOIN public.platform_role_permissions prp ON prp.role_name = pa.platform_role
      WHERE pa.user_id = COALESCE(_user_id, auth.uid())
        AND pa.is_active = true
        AND pa.revoked_at IS NULL
        AND prp.permission_code = _code
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_platform_permission(_user_id uuid, _code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT public.has_platform_permission(_code, _user_id);
$$;

CREATE OR REPLACE FUNCTION public.has_permission(
  _permission text,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT (
    (auth.uid() IS NULL OR _user_id IS NULL OR _user_id = auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = COALESCE(_user_id, auth.uid())
        AND ur.tenant_id = public.current_tenant_id()
        AND (
          ur.role IN ('tenant_admin'::public.app_role)
          OR COALESCE(
            (
              SELECT o.enabled
              FROM public.tenant_role_permission_overrides o
              WHERE o.tenant_id = ur.tenant_id
                AND o.role = ur.role::text
                AND o.permission_code = _permission
            ),
            EXISTS (
              SELECT 1 FROM public.role_permissions rp
              WHERE rp.role = ur.role::text AND rp.permission_code = _permission
            )
          )
        )
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT (
    (auth.uid() IS NULL OR _user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.tenant_id = public.current_tenant_id()
        AND ur.role = _role
    )
  );
$$;

-- Restrict the broad tenant-detail payload to platform administrators with a
-- suitable platform role, or to an explicitly active support session.
CREATE OR REPLACE FUNCTION public.get_tenant_detail(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_tenant record;
  v_platform_role text;
  v_support boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT pa.platform_role::text INTO v_platform_role
  FROM public.platform_admins pa
  WHERE pa.user_id = auth.uid() AND pa.is_active = true AND pa.revoked_at IS NULL;

  SELECT EXISTS (
    SELECT 1 FROM public.platform_support_sessions ps
    WHERE ps.admin_id = auth.uid()
      AND ps.target_tenant_id = _tenant_id
      AND ps.status = 'active'
      AND ps.expires_at > now()
  ) INTO v_support;

  IF v_platform_role NOT IN ('super_admin', 'platform_admin') AND NOT v_support THEN
    RAISE EXCEPTION 'Not authorized to inspect this tenant' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_platform_permission('platform.tenants.view') THEN
    RAISE EXCEPTION 'Not authorized: platform.tenants.view' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = _tenant_id AND deleted_at IS NULL;
  IF v_tenant.id IS NULL THEN RAISE EXCEPTION 'Tenant not found'; END IF;

  RETURN jsonb_build_object(
    'tenant', to_jsonb(v_tenant),
    'subscription', (
      SELECT jsonb_build_object('id', ts.id, 'status', ts.status, 'plan_id', ts.plan_id,
        'plan_name', pl.name, 'plan_code', pl.code, 'price_usd', pl.price_usd,
        'max_users', COALESCE(ts.override_max_users, pl.max_users),
        'max_storage_gb', COALESCE(ts.override_max_storage, pl.max_storage_gb),
        'trial_ends_at', ts.trial_ends_at, 'current_period_start', ts.current_period_start,
        'current_period_end', ts.current_period_end, 'cancelled_at', ts.cancelled_at,
        'external_id', ts.external_id, 'notes', ts.notes, 'created_at', ts.created_at)
      FROM public.tenant_subscriptions ts JOIN public.plans pl ON pl.id = ts.plan_id
      WHERE ts.tenant_id = _tenant_id ORDER BY ts.created_at DESC LIMIT 1
    ),
    'subscription_history', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', ts.id, 'status', ts.status, 'plan_name', pl.name,
        'plan_code', pl.code, 'price_usd', pl.price_usd,
        'created_at', ts.created_at, 'cancelled_at', ts.cancelled_at
      ) ORDER BY ts.created_at DESC)
      FROM public.tenant_subscriptions ts
      JOIN public.plans pl ON pl.id = ts.plan_id
      WHERE ts.tenant_id = _tenant_id
    ),
    'users', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', p.id, 'email', p.email, 'full_name', p.full_name,
        'roles', (SELECT jsonb_agg(ur.role ORDER BY ur.role) FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.tenant_id = _tenant_id),
        'created_at', p.created_at, 'updated_at', p.updated_at
      ) ORDER BY p.created_at DESC), '[]'::jsonb)
      FROM public.profiles p WHERE p.tenant_id = _tenant_id
    ),
    'usage', jsonb_build_object(
      'user_count', (SELECT count(*) FROM public.profiles WHERE tenant_id = _tenant_id),
      'active_users_30d', (SELECT count(*) FROM public.profiles WHERE tenant_id = _tenant_id AND updated_at >= now() - interval '30 days'),
      'feature_flags', (SELECT jsonb_object_agg(feature, enabled) FROM public.tenant_features WHERE tenant_id = _tenant_id),
      'journal_count', (SELECT count(*) FROM public.journal_entries WHERE tenant_id = _tenant_id AND deleted_at IS NULL),
      'invoice_count', (SELECT count(*) FROM public.invoices WHERE tenant_id = _tenant_id AND deleted_at IS NULL)
    ),
    'platform_activity', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', pal.id, 'action', pal.action, 'actor_email', pal.actor_email,
        'actor_role', pal.actor_role, 'target_label', pal.target_label,
        'detail', pal.detail, 'created_at', pal.created_at
      ) ORDER BY pal.created_at DESC)
      FROM (
        SELECT * FROM public.platform_audit_log
        WHERE acting_as_tenant_id = _tenant_id OR (target_type = 'tenant' AND target_id = _tenant_id)
        ORDER BY created_at DESC LIMIT 30
      ) pal
    ),
    'business_events', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', be.id, 'action', be.action, 'entity_type', be.entity_type,
        'entity_id', be.entity_id, 'actor_email', be.actor_email,
        'old_values', be.old_values, 'new_values', be.new_values, 'occurred_at', be.occurred_at
      ) ORDER BY be.occurred_at DESC)
      FROM (SELECT * FROM public.business_events WHERE tenant_id = _tenant_id ORDER BY occurred_at DESC LIMIT 50) be
    ),
    'health', jsonb_build_object(
      'integrity_errors', (SELECT count(*) FROM public.accounting_integrity_findings WHERE tenant_id = _tenant_id AND resolved_at IS NULL AND severity = 'error'),
      'integrity_warnings', (SELECT count(*) FROM public.accounting_integrity_findings WHERE tenant_id = _tenant_id AND resolved_at IS NULL AND severity = 'warning'),
      'unbalanced_journals', (SELECT count(*) FROM public.journal_entries WHERE tenant_id = _tenant_id AND deleted_at IS NULL AND status = 'Posted' AND ABS(COALESCE(total_debit, 0) - COALESCE(total_credit, 0)) > 0.005),
      'draft_journals', (SELECT count(*) FROM public.journal_entries WHERE tenant_id = _tenant_id AND deleted_at IS NULL AND status = 'Draft'),
      'unposted_invoices', (SELECT count(*) FROM public.invoices WHERE tenant_id = _tenant_id AND deleted_at IS NULL AND voided_at IS NULL AND posted_at IS NULL AND status NOT IN ('Cancelled', 'Voided')),
      'active_support_sessions', (SELECT count(*) FROM public.platform_support_sessions WHERE target_tenant_id = _tenant_id AND status = 'active' AND expires_at > now())
    ),
    'available_plans', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', pl.id, 'name', pl.name, 'code', pl.code, 'price_usd', pl.price_usd,
        'max_users', pl.max_users, 'max_storage_gb', pl.max_storage_gb
      ) ORDER BY pl.sort_order)
      FROM public.plans pl WHERE pl.is_active = true
    )
  );
END;
$$;

-- Bound tenant switching: ordinary users may select only an existing
-- membership; support users may select only their active support target.
CREATE OR REPLACE FUNCTION public.switch_tenant(target_tenant text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_tenant uuid := NULLIF(target_tenant, '')::uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.tenant_id = v_tenant
  ) AND NOT EXISTS (
    SELECT 1 FROM public.platform_support_sessions ps
    WHERE ps.admin_id = auth.uid() AND ps.target_tenant_id = v_tenant
      AND ps.status = 'active' AND ps.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'Tenant access denied' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('request.jwt.claim.tenant_id', v_tenant::text, true);
  RETURN v_tenant::text;
END;
$$;

-- Bound resource usage for platform security operators.
CREATE OR REPLACE FUNCTION public.admin_get_sessions(_limit integer DEFAULT 200)
RETURNS TABLE (
  id uuid, user_id uuid, created_at timestamptz, updated_at timestamptz,
  factor_id uuid, aal text, not_after timestamptz, refreshed_at text,
  user_agent text, ip inet, tag text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public, pg_catalog
AS $$
BEGIN
  IF NOT public.has_platform_permission('platform.security.view') THEN
    RAISE EXCEPTION 'permission_denied: platform.security.view required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT s.id, s.user_id, s.created_at, s.updated_at, s.factor_id,
    s.aal::text, s.not_after, NULL::text, NULL::text, NULL::inet, NULL::text
  FROM auth.sessions s ORDER BY s.updated_at DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(_limit, 200), 1), 500);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_grant_platform_access(
  _user_id uuid,
  _platform_role text DEFAULT 'support_admin',
  _notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_email text;
  v_full_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_platform_permission('platform.admins.manage') THEN
    RAISE EXCEPTION 'Not authorized: platform.admins.manage' USING ERRCODE = '42501';
  END IF;
  IF _user_id = auth.uid() AND _platform_role = 'super_admin' THEN
    RAISE EXCEPTION 'Cannot grant super_admin to yourself';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.platform_roles WHERE name = _platform_role) THEN
    RAISE EXCEPTION 'Unknown platform role: %', _platform_role;
  END IF;
  SELECT email, full_name INTO v_email, v_full_name FROM public.profiles WHERE id = _user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'User not found in profiles'; END IF;

  INSERT INTO public.platform_admins (user_id, platform_role, email, full_name, is_active, notes, granted_by)
  VALUES (_user_id, _platform_role, v_email, v_full_name, true, _notes, auth.uid())
  ON CONFLICT (user_id) DO UPDATE SET
    platform_role = EXCLUDED.platform_role,
    is_active = true,
    revoked_at = NULL,
    notes = COALESCE(EXCLUDED.notes, platform_admins.notes),
    granted_by = auth.uid(),
    updated_at = now();

  DELETE FROM public.user_roles
  WHERE user_id = _user_id AND tenant_id IS NULL AND role = 'super_admin'::public.app_role
    AND _platform_role <> 'super_admin';

  PERFORM public.platform_audit('admin.access.granted', 'user', _user_id, v_email,
    jsonb_build_object('platform_role', _platform_role, 'notes', _notes));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_platform_access(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_platform_access(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.switch_tenant(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.switch_tenant(text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_tenant_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_detail(uuid) TO authenticated;
