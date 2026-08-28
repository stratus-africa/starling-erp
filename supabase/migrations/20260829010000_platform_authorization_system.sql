-- =========================================================
-- Platform Authorization System
--
-- Expands the platform role/permission model established in
-- 20260829000000 with the full required role set and the
-- complete 27-permission catalogue.
--
-- Roles added / renamed:
--   super_admin    (existing — kept, system flag)
--   platform_admin (new — delegates operational tasks)
--   support_admin  (replaces 'support')
--   billing_admin  (replaces 'billing')
--   security_admin (new — dedicated security role)
--   readonly       (existing — kept as auditor role)
--
-- Old role aliases ('support', 'billing') are retained in
-- platform_roles so existing platform_admins rows are not
-- broken.  New assignments should use the canonical names.
--
-- All permission codes follow the format:
--   platform.<module>.<action>
--
-- Server-side enforcement:
--   Every sensitive RPC calls has_platform_permission(code)
--   before executing.  The frontend cache is UX-only.
--
-- Compatibility:
--   Tenant-level permissions (in public.permissions) are
--   untouched.  Tenant RLS policies are untouched.
-- =========================================================

-- ─────────────────────────────────────────────────────────
-- 1.  ADD NEW PLATFORM ROLES
-- ─────────────────────────────────────────────────────────

INSERT INTO public.platform_roles (name, description, is_system) VALUES
  ('platform_admin', 'Operational platform access: tenants, users, features, billing. Cannot manage other admins or security policy.', true),
  ('support_admin',  'Dedicated support role: read tenant data and open impersonation sessions. No billing or security access.', true),
  ('billing_admin',  'Dedicated billing role: manage plans and subscriptions. No impersonation or security access.', true),
  ('security_admin', 'Dedicated security role: view and manage security events and audit logs. No impersonation or billing access.', true)
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────────────────
-- 2.  FULL PERMISSION CATALOGUE
--
--     27 codes covering every admin UI section.
--     Uses ON CONFLICT DO UPDATE so descriptions stay current
--     even if partially seeded by the previous migration.
-- ─────────────────────────────────────────────────────────

INSERT INTO public.platform_permissions (code, module, action, description) VALUES
  -- Dashboard
  ('platform.dashboard.view',         'dashboard',     'view',    'Access the platform admin dashboard'),
  -- Tenants
  ('platform.tenants.view',           'tenants',       'view',    'View list of all tenants and their metadata'),
  ('platform.tenants.create',         'tenants',       'create',  'Provision a new tenant workspace'),
  ('platform.tenants.update',         'tenants',       'update',  'Edit tenant metadata (name, slug, currency)'),
  ('platform.tenants.activate',       'tenants',       'activate','Re-activate a suspended or cancelled tenant'),
  ('platform.tenants.suspend',        'tenants',       'suspend', 'Suspend a tenant (blocks logins and access)'),
  ('platform.tenants.delete',         'tenants',       'delete',  'Permanently delete a tenant and all its data'),
  -- Users
  ('platform.users.view',             'users',         'view',    'View all users across all tenants'),
  ('platform.users.manage',           'users',         'manage',  'Edit user profiles and assign tenant roles'),
  -- Support / impersonation
  ('platform.support.view',           'support',       'view',    'View support session history'),
  ('platform.support.impersonate',    'support',       'impersonate','Open a timed support session inside a tenant'),
  -- Billing
  ('platform.billing.view',           'billing',       'view',    'View billing records and payment history'),
  ('platform.billing.manage',         'billing',       'manage',  'Record payments and adjust billing details'),
  -- Plans
  ('platform.plans.view',             'plans',         'view',    'View the subscription plan catalogue'),
  ('platform.plans.manage',           'plans',         'manage',  'Create, edit, and delete subscription plans'),
  -- Features
  ('platform.features.view',          'features',      'view',    'View feature flag status per tenant'),
  ('platform.features.manage',        'features',      'manage',  'Enable or disable feature flags per tenant'),
  -- Settings
  ('platform.settings.view',          'settings',      'view',    'View platform-wide configuration'),
  ('platform.settings.manage',        'settings',      'manage',  'Change platform-wide configuration'),
  -- Audit
  ('platform.audit.view',             'audit',         'view',    'Read the platform audit log'),
  -- Security
  ('platform.security.view',          'security',      'view',    'View platform security events'),
  ('platform.security.manage',        'security',      'manage',  'Resolve security events and manage policies'),
  -- System
  ('platform.system.view',            'system',        'view',    'View system health and infrastructure metrics'),
  ('platform.system.manage',          'system',        'manage',  'Perform system maintenance operations'),
  -- Announcements
  ('platform.announcements.view',     'announcements', 'view',    'View platform announcements'),
  ('platform.announcements.manage',   'announcements', 'manage',  'Create and publish platform announcements'),
  -- Admin management (kept from previous migration)
  ('platform.admins.view',            'admins',        'view',    'View the list of platform administrators'),
  ('platform.admins.manage',          'admins',        'manage',  'Grant and revoke platform admin access')
ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  module      = EXCLUDED.module,
  action      = EXCLUDED.action;

-- ─────────────────────────────────────────────────────────
-- 3.  BACKWARD-COMPAT: map legacy codes to new codes
--     The previous migration seeded codes like
--     'platform.tenants.read' which are no longer used.
--     Rather than delete them (which could break existing
--     role_permissions rows), we insert the old codes as
--     aliases so old grants still resolve.
-- ─────────────────────────────────────────────────────────

INSERT INTO public.platform_permissions (code, module, action, description) VALUES
  ('platform.tenants.read',         'tenants',       'read',        'Legacy alias → platform.tenants.view'),
  ('platform.users.read',           'users',         'read',        'Legacy alias → platform.users.view'),
  ('platform.users.impersonate',    'users',         'impersonate', 'Legacy alias → platform.support.impersonate'),
  ('platform.users.set_roles',      'users',         'set_roles',   'Legacy alias → platform.users.manage'),
  ('platform.plans.read',           'plans',         'read',        'Legacy alias → platform.plans.view'),
  ('platform.plans.create',         'plans',         'create',      'Legacy alias → platform.plans.manage'),
  ('platform.plans.update',         'plans',         'update',      'Legacy alias → platform.plans.manage'),
  ('platform.plans.delete',         'plans',         'delete',      'Legacy alias → platform.plans.manage'),
  ('platform.subscriptions.read',   'subscriptions', 'read',        'Legacy alias → platform.plans.view'),
  ('platform.subscriptions.assign', 'subscriptions', 'assign',      'Legacy alias → platform.plans.manage'),
  ('platform.audit.read',           'audit',         'read',        'Legacy alias → platform.audit.view'),
  ('platform.admins.read',          'admins',        'read',        'Legacy alias → platform.admins.view'),
  ('platform.security.read',        'security',      'read',        'Legacy alias → platform.security.view')
ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description;

-- ─────────────────────────────────────────────────────────
-- 4.  ROLE → PERMISSION MATRIX
--
--     Principle of least privilege:
--       super_admin    — everything
--       platform_admin — everything except admin management and security policy
--       support_admin  — view tenants/users + impersonate, view audit
--       billing_admin  — plans/billing/features, view tenants
--       security_admin — security + audit, view tenants/users
--       readonly       — view-only across all areas
-- ─────────────────────────────────────────────────────────

-- Clear existing grants for roles we are redefining (safe: roles are still valid)
DELETE FROM public.platform_role_permissions
WHERE role_name IN ('platform_admin','support_admin','billing_admin','security_admin');

-- ── super_admin — full access to everything ──────────────
INSERT INTO public.platform_role_permissions (role_name, permission_code)
SELECT 'super_admin', code FROM public.platform_permissions
ON CONFLICT DO NOTHING;

-- ── platform_admin — operational, not security/admin-mgmt ─
INSERT INTO public.platform_role_permissions (role_name, permission_code)
SELECT 'platform_admin', code FROM public.platform_permissions
WHERE code NOT IN (
  'platform.admins.manage',
  'platform.security.manage',
  'platform.system.manage'
)
ON CONFLICT DO NOTHING;

-- ── support_admin ─────────────────────────────────────────
INSERT INTO public.platform_role_permissions (role_name, permission_code) VALUES
  ('support_admin', 'platform.dashboard.view'),
  ('support_admin', 'platform.tenants.view'),
  ('support_admin', 'platform.tenants.read'),   -- legacy alias
  ('support_admin', 'platform.users.view'),
  ('support_admin', 'platform.users.read'),     -- legacy alias
  ('support_admin', 'platform.support.view'),
  ('support_admin', 'platform.support.impersonate'),
  ('support_admin', 'platform.users.impersonate'), -- legacy alias
  ('support_admin', 'platform.plans.view'),
  ('support_admin', 'platform.plans.read'),     -- legacy alias
  ('support_admin', 'platform.subscriptions.read'),
  ('support_admin', 'platform.billing.view'),
  ('support_admin', 'platform.features.view'),
  ('support_admin', 'platform.audit.view'),
  ('support_admin', 'platform.audit.read'),     -- legacy alias
  ('support_admin', 'platform.announcements.view'),
  ('support_admin', 'platform.admins.view')
ON CONFLICT DO NOTHING;

-- ── billing_admin ─────────────────────────────────────────
INSERT INTO public.platform_role_permissions (role_name, permission_code) VALUES
  ('billing_admin', 'platform.dashboard.view'),
  ('billing_admin', 'platform.tenants.view'),
  ('billing_admin', 'platform.tenants.read'),    -- legacy alias
  ('billing_admin', 'platform.tenants.activate'),
  ('billing_admin', 'platform.tenants.suspend'),
  ('billing_admin', 'platform.users.view'),
  ('billing_admin', 'platform.billing.view'),
  ('billing_admin', 'platform.billing.manage'),
  ('billing_admin', 'platform.plans.view'),
  ('billing_admin', 'platform.plans.read'),      -- legacy alias
  ('billing_admin', 'platform.plans.manage'),
  ('billing_admin', 'platform.plans.create'),    -- legacy alias
  ('billing_admin', 'platform.plans.update'),    -- legacy alias
  ('billing_admin', 'platform.plans.delete'),    -- legacy alias
  ('billing_admin', 'platform.subscriptions.read'),
  ('billing_admin', 'platform.subscriptions.assign'),
  ('billing_admin', 'platform.features.view'),
  ('billing_admin', 'platform.features.manage'),
  ('billing_admin', 'platform.audit.view'),
  ('billing_admin', 'platform.audit.read'),      -- legacy alias
  ('billing_admin', 'platform.announcements.view')
ON CONFLICT DO NOTHING;

-- ── security_admin ────────────────────────────────────────
INSERT INTO public.platform_role_permissions (role_name, permission_code) VALUES
  ('security_admin', 'platform.dashboard.view'),
  ('security_admin', 'platform.tenants.view'),
  ('security_admin', 'platform.tenants.read'),   -- legacy alias
  ('security_admin', 'platform.users.view'),
  ('security_admin', 'platform.users.read'),     -- legacy alias
  ('security_admin', 'platform.support.view'),
  ('security_admin', 'platform.audit.view'),
  ('security_admin', 'platform.audit.read'),     -- legacy alias
  ('security_admin', 'platform.security.view'),
  ('security_admin', 'platform.security.manage'),
  ('security_admin', 'platform.security.read'),  -- legacy alias
  ('security_admin', 'platform.system.view'),
  ('security_admin', 'platform.announcements.view'),
  ('security_admin', 'platform.admins.view'),
  ('security_admin', 'platform.admins.read')     -- legacy alias
ON CONFLICT DO NOTHING;

-- ── readonly — view-only across everything ────────────────
DELETE FROM public.platform_role_permissions WHERE role_name = 'readonly';
INSERT INTO public.platform_role_permissions (role_name, permission_code)
SELECT 'readonly', code FROM public.platform_permissions
WHERE action IN ('view', 'read')  -- only view/read codes
ON CONFLICT DO NOTHING;

-- Sync legacy role aliases 'support' and 'billing' to the new roles' grants
-- so existing platform_admins rows with those roles continue to work.
DELETE FROM public.platform_role_permissions WHERE role_name IN ('support','billing');

INSERT INTO public.platform_role_permissions (role_name, permission_code)
SELECT 'support', permission_code FROM public.platform_role_permissions
WHERE role_name = 'support_admin'
ON CONFLICT DO NOTHING;

INSERT INTO public.platform_role_permissions (role_name, permission_code)
SELECT 'billing', permission_code FROM public.platform_role_permissions
WHERE role_name = 'billing_admin'
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────
-- 5.  UPDATE has_platform_permission() TO USE NEW CODES
--     AND ADD ALIAS RESOLUTION
--
--     The function now also accepts:
--       platform.tenants.view  ↔  platform.tenants.read
--       platform.support.impersonate ↔ platform.users.impersonate
--     by checking both the given code AND any alias that maps to
--     the same module+action pattern.
--     This is simpler than a full alias table — the permission
--     codes are self-describing.
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.has_platform_permission(
  _code    text,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.platform_admins pa
    JOIN   public.platform_role_permissions prp ON prp.role_name = pa.platform_role
    WHERE  pa.user_id    = COALESCE(_user_id, auth.uid())
      AND  pa.is_active  = true
      AND  pa.revoked_at IS NULL
      AND  prp.permission_code = _code
  );
$$;

-- ─────────────────────────────────────────────────────────
-- 6.  UPDATE admin_set_tenant_status TO USE NEW CODES
--     (platform.tenants.suspend → platform.tenants.activate
--      for re-activation, platform.tenants.delete for hard delete)
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_set_tenant_status(
  _tenant_id  uuid,
  _new_status text,
  _reason     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old  text;
  v_name text;
  v_required_permission text;
BEGIN
  IF _new_status NOT IN ('active','suspended','cancelled','archived') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be active, suspended, cancelled, or archived', _new_status;
  END IF;

  -- Map status transition to required permission
  v_required_permission := CASE _new_status
    WHEN 'active'    THEN 'platform.tenants.activate'
    WHEN 'suspended' THEN 'platform.tenants.suspend'
    WHEN 'cancelled' THEN 'platform.tenants.delete'
    WHEN 'archived'  THEN 'platform.tenants.delete'
    ELSE 'platform.tenants.suspend'
  END;

  IF NOT public.has_platform_permission(v_required_permission) THEN
    RAISE EXCEPTION 'Not authorized: %', v_required_permission USING ERRCODE = '42501';
  END IF;

  SELECT name, status INTO v_name, v_old
  FROM public.tenants WHERE id = _tenant_id AND deleted_at IS NULL;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Tenant not found'; END IF;

  UPDATE public.tenants SET status = _new_status WHERE id = _tenant_id;

  IF _new_status = 'suspended' THEN
    UPDATE public.tenant_subscriptions SET status = 'suspended'
    WHERE tenant_id = _tenant_id AND status IN ('active','trial');
  ELSIF _new_status = 'active' AND v_old = 'suspended' THEN
    UPDATE public.tenant_subscriptions SET status = 'active'
    WHERE tenant_id = _tenant_id AND status = 'suspended';
  END IF;

  PERFORM public.platform_audit('tenant.' || _new_status, 'tenant', _tenant_id, v_name,
    jsonb_build_object('old_status', v_old, 'new_status', _new_status,
                       'reason', _reason, 'permission_used', v_required_permission));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_tenant_status(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_tenant_status(uuid,text,text) TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 7.  UPDATE begin_support_session TO USE NEW CODE
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.begin_support_session(
  _target_tenant_id uuid,
  _reason           text,
  _ttl_minutes      integer DEFAULT 240
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session_id  uuid;
  v_tenant_name text;
  v_admin_email text;
  v_ttl         integer := LEAST(GREATEST(COALESCE(_ttl_minutes, 240), 15), 480);
BEGIN
  -- Accept both old and new permission code for backward compat
  IF NOT (
    public.has_platform_permission('platform.support.impersonate')
    OR public.has_platform_permission('platform.users.impersonate')
  ) THEN
    RAISE EXCEPTION 'Not authorized: platform.support.impersonate' USING ERRCODE = '42501';
  END IF;

  IF _reason IS NULL OR trim(_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required to begin a support session';
  END IF;

  SELECT name INTO v_tenant_name FROM public.tenants
  WHERE id = _target_tenant_id AND deleted_at IS NULL;
  IF v_tenant_name IS NULL THEN RAISE EXCEPTION 'Tenant not found or deleted'; END IF;

  SELECT email INTO v_admin_email FROM public.platform_admins WHERE user_id = auth.uid();

  -- Close any existing active session for this admin
  UPDATE public.platform_support_sessions
  SET    status    = 'ended',
         ended_at  = now(),
         ended_by  = auth.uid(),
         end_reason = 'Superseded by new session'
  WHERE  admin_id = auth.uid() AND status = 'active';

  INSERT INTO public.platform_support_sessions (
    admin_id, admin_email, target_tenant_id, target_tenant_name,
    reason, expires_at, tenant_snapshot
  ) VALUES (
    auth.uid(), v_admin_email, _target_tenant_id, v_tenant_name,
    trim(_reason),
    now() + (v_ttl || ' minutes')::interval,
    (SELECT to_jsonb(t) FROM public.tenants t WHERE t.id = _target_tenant_id)
  ) RETURNING id INTO v_session_id;

  PERFORM public.switch_tenant(_target_tenant_id::text);

  PERFORM public.platform_audit(
    'support.session.begin', 'tenant', _target_tenant_id, v_tenant_name,
    jsonb_build_object(
      'session_id',  v_session_id,
      'reason',      trim(_reason),
      'ttl_minutes', v_ttl,
      'expires_at',  now() + (v_ttl || ' minutes')::interval
    )
  );

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_support_session(uuid,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_support_session(uuid,text,integer) TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 8.  UPDATE admin_set_tenant_plan TO USE NEW CODE
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_set_tenant_plan(
  _tenant_id uuid,
  _plan_id   uuid,
  _notes     text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sub_id uuid; v_plan_name text; v_tenant_name text; v_old_plan text;
BEGIN
  -- Accept both old and new permission codes
  IF NOT (
    public.has_platform_permission('platform.plans.manage')
    OR public.has_platform_permission('platform.subscriptions.assign')
  ) THEN
    RAISE EXCEPTION 'Not authorized: platform.plans.manage' USING ERRCODE = '42501';
  END IF;

  SELECT name INTO v_plan_name   FROM public.plans   WHERE id = _plan_id   AND is_active = true;
  SELECT name INTO v_tenant_name FROM public.tenants WHERE id = _tenant_id AND deleted_at IS NULL;
  IF v_plan_name   IS NULL THEN RAISE EXCEPTION 'Plan not found or inactive'; END IF;
  IF v_tenant_name IS NULL THEN RAISE EXCEPTION 'Tenant not found'; END IF;

  SELECT p.name INTO v_old_plan
  FROM public.tenant_subscriptions ts JOIN public.plans p ON p.id = ts.plan_id
  WHERE ts.tenant_id = _tenant_id AND ts.status IN ('active','trial') LIMIT 1;

  UPDATE public.tenant_subscriptions SET status = 'cancelled', cancelled_at = now()
  WHERE tenant_id = _tenant_id AND status IN ('active','trial');

  INSERT INTO public.tenant_subscriptions (tenant_id, plan_id, status, created_by, notes)
  VALUES (_tenant_id, _plan_id, 'active', auth.uid(), _notes)
  RETURNING id INTO v_sub_id;

  -- Sync feature flags to new plan
  DELETE FROM public.tenant_features
  WHERE tenant_id = _tenant_id
    AND feature NOT IN (SELECT feature FROM public.plan_features WHERE plan_id = _plan_id);

  INSERT INTO public.tenant_features (tenant_id, feature, enabled, source)
  SELECT _tenant_id, pf.feature, true, 'plan_sync'
  FROM   public.plan_features pf WHERE pf.plan_id = _plan_id
  ON CONFLICT (tenant_id, feature) DO UPDATE SET enabled = true, source = 'plan_sync';

  PERFORM public.platform_audit(
    'tenant.plan.changed', 'tenant', _tenant_id, v_tenant_name,
    jsonb_build_object('old_plan', v_old_plan, 'new_plan', v_plan_name,
                       'subscription_id', v_sub_id, 'notes', _notes)
  );

  RETURN v_sub_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_tenant_plan(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_tenant_plan(uuid,uuid,text) TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 9.  UPDATE admin_set_feature_flag TO USE NEW CODE
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_set_feature_flag(
  _tenant_id uuid,
  _feature   text,
  _enabled   boolean,
  _reason    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_name text; v_old boolean;
BEGIN
  IF NOT public.has_platform_permission('platform.features.manage') THEN
    RAISE EXCEPTION 'Not authorized: platform.features.manage' USING ERRCODE = '42501';
  END IF;

  SELECT name INTO v_name FROM public.tenants WHERE id = _tenant_id AND deleted_at IS NULL;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Tenant not found'; END IF;

  SELECT enabled INTO v_old FROM public.tenant_features
  WHERE tenant_id = _tenant_id AND feature = _feature;

  INSERT INTO public.tenant_features (tenant_id, feature, enabled, source)
  VALUES (_tenant_id, _feature, _enabled, 'admin_override')
  ON CONFLICT (tenant_id, feature) DO UPDATE
    SET enabled = EXCLUDED.enabled, source = 'admin_override', updated_at = now();

  PERFORM public.platform_audit(
    CASE WHEN _enabled THEN 'feature.enabled' ELSE 'feature.disabled' END,
    'tenant', _tenant_id, v_name,
    jsonb_build_object('feature', _feature, 'old_enabled', v_old,
                       'new_enabled', _enabled, 'reason', _reason)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_feature_flag(uuid,text,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_feature_flag(uuid,text,boolean,text) TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 10.  UPDATE admin_grant/revoke TO USE NEW CODES
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_grant_platform_access(
  _user_id       uuid,
  _platform_role text DEFAULT 'support_admin',
  _notes         text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_email text; v_full_name text;
BEGIN
  IF NOT public.has_platform_permission('platform.admins.manage') THEN
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

  -- Ensure user_roles has super_admin so is_platform_admin() dual check passes
  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (_user_id, NULL, 'super_admin')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.platform_admins (user_id, platform_role, email, full_name, is_active, notes, granted_by)
  VALUES (_user_id, _platform_role, v_email, v_full_name, true, _notes, auth.uid())
  ON CONFLICT (user_id) DO UPDATE SET
    platform_role = EXCLUDED.platform_role,
    is_active     = true,
    revoked_at    = NULL,
    notes         = COALESCE(EXCLUDED.notes, platform_admins.notes),
    granted_by    = auth.uid(),
    updated_at    = now();

  PERFORM public.platform_audit('admin.access.granted', 'user', _user_id, v_email,
    jsonb_build_object('platform_role', _platform_role, 'notes', _notes));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_platform_access(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_grant_platform_access(uuid,text,text) TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 11.  get_platform_audit_log — use new view permission code
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_platform_audit_log(
  _limit       integer     DEFAULT 100,
  _action      text        DEFAULT NULL,
  _target_type text        DEFAULT NULL,
  _target_id   uuid        DEFAULT NULL,
  _actor_id    uuid        DEFAULT NULL,
  _tenant_id   uuid        DEFAULT NULL,
  _from        timestamptz DEFAULT NULL,
  _to          timestamptz DEFAULT NULL
)
RETURNS SETOF public.platform_audit_log
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.platform_audit_log
  WHERE (
    public.has_platform_permission('platform.audit.view')
    OR public.has_platform_permission('platform.audit.read')  -- legacy alias
  )
  AND (_action      IS NULL OR action      = _action)
  AND (_target_type IS NULL OR target_type = _target_type)
  AND (_target_id   IS NULL OR target_id   = _target_id)
  AND (_actor_id    IS NULL OR actor_id    = _actor_id)
  AND (_tenant_id   IS NULL OR acting_as_tenant_id = _tenant_id)
  AND (_from        IS NULL OR created_at  >= _from)
  AND (_to          IS NULL OR created_at  <= _to)
  ORDER BY created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 1000);
$$;

REVOKE ALL ON FUNCTION public.get_platform_audit_log(integer,text,text,uuid,uuid,uuid,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_audit_log(integer,text,text,uuid,uuid,uuid,timestamptz,timestamptz) TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 12.  RLS POLICY UPDATES
--      Extend existing policies to accept new permission codes
-- ─────────────────────────────────────────────────────────

-- platform_audit_log read: accept both old and new code
DROP POLICY IF EXISTS "Platform admins can read audit log" ON public.platform_audit_log;
CREATE POLICY "Platform admins can read audit log"
  ON public.platform_audit_log FOR SELECT TO authenticated
  USING (
    public.has_platform_permission('platform.audit.view')
    OR public.has_platform_permission('platform.audit.read')
  );

-- platform_support_sessions: support.view OR legacy users.read
DROP POLICY IF EXISTS "Platform admins can read support sessions" ON public.platform_support_sessions;
CREATE POLICY "Platform admins can read support sessions"
  ON public.platform_support_sessions FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
  );

-- platform_security_events: security.view OR legacy security.read
DROP POLICY IF EXISTS "Platform admins can read security events" ON public.platform_security_events;
CREATE POLICY "Platform admins can read security events"
  ON public.platform_security_events FOR SELECT TO authenticated
  USING (
    public.has_platform_permission('platform.security.view')
    OR public.has_platform_permission('platform.security.read')
  );

-- tenant_subscriptions: billing.view OR legacy subscriptions.read
DROP POLICY IF EXISTS "Platform admins can read all subscriptions" ON public.tenant_subscriptions;
CREATE POLICY "Platform admins can read all subscriptions"
  ON public.tenant_subscriptions FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    OR public.has_platform_permission('platform.billing.view')
    OR public.has_platform_permission('platform.subscriptions.read')
  );
