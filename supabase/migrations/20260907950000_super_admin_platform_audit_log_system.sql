-- ==============================================================================
-- Super Admin Platform Audit Log System
-- File: supabase/migrations/20260907950000_super_admin_platform_audit_log_system.sql
-- ==============================================================================

-- 1. Enhance platform_audit_log schema with severity and indexes
DO $$
BEGIN
  -- Add severity column with check constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'platform_audit_log'
      AND column_name = 'severity'
  ) THEN
    ALTER TABLE public.platform_audit_log
      ADD COLUMN severity text NOT NULL DEFAULT 'info'
      CONSTRAINT platform_audit_severity_check
      CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical'));
  END IF;
END $$;

-- Temporarily bypass immutability trigger for backfill
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_platform_audit_immutable'
  ) THEN
    ALTER TABLE public.platform_audit_log DISABLE TRIGGER trg_platform_audit_immutable;
  END IF;

  -- Backfill severity for existing records based on action taxonomy
  UPDATE public.platform_audit_log
  SET severity = CASE
    WHEN action IN (
      'tenant.suspended', 'tenant.deleted', 'tenant.archived',
      'admin.access.revoked', 'support.session.revoke', 'subscription.cancelled',
      'feature_flag.deleted', 'platform.role.revoked', 'security.policy.updated'
    ) OR action ILIKE '%revoke%' OR action ILIKE '%delete%' OR action ILIKE '%suspend%' THEN 'critical'
    WHEN action IN (
      'admin.access.granted', 'support.session.begin', 'subscription.suspended',
      'subscription.plan_changed', 'tenant_user.deactivated', 'tenant_user.removed',
      'feature_flag.toggled', 'plan.deactivated'
    ) OR action ILIKE '%.begin' OR action ILIKE '%deactivate%' OR action ILIKE '%plan_changed%' THEN 'high'
    WHEN action IN (
      'tenant.active', 'tenant.created', 'subscription.extended',
      'subscription.reactivated', 'plan.created', 'plan.updated',
      'feature_flag.created', 'feature_flag.updated', 'tenant_user.role_changed',
      'tenant_user.invited', 'tenant_user.activated'
    ) OR action ILIKE '%create%' OR action ILIKE '%update%' OR action ILIKE '%activate%' THEN 'medium'
    WHEN action IN ('support.session.end', 'login', 'logout') THEN 'low'
    ELSE 'info'
  END
  WHERE severity = 'info' OR severity IS NULL;

  -- Re-enable immutability trigger
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_platform_audit_immutable'
  ) THEN
    ALTER TABLE public.platform_audit_log ENABLE TRIGGER trg_platform_audit_immutable;
  END IF;
END $$;

-- Indexes for lightning fast security queries
CREATE INDEX IF NOT EXISTS platform_audit_log_severity_idx
  ON public.platform_audit_log(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_log_action_idx
  ON public.platform_audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_log_created_at_idx
  ON public.platform_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_log_session_idx
  ON public.platform_audit_log(support_session_id, created_at DESC);


-- 2. Enhanced platform_audit() write function supporting severity
CREATE OR REPLACE FUNCTION public.platform_audit(
  _action       text,
  _target_type  text    DEFAULT NULL,
  _target_id    uuid    DEFAULT NULL,
  _target_label text    DEFAULT NULL,
  _detail       jsonb   DEFAULT '{}'::jsonb,
  _severity     text    DEFAULT NULL
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
  v_sev        text := _severity;
BEGIN
  -- Resolve actor information
  SELECT pa.email, pa.platform_role INTO v_email, v_role
  FROM   public.platform_admins pa WHERE pa.user_id = auth.uid();

  IF v_email IS NULL THEN
    SELECT email INTO v_email FROM public.profiles WHERE id = auth.uid();
    v_email := COALESCE(v_email, auth.jwt()->>'email', 'system');
  END IF;

  -- Look up active support session
  SELECT ps.id, ps.target_tenant_id INTO v_session_id, v_tenant_id
  FROM   public.platform_support_sessions ps
  WHERE  ps.admin_id  = auth.uid()
    AND  ps.status    = 'active'
    AND  ps.expires_at > now()
    AND  ps.is_revoked = false
  ORDER  BY ps.started_at DESC
  LIMIT 1;

  -- Parse network headers
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    v_ip := NULLIF(COALESCE(
      v_headers->>'x-forwarded-for',
      v_headers->>'cf-connecting-ip',
      v_headers->>'x-real-ip'), '')::inet;
    v_ua := NULLIF(v_headers->>'user-agent', '');
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL; v_ua := NULL;
  END;

  -- Automatic severity inference if not supplied
  IF v_sev IS NULL OR v_sev NOT IN ('info', 'low', 'medium', 'high', 'critical') THEN
    IF _action IN (
      'tenant.suspended', 'tenant.deleted', 'tenant.archived',
      'admin.access.revoked', 'support.session.revoke', 'subscription.cancelled',
      'feature_flag.deleted', 'platform.role.revoked', 'security.policy.updated'
    ) OR _action ILIKE '%revoke%' OR _action ILIKE '%delete%' OR _action ILIKE '%suspend%' THEN
      v_sev := 'critical';
    ELSIF _action IN (
      'admin.access.granted', 'support.session.begin', 'subscription.suspended',
      'subscription.plan_changed', 'tenant_user.deactivated', 'tenant_user.removed',
      'feature_flag.toggled', 'plan.deactivated'
    ) OR _action ILIKE '%.begin' OR _action ILIKE '%deactivate%' OR _action ILIKE '%plan_changed%' THEN
      v_sev := 'high';
    ELSIF _action IN (
      'tenant.active', 'tenant.created', 'subscription.extended',
      'subscription.reactivated', 'plan.created', 'plan.updated',
      'feature_flag.created', 'feature_flag.updated', 'tenant_user.role_changed',
      'tenant_user.invited', 'tenant_user.activated'
    ) OR _action ILIKE '%create%' OR _action ILIKE '%update%' OR _action ILIKE '%activate%' THEN
      v_sev := 'medium';
    ELSIF _action IN ('support.session.end', 'login', 'logout') THEN
      v_sev := 'low';
    ELSE
      v_sev := 'info';
    END IF;
  END IF;

  INSERT INTO public.platform_audit_log (
    actor_id, actor_email, actor_role,
    action, severity, target_type, target_id, target_label,
    acting_as_tenant_id, support_session_id,
    detail, ip_address, user_agent
  ) VALUES (
    auth.uid(), v_email, v_role,
    _action, v_sev, _target_type, _target_id, _target_label,
    v_tenant_id, v_session_id,
    COALESCE(_detail, '{}'::jsonb), v_ip, v_ua
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_audit(text,text,uuid,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_audit(text,text,uuid,text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_audit(text,text,uuid,text,jsonb,text) TO service_role;


-- 3. RPC: admin_list_platform_audit_logs (Filtered & Paginated Audit Records)
CREATE OR REPLACE FUNCTION public.admin_list_platform_audit_logs(
  _search        text        DEFAULT NULL,
  _action        text        DEFAULT NULL,
  _actor_email   text        DEFAULT NULL,
  _tenant_id     uuid        DEFAULT NULL,
  _severity      text        DEFAULT NULL,
  _from          timestamptz DEFAULT NULL,
  _to            timestamptz DEFAULT NULL,
  _limit         integer     DEFAULT 50,
  _offset        integer     DEFAULT 0
)
RETURNS TABLE (
  id                  uuid,
  actor_id            uuid,
  actor_email         text,
  actor_role          text,
  action              text,
  severity            text,
  target_type         text,
  target_id           uuid,
  target_label        text,
  acting_as_tenant_id uuid,
  tenant_name         text,
  support_session_id  uuid,
  detail              jsonb,
  ip_address          inet,
  user_agent          text,
  created_at          timestamptz,
  total_count         bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
BEGIN
  -- Strict Authorization check
  IF NOT (
    public.has_platform_permission('platform.audit.view')
    OR public.has_platform_permission('platform.security.view')
    OR public.has_platform_permission('platform.audit.read')
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = v_caller_id
        AND pa.platform_role = 'super_admin'
        AND pa.is_active = true
        AND pa.revoked_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized: platform.audit.view' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      pal.id,
      pal.actor_id,
      pal.actor_email,
      pal.actor_role,
      pal.action,
      pal.severity,
      pal.target_type,
      pal.target_id,
      pal.target_label,
      pal.acting_as_tenant_id,
      t.name AS tenant_name,
      pal.support_session_id,
      pal.detail,
      pal.ip_address,
      pal.user_agent,
      pal.created_at
    FROM public.platform_audit_log pal
    LEFT JOIN public.tenants t ON t.id = pal.acting_as_tenant_id
    WHERE
      (_action IS NULL OR _action = 'all' OR pal.action = _action)
      AND (_actor_email IS NULL OR _actor_email = 'all' OR pal.actor_email ILIKE '%' || trim(_actor_email) || '%')
      AND (_tenant_id IS NULL OR pal.acting_as_tenant_id = _tenant_id)
      AND (_severity IS NULL OR _severity = 'all' OR pal.severity = _severity)
      AND (_from IS NULL OR pal.created_at >= _from)
      AND (_to IS NULL OR pal.created_at <= _to)
      AND (
        _search IS NULL
        OR trim(_search) = ''
        OR pal.action ILIKE '%' || trim(_search) || '%'
        OR pal.actor_email ILIKE '%' || trim(_search) || '%'
        OR COALESCE(pal.target_label, '') ILIKE '%' || trim(_search) || '%'
        OR COALESCE(pal.target_type, '') ILIKE '%' || trim(_search) || '%'
        OR COALESCE(t.name, '') ILIKE '%' || trim(_search) || '%'
        OR pal.detail::text ILIKE '%' || trim(_search) || '%'
      )
  ),
  total AS (
    SELECT COUNT(*) AS cnt FROM filtered
  )
  SELECT
    f.*,
    t.cnt AS total_count
  FROM filtered f
  CROSS JOIN total t
  ORDER BY f.created_at DESC
  LIMIT LEAST(COALESCE(_limit, 50), 200)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_platform_audit_logs(text, text, text, uuid, text, timestamptz, timestamptz, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_platform_audit_logs(text, text, text, uuid, text, timestamptz, timestamptz, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_platform_audit_logs(text, text, text, uuid, text, timestamptz, timestamptz, integer, integer) TO service_role;


-- 4. RPC: admin_get_platform_audit_stats (KPI Metrics for Security Dashboard)
CREATE OR REPLACE FUNCTION public.admin_get_platform_audit_stats()
RETURNS TABLE (
  total_events      bigint,
  events_24h        bigint,
  critical_events   bigint,
  high_events       bigint,
  active_admins_24h bigint,
  support_sessions  bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
BEGIN
  IF NOT (
    public.has_platform_permission('platform.audit.view')
    OR public.has_platform_permission('platform.security.view')
    OR public.has_platform_permission('platform.audit.read')
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = v_caller_id
        AND pa.platform_role = 'super_admin'
        AND pa.is_active = true
        AND pa.revoked_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized: platform.audit.view' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*) AS total_events,
    COUNT(*) FILTER (WHERE created_at >= (now() - interval '24 hours')) AS events_24h,
    COUNT(*) FILTER (WHERE severity = 'critical') AS critical_events,
    COUNT(*) FILTER (WHERE severity = 'high') AS high_events,
    COUNT(DISTINCT actor_id) FILTER (WHERE created_at >= (now() - interval '24 hours')) AS active_admins_24h,
    COUNT(DISTINCT support_session_id) FILTER (WHERE support_session_id IS NOT NULL) AS support_sessions
  FROM public.platform_audit_log;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_platform_audit_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_platform_audit_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_platform_audit_stats() TO service_role;
