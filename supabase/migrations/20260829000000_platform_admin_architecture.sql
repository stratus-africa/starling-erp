-- =========================================================
-- Platform Administration Architecture
-- NimbusERP — Super Admin Foundation
--
-- Design principles:
--   1. Platform admin authority lives in a SEPARATE table
--      (platform_admins) that is never writable by tenant users.
--      A super_admin role entry in user_roles is NOT sufficient
--      on its own — both must be present.
--
--   2. platform_audit_log is append-only enforced by a trigger
--      that blocks UPDATE and DELETE, even by service_role.
--
--   3. Support sessions (controlled impersonation) record who
--      authorised the session, which tenant was accessed, and
--      are time-bounded.  switch_tenant() is still used for the
--      actual context switch, but every use is now audited here.
--
--   4. No existing tables, RLS policies, or permissions are
--      removed or weakened.  All additions are additive.
--
--   5. Plans / subscriptions give each tenant a hard entitlement
--      record so feature gating can be plan-driven, not just
--      manually toggled.
--
-- Tables created:
--   platform_roles             — named platform roles (superadmin, support, billing)
--   platform_permissions       — named platform permission codes
--   platform_role_permissions  — role → permission mapping
--   platform_admins            — authoritative list of platform administrators
--   platform_audit_log         — append-only cross-tenant audit trail
--   plans                      — subscription plan catalogue
--   plan_features              — features included in each plan
--   tenant_subscriptions       — active plan assignment per tenant
--   platform_support_sessions  — controlled tenant impersonation sessions
--   platform_security_events   — auth anomalies & security signals
--
-- Functions created:
--   is_platform_admin()
--   has_platform_permission(code)
--   platform_audit(action, target_type, target_id, detail)
--   begin_support_session(tenant_id, reason, ttl_minutes)
--   end_support_session(session_id)
--   get_active_support_session()
--   admin_create_tenant(name, slug, plan_id)
--   admin_set_tenant_status(tenant_id, new_status, reason)
--   admin_set_tenant_plan(tenant_id, plan_id)
--   admin_set_feature_flag(tenant_id, feature, enabled)
-- =========================================================

-- ─────────────────────────────────────────────────────────
-- 0.  Ensure update_updated_at() exists (it should, but guard)
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

-- ─────────────────────────────────────────────────────────
-- 1.  PLATFORM ROLES
--     Named roles that exist only at the platform layer.
--     These are separate from the tenant app_role enum.
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_roles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL UNIQUE,  -- 'super_admin', 'support', 'billing', 'readonly'
  description text,
  is_system   boolean     NOT NULL DEFAULT false, -- system roles cannot be deleted
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_roles (name, description, is_system) VALUES
  ('super_admin', 'Full platform access. Can manage tenants, plans, features, and other admins.', true),
  ('support',     'Read tenant data and open support sessions. Cannot modify plans or billing.', true),
  ('billing',     'Manage plans and subscriptions. Cannot impersonate tenants.', true),
  ('readonly',    'Read-only view of platform data for auditors.', true)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.platform_roles ENABLE ROW LEVEL SECURITY;
-- Only platform admins can read platform roles
DROP POLICY IF EXISTS "Platform admins can read roles" ON public.platform_roles;
CREATE POLICY "Platform admins can read roles"
  ON public.platform_roles FOR SELECT TO authenticated
  USING (public.is_platform_admin());

GRANT SELECT ON public.platform_roles TO authenticated;
GRANT ALL ON public.platform_roles TO service_role;

-- ─────────────────────────────────────────────────────────
-- 2.  PLATFORM PERMISSIONS
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_permissions (
  code        text        PRIMARY KEY,  -- e.g. 'platform.tenants.read'
  module      text        NOT NULL,
  action      text        NOT NULL,
  description text
);

INSERT INTO public.platform_permissions (code, module, action, description) VALUES
  -- Tenant management
  ('platform.tenants.read',           'tenants',       'read',         'View all tenants'),
  ('platform.tenants.create',         'tenants',       'create',       'Create new tenants'),
  ('platform.tenants.update',         'tenants',       'update',       'Edit tenant metadata'),
  ('platform.tenants.suspend',        'tenants',       'suspend',      'Suspend a tenant'),
  ('platform.tenants.delete',         'tenants',       'delete',       'Hard-delete a tenant'),
  -- User management
  ('platform.users.read',             'users',         'read',         'View all users across tenants'),
  ('platform.users.impersonate',      'users',         'impersonate',  'Open support session inside a tenant'),
  ('platform.users.set_roles',        'users',         'set_roles',    'Assign tenant roles to users'),
  -- Plans & billing
  ('platform.plans.read',             'plans',         'read',         'View plan catalogue'),
  ('platform.plans.create',           'plans',         'create',       'Create new plans'),
  ('platform.plans.update',           'plans',         'update',       'Edit plans'),
  ('platform.plans.delete',           'plans',         'delete',       'Delete plans'),
  ('platform.subscriptions.read',     'subscriptions', 'read',         'View tenant subscriptions'),
  ('platform.subscriptions.assign',   'subscriptions', 'assign',       'Assign a plan to a tenant'),
  -- Feature flags
  ('platform.features.manage',        'features',      'manage',       'Enable / disable features per tenant'),
  -- Audit
  ('platform.audit.read',             'audit',         'read',         'Read platform audit logs'),
  -- Admin management
  ('platform.admins.read',            'admins',        'read',         'View platform admin list'),
  ('platform.admins.manage',          'admins',        'manage',       'Add / remove platform admins'),
  -- Security
  ('platform.security.read',          'security',      'read',         'View security events'),
  ('platform.security.manage',        'security',      'manage',       'Manage security policies')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.platform_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Platform admins can read platform permissions" ON public.platform_permissions;
CREATE POLICY "Platform admins can read platform permissions"
  ON public.platform_permissions FOR SELECT TO authenticated
  USING (public.is_platform_admin());

GRANT SELECT ON public.platform_permissions TO authenticated;
GRANT ALL ON public.platform_permissions TO service_role;

-- ─────────────────────────────────────────────────────────
-- 3.  PLATFORM ROLE → PERMISSION MAPPING
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_role_permissions (
  role_name       text NOT NULL REFERENCES public.platform_roles(name) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES public.platform_permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_name, permission_code)
);

-- super_admin gets everything
INSERT INTO public.platform_role_permissions (role_name, permission_code)
SELECT 'super_admin', code FROM public.platform_permissions
ON CONFLICT DO NOTHING;

-- support: read tenants/users + impersonate + read audit/security
INSERT INTO public.platform_role_permissions (role_name, permission_code) VALUES
  ('support', 'platform.tenants.read'),
  ('support', 'platform.users.read'),
  ('support', 'platform.users.impersonate'),
  ('support', 'platform.audit.read'),
  ('support', 'platform.security.read'),
  ('support', 'platform.subscriptions.read'),
  ('support', 'platform.plans.read')
ON CONFLICT DO NOTHING;

-- billing: plans + subscriptions + read tenants
INSERT INTO public.platform_role_permissions (role_name, permission_code) VALUES
  ('billing', 'platform.tenants.read'),
  ('billing', 'platform.plans.read'),
  ('billing', 'platform.plans.create'),
  ('billing', 'platform.plans.update'),
  ('billing', 'platform.plans.delete'),
  ('billing', 'platform.subscriptions.read'),
  ('billing', 'platform.subscriptions.assign'),
  ('billing', 'platform.features.manage'),
  ('billing', 'platform.audit.read')
ON CONFLICT DO NOTHING;

-- readonly: read everything, write nothing
INSERT INTO public.platform_role_permissions (role_name, permission_code) VALUES
  ('readonly', 'platform.tenants.read'),
  ('readonly', 'platform.users.read'),
  ('readonly', 'platform.plans.read'),
  ('readonly', 'platform.subscriptions.read'),
  ('readonly', 'platform.audit.read'),
  ('readonly', 'platform.security.read'),
  ('readonly', 'platform.admins.read')
ON CONFLICT DO NOTHING;

ALTER TABLE public.platform_role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Platform admins can read role permissions" ON public.platform_role_permissions;
CREATE POLICY "Platform admins can read role permissions"
  ON public.platform_role_permissions FOR SELECT TO authenticated
  USING (public.is_platform_admin());

GRANT SELECT ON public.platform_role_permissions TO authenticated;
GRANT ALL ON public.platform_role_permissions TO service_role;

-- ─────────────────────────────────────────────────────────
-- 4.  PLATFORM ADMINS
--     Authoritative table of who has platform-level access.
--     A row here is REQUIRED (in addition to user_roles.super_admin)
--     for the is_platform_admin() check to pass.
--     Tenant users can NEVER write to this table.
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  platform_role   text        NOT NULL DEFAULT 'super_admin'
                              REFERENCES public.platform_roles(name),
  email           text        NOT NULL,       -- snapshot; never trust this for auth
  full_name       text,
  is_active       boolean     NOT NULL DEFAULT true,
  notes           text,                       -- why this person has platform access
  granted_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at      timestamptz NOT NULL DEFAULT now(),
  revoked_at      timestamptz,
  last_seen_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_admins_active_idx
  ON public.platform_admins(user_id) WHERE is_active = true AND revoked_at IS NULL;

CREATE TRIGGER trg_platform_admins_updated
  BEFORE UPDATE ON public.platform_admins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Only active platform admins can see the admin list.
-- No tenant user can read this table.
DROP POLICY IF EXISTS "Active platform admins can read admin list" ON public.platform_admins;
CREATE POLICY "Active platform admins can read admin list"
  ON public.platform_admins FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- Only super_admin platform role can modify the admin list (enforced in the function layer).
-- Direct INSERT/UPDATE/DELETE from application code is blocked.
-- All mutations must go through admin_grant_platform_access() / admin_revoke_platform_access().
DROP POLICY IF EXISTS "No direct writes to platform_admins" ON public.platform_admins;
CREATE POLICY "No direct writes to platform_admins"
  ON public.platform_admins FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;

-- ─────────────────────────────────────────────────────────
-- 5.  CORE PLATFORM FUNCTIONS
-- ─────────────────────────────────────────────────────────

-- 5a.  is_platform_admin()
--      The authoritative server-side check.
--      Returns true only when BOTH conditions are met:
--        a) user_roles row with role = 'super_admin' exists
--        b) platform_admins row with is_active=true and no revocation exists
--      This dual-check means removing either record revokes access.

CREATE OR REPLACE FUNCTION public.is_platform_admin(
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
    FROM   public.user_roles ur
    JOIN   public.platform_admins pa ON pa.user_id = ur.user_id
    WHERE  ur.user_id  = COALESCE(_user_id, auth.uid())
      AND  ur.role     = 'super_admin'
      AND  pa.is_active = true
      AND  pa.revoked_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO service_role;

-- 5b.  has_platform_permission(code)
--      Granular check used inside RPCs to authorise specific actions.

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
    WHERE  pa.user_id     = COALESCE(_user_id, auth.uid())
      AND  pa.is_active   = true
      AND  pa.revoked_at  IS NULL
      AND  prp.permission_code = _code
  );
$$;

REVOKE ALL ON FUNCTION public.has_platform_permission(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_platform_permission(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_platform_permission(text, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────
-- 6.  PLATFORM AUDIT LOG  (append-only)
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_audit_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Actor
  actor_id        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email     text        NOT NULL,
  actor_role      text,                           -- snapshot of platform_role at time of action
  -- Context
  action          text        NOT NULL,           -- e.g. 'tenant.suspend', 'support.session.begin'
  target_type     text,                           -- e.g. 'tenant', 'user', 'plan'
  target_id       uuid,
  target_label    text,                           -- human-readable snapshot (tenant name, email, etc.)
  -- Impersonation context
  acting_as_tenant_id   uuid  REFERENCES public.tenants(id) ON DELETE SET NULL,
  support_session_id    uuid,                     -- FK added after platform_support_sessions created
  -- Payload
  detail          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ip_address      inet,
  user_agent      text,
  -- Immutability
  created_at      timestamptz NOT NULL DEFAULT now()
  -- NOTE: intentionally no updated_at — rows must never change
);

CREATE INDEX IF NOT EXISTS platform_audit_log_actor_idx
  ON public.platform_audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_log_target_idx
  ON public.platform_audit_log(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_log_tenant_idx
  ON public.platform_audit_log(acting_as_tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_log_action_idx
  ON public.platform_audit_log(action, created_at DESC);

-- ── Append-only enforcement ──────────────────────────────
-- Block UPDATE and DELETE on audit log rows unconditionally.
-- Even service_role is blocked at the trigger level.
CREATE OR REPLACE FUNCTION public.platform_audit_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'platform_audit_log rows are immutable. Action % is not permitted.',
    TG_OP
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_audit_immutable ON public.platform_audit_log;
CREATE TRIGGER trg_platform_audit_immutable
  BEFORE UPDATE OR DELETE ON public.platform_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.platform_audit_log_immutable();

ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can read audit log" ON public.platform_audit_log;
CREATE POLICY "Platform admins can read audit log"
  ON public.platform_audit_log FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- Only the internal write function may insert (via service_role or SECURITY DEFINER).
-- No authenticated user can INSERT directly.
DROP POLICY IF EXISTS "No direct inserts to platform audit log" ON public.platform_audit_log;
CREATE POLICY "No direct inserts to platform audit log"
  ON public.platform_audit_log FOR INSERT TO authenticated
  WITH CHECK (false);

GRANT SELECT ON public.platform_audit_log TO authenticated;
GRANT ALL ON public.platform_audit_log TO service_role;

-- ── platform_audit() — the ONLY write path ──────────────
CREATE OR REPLACE FUNCTION public.platform_audit(
  _action       text,
  _target_type  text    DEFAULT NULL,
  _target_id    uuid    DEFAULT NULL,
  _target_label text    DEFAULT NULL,
  _detail       jsonb   DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id         uuid;
  v_email      text;
  v_role       text;
  v_session_id uuid;
  v_tenant_id  uuid;
  v_ip         inet;
  v_ua         text;
  v_headers    jsonb;
BEGIN
  -- Resolve actor details
  SELECT pa.email, pa.platform_role
  INTO   v_email, v_role
  FROM   public.platform_admins pa
  WHERE  pa.user_id = auth.uid();

  IF v_email IS NULL THEN
    -- Fallback for service_role calls
    SELECT email INTO v_email FROM public.profiles WHERE id = auth.uid();
    v_email := COALESCE(v_email, auth.jwt()->>'email', 'system');
  END IF;

  -- Active support session context
  SELECT ps.id, ps.target_tenant_id
  INTO   v_session_id, v_tenant_id
  FROM   public.platform_support_sessions ps
  WHERE  ps.admin_id   = auth.uid()
    AND  ps.status     = 'active'
    AND  ps.expires_at > now()
  LIMIT 1;

  -- Request metadata
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    v_ip := NULLIF(COALESCE(
      v_headers->>'x-forwarded-for',
      v_headers->>'cf-connecting-ip',
      v_headers->>'x-real-ip'
    ), '')::inet;
    v_ua := NULLIF(v_headers->>'user-agent', '');
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL; v_ua := NULL;
  END;

  INSERT INTO public.platform_audit_log (
    actor_id, actor_email, actor_role,
    action, target_type, target_id, target_label,
    acting_as_tenant_id, support_session_id,
    detail, ip_address, user_agent
  ) VALUES (
    auth.uid(), v_email, v_role,
    _action, _target_type, _target_id, _target_label,
    v_tenant_id, v_session_id,
    COALESCE(_detail, '{}'::jsonb), v_ip, v_ua
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_audit(text, text, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_audit(text, text, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_audit(text, text, uuid, text, jsonb) TO service_role;

-- ─────────────────────────────────────────────────────────
-- 7.  PLANS
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plans (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL UNIQUE,        -- 'Starter', 'Growth', 'Enterprise'
  code          text        NOT NULL UNIQUE,        -- 'starter', 'growth', 'enterprise'
  description   text,
  price_usd     numeric(10,2) NOT NULL DEFAULT 0,   -- monthly price
  max_users     integer,                            -- NULL = unlimited
  max_storage_gb integer,
  is_public     boolean     NOT NULL DEFAULT true,  -- visible on pricing page
  is_active     boolean     NOT NULL DEFAULT true,
  sort_order    integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_plans_updated
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Seed default plans
INSERT INTO public.plans (name, code, description, price_usd, max_users, max_storage_gb, sort_order) VALUES
  ('Starter',    'starter',    'For small teams getting started',              29,   5,   5,   10),
  ('Growth',     'growth',     'For growing businesses that need more power',  99,   25,  50,  20),
  ('Enterprise', 'enterprise', 'Unlimited scale with dedicated support',       299,  NULL,500, 30)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read active public plans (for signup/upgrade flows)
DROP POLICY IF EXISTS "Authenticated users can read active public plans" ON public.plans;
CREATE POLICY "Authenticated users can read active public plans"
  ON public.plans FOR SELECT TO authenticated
  USING (is_active = true AND is_public = true);

-- Platform admins can read all plans including inactive/private
DROP POLICY IF EXISTS "Platform admins can read all plans" ON public.plans;
CREATE POLICY "Platform admins can read all plans"
  ON public.plans FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- Only service_role or platform RPCs may write plans
GRANT SELECT ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;

-- ─────────────────────────────────────────────────────────
-- 8.  PLAN FEATURES
--     Which tenant_features flags are included in each plan.
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plan_features (
  plan_id     uuid    NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  feature     text    NOT NULL
              CONSTRAINT plan_features_feature_check CHECK (feature IN (
                'multi_location','manufacturing','pos','advanced_inventory',
                'banking','payroll','crm','advanced_reports'
              )),
  PRIMARY KEY (plan_id, feature)
);

-- Seed plan features
INSERT INTO public.plan_features (plan_id, feature)
SELECT p.id, f.feature
FROM public.plans p
CROSS JOIN (VALUES ('crm'),('banking')) AS f(feature)
WHERE p.code = 'starter'
ON CONFLICT DO NOTHING;

INSERT INTO public.plan_features (plan_id, feature)
SELECT p.id, f.feature
FROM public.plans p
CROSS JOIN (VALUES
  ('crm'),('banking'),('manufacturing'),('multi_location'),
  ('advanced_inventory'),('advanced_reports')
) AS f(feature)
WHERE p.code = 'growth'
ON CONFLICT DO NOTHING;

INSERT INTO public.plan_features (plan_id, feature)
SELECT p.id, f.feature
FROM public.plans p
CROSS JOIN (VALUES
  ('crm'),('banking'),('manufacturing'),('multi_location'),
  ('advanced_inventory'),('advanced_reports'),('pos'),('payroll')
) AS f(feature)
WHERE p.code = 'enterprise'
ON CONFLICT DO NOTHING;

ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read plan features" ON public.plan_features;
CREATE POLICY "Authenticated users can read plan features"
  ON public.plan_features FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON public.plan_features TO authenticated;
GRANT ALL ON public.plan_features TO service_role;

-- ─────────────────────────────────────────────────────────
-- 9.  TENANT SUBSCRIPTIONS
--     One active subscription per tenant.
--     Changing plans is done via admin_set_tenant_plan() which
--     closes the old subscription and opens a new one.
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id         uuid        NOT NULL REFERENCES public.plans(id),
  status          text        NOT NULL DEFAULT 'active'
                              CONSTRAINT sub_status_check
                              CHECK (status IN ('trial','active','past_due','cancelled','suspended')),
  trial_ends_at   timestamptz,
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end   timestamptz,
  cancelled_at    timestamptz,
  -- Billing identifiers (stripe, paddle, etc.)
  external_id     text,                           -- e.g. Stripe subscription ID
  external_meta   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- Overrides (can be set per-tenant by billing admins)
  override_max_users    integer,
  override_max_storage  integer,
  notes           text,
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_subscriptions_active_unique
  ON public.tenant_subscriptions(tenant_id)
  WHERE status IN ('trial','active');

CREATE INDEX IF NOT EXISTS tenant_subscriptions_tenant_idx
  ON public.tenant_subscriptions(tenant_id, status, created_at DESC);

CREATE TRIGGER trg_tenant_subscriptions_updated
  BEFORE UPDATE ON public.tenant_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;

-- Tenant admins can read their own subscription
DROP POLICY IF EXISTS "Tenant admins can read own subscription" ON public.tenant_subscriptions;
CREATE POLICY "Tenant admins can read own subscription"
  ON public.tenant_subscriptions FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- Platform admins can read all subscriptions
DROP POLICY IF EXISTS "Platform admins can read all subscriptions" ON public.tenant_subscriptions;
CREATE POLICY "Platform admins can read all subscriptions"
  ON public.tenant_subscriptions FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- No direct writes from application code
GRANT SELECT ON public.tenant_subscriptions TO authenticated;
GRANT ALL ON public.tenant_subscriptions TO service_role;

-- Seed subscriptions for existing tenants that don't have one (Growth plan)
INSERT INTO public.tenant_subscriptions (tenant_id, plan_id, status)
SELECT t.id, p.id, 'active'
FROM   public.tenants t
CROSS  JOIN public.plans p
WHERE  p.code = 'growth'
  AND  t.deleted_at IS NULL
  AND  NOT EXISTS (
         SELECT 1 FROM public.tenant_subscriptions ts WHERE ts.tenant_id = t.id
       )
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────
-- 10.  PLATFORM SUPPORT SESSIONS
--      Controlled impersonation. Every switch_tenant() call by a
--      platform admin should be tied to a support session so the
--      reason and duration are recorded.
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_support_sessions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_email       text        NOT NULL,
  target_tenant_id  uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_tenant_name text       NOT NULL,
  reason            text        NOT NULL,   -- required: must state why
  authorised_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  status            text        NOT NULL DEFAULT 'active'
                                CONSTRAINT session_status_check
                                CHECK (status IN ('active','ended','expired')),
  started_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '4 hours'),
  ended_at          timestamptz,
  ended_by          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  end_reason        text,
  -- Snapshot of tenant state at session start for audit comparison
  tenant_snapshot   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_sessions_admin_idx
  ON public.platform_support_sessions(admin_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS support_sessions_tenant_idx
  ON public.platform_support_sessions(target_tenant_id, started_at DESC);

CREATE TRIGGER trg_support_sessions_updated
  BEFORE UPDATE ON public.platform_support_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Wire FK from platform_audit_log to support sessions now that the table exists
ALTER TABLE public.platform_audit_log
  ADD CONSTRAINT IF NOT EXISTS platform_audit_log_session_fkey
  FOREIGN KEY (support_session_id) REFERENCES public.platform_support_sessions(id) ON DELETE SET NULL;

ALTER TABLE public.platform_support_sessions ENABLE ROW LEVEL SECURITY;

-- Platform admins can read all sessions
DROP POLICY IF EXISTS "Platform admins can read support sessions" ON public.platform_support_sessions;
CREATE POLICY "Platform admins can read support sessions"
  ON public.platform_support_sessions FOR SELECT TO authenticated
  USING (public.is_platform_admin());

GRANT SELECT ON public.platform_support_sessions TO authenticated;
GRANT ALL ON public.platform_support_sessions TO service_role;

-- ─────────────────────────────────────────────────────────
-- 11.  PLATFORM SECURITY EVENTS
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_security_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text        NOT NULL,   -- 'login_success','login_failure','mfa_bypass_attempt', etc.
  severity        text        NOT NULL DEFAULT 'info'
                              CONSTRAINT severity_check
                              CHECK (severity IN ('info','warning','error','critical')),
  actor_id        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email     text,
  tenant_id       uuid        REFERENCES public.tenants(id) ON DELETE SET NULL,
  detail          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ip_address      inet,
  user_agent      text,
  resolved        boolean     NOT NULL DEFAULT false,
  resolved_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at     timestamptz,
  resolution_note text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_events_type_time_idx
  ON public.platform_security_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_severity_idx
  ON public.platform_security_events(severity, resolved, created_at DESC)
  WHERE resolved = false;
CREATE INDEX IF NOT EXISTS security_events_tenant_idx
  ON public.platform_security_events(tenant_id, created_at DESC);

ALTER TABLE public.platform_security_events ENABLE ROW LEVEL SECURITY;

-- Only platform admins can read security events
DROP POLICY IF EXISTS "Platform admins can read security events" ON public.platform_security_events;
CREATE POLICY "Platform admins can read security events"
  ON public.platform_security_events FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- No direct application writes — only service_role / SECURITY DEFINER functions
GRANT SELECT ON public.platform_security_events TO authenticated;
GRANT ALL ON public.platform_security_events TO service_role;

-- ─────────────────────────────────────────────────────────
-- 12.  SUPPORT SESSION MANAGEMENT FUNCTIONS
-- ─────────────────────────────────────────────────────────

-- 12a.  begin_support_session()
--       Opens a timed, audited support session.
--       Calls switch_tenant() internally to change the admin's context.

CREATE OR REPLACE FUNCTION public.begin_support_session(
  _target_tenant_id uuid,
  _reason           text,
  _ttl_minutes      integer DEFAULT 240  -- 4 hours default, max 480
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session_id   uuid;
  v_tenant_name  text;
  v_admin_email  text;
  v_ttl          integer := LEAST(GREATEST(COALESCE(_ttl_minutes, 240), 15), 480);
BEGIN
  -- Must be a platform admin with impersonation permission
  IF NOT public.has_platform_permission('platform.users.impersonate') THEN
    RAISE EXCEPTION 'Not authorized: platform.users.impersonate' USING ERRCODE = '42501';
  END IF;

  IF _reason IS NULL OR trim(_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required to begin a support session';
  END IF;

  SELECT name INTO v_tenant_name FROM public.tenants
  WHERE id = _target_tenant_id AND deleted_at IS NULL;

  IF v_tenant_name IS NULL THEN
    RAISE EXCEPTION 'Tenant not found or has been deleted';
  END IF;

  SELECT pa.email INTO v_admin_email
  FROM public.platform_admins pa WHERE pa.user_id = auth.uid();

  -- End any existing active session for this admin
  UPDATE public.platform_support_sessions
  SET    status   = 'ended',
         ended_at  = now(),
         ended_by  = auth.uid(),
         end_reason = 'Superseded by new session'
  WHERE  admin_id  = auth.uid()
    AND  status    = 'active';

  INSERT INTO public.platform_support_sessions (
    admin_id, admin_email, target_tenant_id, target_tenant_name,
    reason, expires_at, tenant_snapshot
  ) VALUES (
    auth.uid(), v_admin_email, _target_tenant_id, v_tenant_name,
    trim(_reason),
    now() + (_ttl || ' minutes')::interval,
    (SELECT to_jsonb(t) FROM public.tenants t WHERE t.id = _target_tenant_id)
  ) RETURNING id INTO v_session_id;

  -- Perform the actual tenant context switch
  PERFORM public.switch_tenant(_target_tenant_id::text);

  -- Audit the session start
  PERFORM public.platform_audit(
    'support.session.begin',
    'tenant', _target_tenant_id, v_tenant_name,
    jsonb_build_object(
      'session_id',   v_session_id,
      'reason',       trim(_reason),
      'ttl_minutes',  v_ttl,
      'expires_at',   (now() + (_ttl || ' minutes')::interval)
    )
  );

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_support_session(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_support_session(uuid, text, integer) TO authenticated;

-- 12b.  end_support_session()

CREATE OR REPLACE FUNCTION public.end_support_session(
  _session_id uuid DEFAULT NULL,
  _reason     text DEFAULT 'Session ended by admin'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session public.platform_support_sessions;
  v_home_tenant_id uuid;
BEGIN
  -- Find the session (NULL = most recent active session for this admin)
  SELECT * INTO v_session
  FROM   public.platform_support_sessions
  WHERE  admin_id = auth.uid()
    AND  status   = 'active'
    AND  (id = _session_id OR _session_id IS NULL)
  ORDER  BY started_at DESC
  LIMIT  1;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'No active support session found';
  END IF;

  UPDATE public.platform_support_sessions
  SET    status     = 'ended',
         ended_at   = now(),
         ended_by   = auth.uid(),
         end_reason = _reason
  WHERE  id = v_session.id;

  -- Switch back to the admin's home tenant
  SELECT tenant_id INTO v_home_tenant_id
  FROM   public.profiles WHERE id = auth.uid();

  -- Only switch if currently in the impersonated tenant
  IF v_home_tenant_id IS DISTINCT FROM v_session.target_tenant_id THEN
    PERFORM public.switch_tenant(v_home_tenant_id::text);
  END IF;

  PERFORM public.platform_audit(
    'support.session.end',
    'tenant', v_session.target_tenant_id, v_session.target_tenant_name,
    jsonb_build_object('session_id', v_session.id, 'reason', _reason,
                       'duration_minutes',
                       EXTRACT(EPOCH FROM (now() - v_session.started_at)) / 60)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.end_support_session(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_support_session(uuid, text) TO authenticated;

-- 12c.  get_active_support_session()
--       Returns the current admin's active support session if any.

CREATE OR REPLACE FUNCTION public.get_active_support_session()
RETURNS TABLE (
  session_id         uuid,
  target_tenant_id   uuid,
  target_tenant_name text,
  reason             text,
  started_at         timestamptz,
  expires_at         timestamptz,
  minutes_remaining  numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    id,
    target_tenant_id,
    target_tenant_name,
    reason,
    started_at,
    expires_at,
    ROUND(EXTRACT(EPOCH FROM (expires_at - now())) / 60, 1) AS minutes_remaining
  FROM public.platform_support_sessions
  WHERE admin_id   = auth.uid()
    AND status     = 'active'
    AND expires_at > now()
  ORDER BY started_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_active_support_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_support_session() TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 13.  TENANT LIFECYCLE MANAGEMENT FUNCTIONS
-- ─────────────────────────────────────────────────────────

-- 13a.  admin_set_tenant_status()

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
  v_old_status text;
  v_tenant_name text;
BEGIN
  IF NOT public.has_platform_permission('platform.tenants.suspend') THEN
    RAISE EXCEPTION 'Not authorized: platform.tenants.suspend' USING ERRCODE = '42501';
  END IF;

  IF _new_status NOT IN ('active','suspended','cancelled','archived') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be active, suspended, cancelled, or archived', _new_status;
  END IF;

  SELECT name, status INTO v_tenant_name, v_old_status
  FROM public.tenants WHERE id = _tenant_id AND deleted_at IS NULL;

  IF v_tenant_name IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  UPDATE public.tenants SET status = _new_status WHERE id = _tenant_id;

  -- Suspend subscription if tenant is being suspended
  IF _new_status = 'suspended' THEN
    UPDATE public.tenant_subscriptions
    SET status = 'suspended'
    WHERE tenant_id = _tenant_id AND status IN ('active','trial');
  ELSIF _new_status = 'active' AND v_old_status = 'suspended' THEN
    UPDATE public.tenant_subscriptions
    SET status = 'active'
    WHERE tenant_id = _tenant_id AND status = 'suspended';
  END IF;

  PERFORM public.platform_audit(
    'tenant.' || _new_status,
    'tenant', _tenant_id, v_tenant_name,
    jsonb_build_object(
      'old_status', v_old_status,
      'new_status', _new_status,
      'reason',     _reason
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_tenant_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_tenant_status(uuid, text, text) TO authenticated;

-- 13b.  admin_set_tenant_plan()

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
  v_sub_id      uuid;
  v_plan_name   text;
  v_tenant_name text;
  v_old_plan    text;
BEGIN
  IF NOT public.has_platform_permission('platform.subscriptions.assign') THEN
    RAISE EXCEPTION 'Not authorized: platform.subscriptions.assign' USING ERRCODE = '42501';
  END IF;

  SELECT name INTO v_plan_name  FROM public.plans   WHERE id = _plan_id  AND is_active = true;
  SELECT name INTO v_tenant_name FROM public.tenants WHERE id = _tenant_id AND deleted_at IS NULL;

  IF v_plan_name   IS NULL THEN RAISE EXCEPTION 'Plan not found or inactive'; END IF;
  IF v_tenant_name IS NULL THEN RAISE EXCEPTION 'Tenant not found'; END IF;

  -- Retrieve old plan name for audit
  SELECT p.name INTO v_old_plan
  FROM public.tenant_subscriptions ts JOIN public.plans p ON p.id = ts.plan_id
  WHERE ts.tenant_id = _tenant_id AND ts.status IN ('active','trial')
  LIMIT 1;

  -- Cancel current active subscription
  UPDATE public.tenant_subscriptions
  SET    status       = 'cancelled',
         cancelled_at = now()
  WHERE  tenant_id = _tenant_id
    AND  status    IN ('active','trial');

  -- Create new subscription
  INSERT INTO public.tenant_subscriptions (
    tenant_id, plan_id, status, created_by, notes
  ) VALUES (
    _tenant_id, _plan_id, 'active', auth.uid(), _notes
  ) RETURNING id INTO v_sub_id;

  -- Sync tenant_features to match the new plan
  -- Remove features not in new plan, add features included in new plan
  DELETE FROM public.tenant_features
  WHERE tenant_id = _tenant_id
    AND feature NOT IN (SELECT feature FROM public.plan_features WHERE plan_id = _plan_id);

  INSERT INTO public.tenant_features (tenant_id, feature, enabled, source)
  SELECT _tenant_id, pf.feature, true, 'plan_sync'
  FROM   public.plan_features pf
  WHERE  pf.plan_id = _plan_id
  ON CONFLICT (tenant_id, feature) DO UPDATE SET enabled = true, source = 'plan_sync';

  PERFORM public.platform_audit(
    'tenant.plan.changed',
    'tenant', _tenant_id, v_tenant_name,
    jsonb_build_object(
      'old_plan', v_old_plan,
      'new_plan', v_plan_name,
      'subscription_id', v_sub_id,
      'notes', _notes
    )
  );

  RETURN v_sub_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_tenant_plan(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_tenant_plan(uuid, uuid, text) TO authenticated;

-- 13c.  admin_set_feature_flag()

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
DECLARE
  v_tenant_name text;
  v_old_enabled boolean;
BEGIN
  IF NOT public.has_platform_permission('platform.features.manage') THEN
    RAISE EXCEPTION 'Not authorized: platform.features.manage' USING ERRCODE = '42501';
  END IF;

  SELECT name INTO v_tenant_name FROM public.tenants
  WHERE id = _tenant_id AND deleted_at IS NULL;
  IF v_tenant_name IS NULL THEN RAISE EXCEPTION 'Tenant not found'; END IF;

  SELECT enabled INTO v_old_enabled FROM public.tenant_features
  WHERE tenant_id = _tenant_id AND feature = _feature;

  INSERT INTO public.tenant_features (tenant_id, feature, enabled, source)
  VALUES (_tenant_id, _feature, _enabled, 'admin_override')
  ON CONFLICT (tenant_id, feature) DO UPDATE
    SET enabled    = EXCLUDED.enabled,
        source     = 'admin_override',
        updated_at = now();

  PERFORM public.platform_audit(
    CASE WHEN _enabled THEN 'feature.enabled' ELSE 'feature.disabled' END,
    'tenant', _tenant_id, v_tenant_name,
    jsonb_build_object(
      'feature',     _feature,
      'old_enabled', v_old_enabled,
      'new_enabled', _enabled,
      'reason',      _reason
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_feature_flag(uuid, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_feature_flag(uuid, text, boolean, text) TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 14.  ADMIN SELF-MANAGEMENT FUNCTIONS
-- ─────────────────────────────────────────────────────────

-- 14a.  admin_grant_platform_access()
--       The ONLY way to add a row to platform_admins.
--       Requires the calling user to be an active platform super_admin.

CREATE OR REPLACE FUNCTION public.admin_grant_platform_access(
  _user_id      uuid,
  _platform_role text DEFAULT 'support',
  _notes        text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email     text;
  v_full_name text;
BEGIN
  -- Only platform super_admins can grant platform access
  IF NOT public.has_platform_permission('platform.admins.manage') THEN
    RAISE EXCEPTION 'Not authorized: platform.admins.manage' USING ERRCODE = '42501';
  END IF;

  -- Cannot grant super_admin role to yourself (prevents privilege escalation)
  IF _user_id = auth.uid() AND _platform_role = 'super_admin' THEN
    RAISE EXCEPTION 'Cannot grant super_admin to yourself';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.platform_roles WHERE name = _platform_role) THEN
    RAISE EXCEPTION 'Unknown platform role: %', _platform_role;
  END IF;

  SELECT p.email, p.full_name INTO v_email, v_full_name
  FROM public.profiles p WHERE p.id = _user_id;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'User not found in profiles';
  END IF;

  -- Ensure user_roles has super_admin (required for is_platform_admin() dual check)
  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (_user_id, NULL, 'super_admin')
  ON CONFLICT DO NOTHING;

  -- Upsert the platform_admins row
  INSERT INTO public.platform_admins (
    user_id, platform_role, email, full_name, is_active, notes, granted_by
  ) VALUES (
    _user_id, _platform_role, v_email, v_full_name, true, _notes, auth.uid()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    platform_role = EXCLUDED.platform_role,
    is_active     = true,
    revoked_at    = NULL,
    notes         = COALESCE(EXCLUDED.notes, platform_admins.notes),
    granted_by    = auth.uid(),
    updated_at    = now();

  PERFORM public.platform_audit(
    'admin.access.granted',
    'user', _user_id, v_email,
    jsonb_build_object('platform_role', _platform_role, 'notes', _notes)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_platform_access(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_grant_platform_access(uuid, text, text) TO authenticated;

-- 14b.  admin_revoke_platform_access()

CREATE OR REPLACE FUNCTION public.admin_revoke_platform_access(
  _user_id uuid,
  _reason  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text;
BEGIN
  IF NOT public.has_platform_permission('platform.admins.manage') THEN
    RAISE EXCEPTION 'Not authorized: platform.admins.manage' USING ERRCODE = '42501';
  END IF;

  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot revoke your own platform access';
  END IF;

  SELECT email INTO v_email FROM public.platform_admins WHERE user_id = _user_id;

  UPDATE public.platform_admins
  SET    is_active  = false,
         revoked_at = now()
  WHERE  user_id    = _user_id;

  -- Remove super_admin from user_roles
  DELETE FROM public.user_roles
  WHERE user_id = _user_id AND role = 'super_admin';

  -- Expire any active support sessions for this admin
  UPDATE public.platform_support_sessions
  SET    status     = 'ended',
         ended_at   = now(),
         ended_by   = auth.uid(),
         end_reason = 'Admin access revoked'
  WHERE  admin_id   = _user_id AND status = 'active';

  PERFORM public.platform_audit(
    'admin.access.revoked',
    'user', _user_id, v_email,
    jsonb_build_object('reason', _reason)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_platform_access(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revoke_platform_access(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 15.  CONVENIENCE QUERY FUNCTIONS FOR ADMIN UI
-- ─────────────────────────────────────────────────────────

-- 15a.  get_platform_audit_log() — paginated, filterable

CREATE OR REPLACE FUNCTION public.get_platform_audit_log(
  _limit       integer DEFAULT 100,
  _action      text    DEFAULT NULL,
  _target_type text    DEFAULT NULL,
  _target_id   uuid    DEFAULT NULL,
  _actor_id    uuid    DEFAULT NULL,
  _tenant_id   uuid    DEFAULT NULL,
  _from        timestamptz DEFAULT NULL,
  _to          timestamptz DEFAULT NULL
)
RETURNS SETOF public.platform_audit_log
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT *
  FROM   public.platform_audit_log
  WHERE  public.is_platform_admin()
    AND  (_action      IS NULL OR action      = _action)
    AND  (_target_type IS NULL OR target_type = _target_type)
    AND  (_target_id   IS NULL OR target_id   = _target_id)
    AND  (_actor_id    IS NULL OR actor_id    = _actor_id)
    AND  (_tenant_id   IS NULL OR acting_as_tenant_id = _tenant_id)
    AND  (_from        IS NULL OR created_at  >= _from)
    AND  (_to          IS NULL OR created_at  <= _to)
  ORDER  BY created_at DESC
  LIMIT  LEAST(GREATEST(COALESCE(_limit, 100), 1), 1000);
$$;

REVOKE ALL ON FUNCTION public.get_platform_audit_log(integer,text,text,uuid,uuid,uuid,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_audit_log(integer,text,text,uuid,uuid,uuid,timestamptz,timestamptz) TO authenticated;

-- 15b.  get_platform_dashboard_stats()

CREATE OR REPLACE FUNCTION public.get_platform_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'tenants', jsonb_build_object(
      'total',      (SELECT COUNT(*) FROM public.tenants WHERE deleted_at IS NULL),
      'active',     (SELECT COUNT(*) FROM public.tenants WHERE deleted_at IS NULL AND status = 'active'),
      'suspended',  (SELECT COUNT(*) FROM public.tenants WHERE deleted_at IS NULL AND status = 'suspended'),
      'new_30d',    (SELECT COUNT(*) FROM public.tenants WHERE deleted_at IS NULL AND created_at >= now() - interval '30 days')
    ),
    'users', jsonb_build_object(
      'total',      (SELECT COUNT(DISTINCT user_id) FROM public.user_roles WHERE role != 'super_admin'),
      'new_30d',    (SELECT COUNT(*) FROM public.profiles WHERE created_at >= now() - interval '30 days')
    ),
    'subscriptions', jsonb_build_object(
      'active',     (SELECT COUNT(*) FROM public.tenant_subscriptions WHERE status = 'active'),
      'trial',      (SELECT COUNT(*) FROM public.tenant_subscriptions WHERE status = 'trial'),
      'by_plan',    (
        SELECT jsonb_object_agg(p.name, cnt)
        FROM (
          SELECT pl.name, COUNT(*) AS cnt
          FROM public.tenant_subscriptions ts
          JOIN public.plans pl ON pl.id = ts.plan_id
          WHERE ts.status IN ('active','trial')
          GROUP BY pl.name
        ) p
      )
    ),
    'platform_admins', jsonb_build_object(
      'total',      (SELECT COUNT(*) FROM public.platform_admins WHERE is_active = true AND revoked_at IS NULL),
      'by_role',    (
        SELECT jsonb_object_agg(platform_role, cnt)
        FROM (
          SELECT platform_role, COUNT(*) AS cnt
          FROM public.platform_admins WHERE is_active = true GROUP BY platform_role
        ) r
      )
    ),
    'support_sessions', jsonb_build_object(
      'active',     (SELECT COUNT(*) FROM public.platform_support_sessions WHERE status = 'active' AND expires_at > now()),
      'today',      (SELECT COUNT(*) FROM public.platform_support_sessions WHERE started_at >= CURRENT_DATE)
    ),
    'security_events', jsonb_build_object(
      'unresolved_critical', (SELECT COUNT(*) FROM public.platform_security_events WHERE resolved = false AND severity = 'critical'),
      'unresolved_error',    (SELECT COUNT(*) FROM public.platform_security_events WHERE resolved = false AND severity = 'error')
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_platform_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_dashboard_stats() TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 16.  BOOTSTRAP: ensure the Stratus demo admin has a
--      platform_admins row so the existing user can log in.
--      Safe to run: uses ON CONFLICT DO NOTHING.
-- ─────────────────────────────────────────────────────────

INSERT INTO public.platform_admins (user_id, platform_role, email, full_name, is_active, notes)
SELECT
  p.id,
  'super_admin',
  p.email,
  p.full_name,
  true,
  'Bootstrapped from existing super_admin user_roles entry'
FROM public.profiles p
JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'super_admin'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = p.id
)
ON CONFLICT (user_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────
-- 17.  AUTO-EXPIRE SUPPORT SESSIONS
--      Scheduled by pg_cron if available; otherwise handled by
--      the application on each is_platform_admin() call.
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.expire_stale_support_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.platform_support_sessions
  SET    status    = 'expired',
         ended_at  = now(),
         end_reason = 'Auto-expired by TTL'
  WHERE  status    = 'active'
    AND  expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_support_sessions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_support_sessions() TO service_role;

-- ─────────────────────────────────────────────────────────
-- 18.  LAST-SEEN TRACKING for platform admins
--      Called automatically by the admin route on load.
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_ping()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RETURN false;
  END IF;

  -- Expire stale sessions on each ping
  PERFORM public.expire_stale_support_sessions();

  -- Update last seen
  UPDATE public.platform_admins
  SET last_seen_at = now()
  WHERE user_id = auth.uid();

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ping() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_ping() TO authenticated;
