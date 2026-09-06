-- ==============================================================================
-- Secure Super Admin Support Sessions & Tenant Impersonation System
-- File: supabase/migrations/20260907900000_secure_support_sessions_and_impersonation.sql
-- ==============================================================================

-- 1. Enhance platform_support_sessions table schema
DO $$
BEGIN
  -- Expand status check constraint to include 'revoked'
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'session_status_check'
      AND conrelid = 'public.platform_support_sessions'::regclass
  ) THEN
    ALTER TABLE public.platform_support_sessions DROP CONSTRAINT session_status_check;
  END IF;

  ALTER TABLE public.platform_support_sessions
    ADD CONSTRAINT session_status_check
    CHECK (status IN ('active', 'ended', 'expired', 'revoked'));

  -- Add target impersonated user fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_support_sessions' AND column_name = 'target_user_id'
  ) THEN
    ALTER TABLE public.platform_support_sessions
      ADD COLUMN target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_support_sessions' AND column_name = 'target_user_email'
  ) THEN
    ALTER TABLE public.platform_support_sessions
      ADD COLUMN target_user_email text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_support_sessions' AND column_name = 'target_user_name'
  ) THEN
    ALTER TABLE public.platform_support_sessions
      ADD COLUMN target_user_name text;
  END IF;

  -- Add security and network metadata
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_support_sessions' AND column_name = 'client_ip'
  ) THEN
    ALTER TABLE public.platform_support_sessions
      ADD COLUMN client_ip text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_support_sessions' AND column_name = 'user_agent'
  ) THEN
    ALTER TABLE public.platform_support_sessions
      ADD COLUMN user_agent text;
  END IF;

  -- Add revocation tracking
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_support_sessions' AND column_name = 'is_revoked'
  ) THEN
    ALTER TABLE public.platform_support_sessions
      ADD COLUMN is_revoked boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_support_sessions' AND column_name = 'revoked_at'
  ) THEN
    ALTER TABLE public.platform_support_sessions
      ADD COLUMN revoked_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_support_sessions' AND column_name = 'revoked_by'
  ) THEN
    ALTER TABLE public.platform_support_sessions
      ADD COLUMN revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_support_sessions' AND column_name = 'revocation_reason'
  ) THEN
    ALTER TABLE public.platform_support_sessions
      ADD COLUMN revocation_reason text;
  END IF;
END $$;

-- 2. Indexes for fast session queries
CREATE INDEX IF NOT EXISTS support_sessions_target_user_idx
  ON public.platform_support_sessions(target_user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS support_sessions_status_expires_idx
  ON public.platform_support_sessions(status, expires_at);
CREATE INDEX IF NOT EXISTS support_sessions_started_at_idx
  ON public.platform_support_sessions(started_at DESC);


-- 3. DROP old function overloads to prevent ambiguity
DROP FUNCTION IF EXISTS public.begin_support_session(uuid, text, integer);
DROP FUNCTION IF EXISTS public.begin_support_session(uuid, text, integer, uuid, text, text);
DROP FUNCTION IF EXISTS public.get_active_support_session();


-- 4. RPC: begin_support_session
CREATE OR REPLACE FUNCTION public.begin_support_session(
  _target_tenant_id uuid,
  _reason           text,
  _ttl_minutes      integer DEFAULT 240,
  _target_user_id   uuid DEFAULT NULL,
  _client_ip        text DEFAULT NULL,
  _user_agent       text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id         uuid := auth.uid();
  v_tenant_name       text;
  v_admin_email       text;
  v_target_user_email text;
  v_target_user_name  text;
  v_ttl               integer;
  v_session_id        uuid;
  v_client_ip         text := _client_ip;
  v_user_agent        text := _user_agent;
  v_headers           jsonb;
BEGIN
  -- Strict Authorization check
  IF NOT (
    public.has_platform_permission('platform.support.impersonate')
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = v_caller_id
        AND pa.platform_role = 'super_admin'
        AND pa.is_active = true
        AND pa.revoked_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized: platform.support.impersonate' USING ERRCODE = '42501';
  END IF;

  -- Reason Validation
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'A descriptive reason (at least 5 characters) is required to begin a support session';
  END IF;

  -- Target Tenant Validation
  SELECT name INTO v_tenant_name
  FROM public.tenants
  WHERE id = _target_tenant_id AND deleted_at IS NULL;

  IF v_tenant_name IS NULL THEN
    RAISE EXCEPTION 'Target tenant does not exist or has been deleted';
  END IF;

  -- Target User Validation (if specified)
  IF _target_user_id IS NOT NULL THEN
    SELECT email, full_name INTO v_target_user_email, v_target_user_name
    FROM public.profiles
    WHERE id = _target_user_id
      AND (
        tenant_id = _target_tenant_id
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = _target_user_id AND ur.tenant_id = _target_tenant_id
        )
      );

    IF v_target_user_email IS NULL THEN
      -- Also check auth.users directly if profile is minimal
      SELECT email INTO v_target_user_email
      FROM auth.users au
      WHERE au.id = _target_user_id
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = _target_user_id AND (p.tenant_id = _target_tenant_id)
        );

      IF v_target_user_email IS NULL THEN
        RAISE EXCEPTION 'Selected target user does not belong to the target tenant';
      END IF;
    END IF;
  END IF;

  -- Admin Email lookup
  SELECT email INTO v_admin_email
  FROM public.platform_admins
  WHERE user_id = v_caller_id;

  IF v_admin_email IS NULL THEN
    SELECT email INTO v_admin_email FROM auth.users WHERE id = v_caller_id;
  END IF;

  -- Extract client network metadata if not passed
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    IF v_client_ip IS NULL THEN
      v_client_ip := NULLIF(COALESCE(
        v_headers->>'x-forwarded-for',
        v_headers->>'cf-connecting-ip',
        v_headers->>'x-real-ip'
      ), '');
    END IF;
    IF v_user_agent IS NULL THEN
      v_user_agent := NULLIF(v_headers->>'user-agent', '');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Constrain TTL between 5 minutes and 8 hours (480 min)
  v_ttl := LEAST(GREATEST(COALESCE(_ttl_minutes, 240), 5), 480);

  -- Gracefully close any existing active session for this admin
  UPDATE public.platform_support_sessions
  SET status = 'ended',
      ended_at = now(),
      ended_by = v_caller_id,
      end_reason = 'Superseded by new session'
  WHERE admin_id = v_caller_id AND status = 'active';

  -- Create the support session record
  INSERT INTO public.platform_support_sessions (
    admin_id,
    admin_email,
    target_tenant_id,
    target_tenant_name,
    target_user_id,
    target_user_email,
    target_user_name,
    reason,
    started_at,
    expires_at,
    status,
    client_ip,
    user_agent,
    tenant_snapshot
  ) VALUES (
    v_caller_id,
    COALESCE(v_admin_email, 'unknown-admin'),
    _target_tenant_id,
    v_tenant_name,
    _target_user_id,
    v_target_user_email,
    v_target_user_name,
    trim(_reason),
    now(),
    now() + (v_ttl || ' minutes')::interval,
    'active',
    v_client_ip,
    v_user_agent,
    (SELECT to_jsonb(t) FROM public.tenants t WHERE t.id = _target_tenant_id)
  ) RETURNING id INTO v_session_id;

  -- Switch context to target tenant
  PERFORM public.switch_tenant(_target_tenant_id::text);

  -- Mandatory platform audit trail entry
  PERFORM public.platform_audit(
    'support.session.begin',
    'tenant',
    _target_tenant_id,
    v_tenant_name,
    jsonb_build_object(
      'session_id', v_session_id,
      'target_user_id', _target_user_id,
      'target_user_email', v_target_user_email,
      'target_user_name', v_target_user_name,
      'reason', trim(_reason),
      'ttl_minutes', v_ttl,
      'expires_at', now() + (v_ttl || ' minutes')::interval,
      'client_ip', v_client_ip,
      'user_agent', v_user_agent
    )
  );

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_support_session(uuid, text, integer, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_support_session(uuid, text, integer, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.begin_support_session(uuid, text, integer, uuid, text, text) TO service_role;


-- 5. RPC: end_support_session
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
  v_session   public.platform_support_sessions;
  v_home      uuid;
  v_caller_id uuid := auth.uid();
BEGIN
  SELECT * INTO v_session
  FROM public.platform_support_sessions
  WHERE admin_id = v_caller_id
    AND status = 'active'
    AND (id = _session_id OR _session_id IS NULL)
  ORDER BY started_at DESC
  LIMIT 1;

  IF v_session.id IS NULL THEN
    -- Check if session exists but was already terminated or revoked
    IF _session_id IS NOT NULL THEN
      SELECT * INTO v_session FROM public.platform_support_sessions WHERE id = _session_id;
      IF v_session.id IS NOT NULL THEN
        RETURN; -- idempotent exit
      END IF;
    END IF;
    RAISE EXCEPTION 'No active support session found';
  END IF;

  UPDATE public.platform_support_sessions
  SET status = 'ended',
      ended_at = now(),
      ended_by = v_caller_id,
      end_reason = COALESCE(_reason, 'Session ended by admin')
  WHERE id = v_session.id;

  -- Return tenant context to admin's home tenant if any
  SELECT tenant_id INTO v_home FROM public.profiles WHERE id = v_caller_id;
  IF v_home IS NOT NULL AND v_home IS DISTINCT FROM v_session.target_tenant_id THEN
    PERFORM public.switch_tenant(v_home::text);
  END IF;

  -- Platform audit
  PERFORM public.platform_audit(
    'support.session.end',
    'tenant',
    v_session.target_tenant_id,
    v_session.target_tenant_name,
    jsonb_build_object(
      'session_id', v_session.id,
      'reason', _reason,
      'duration_minutes', ROUND(EXTRACT(EPOCH FROM (now() - v_session.started_at)) / 60, 2),
      'target_user_id', v_session.target_user_id,
      'target_user_email', v_session.target_user_email
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.end_support_session(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_support_session(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_support_session(uuid, text) TO service_role;


-- 6. RPC: revoke_support_session (Immediate Administrative Revocation)
CREATE OR REPLACE FUNCTION public.revoke_support_session(
  _session_id uuid,
  _reason     text DEFAULT 'Revoked by administrator'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_session   public.platform_support_sessions;
  v_home      uuid;
BEGIN
  -- Strict Permission check: must be platform super_admin, security_admin, or support lead
  IF NOT (
    public.has_platform_permission('platform.support.impersonate')
    OR public.has_platform_permission('platform.security.manage')
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = v_caller_id
        AND pa.platform_role = 'super_admin'
        AND pa.is_active = true
        AND pa.revoked_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to revoke support sessions' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_session
  FROM public.platform_support_sessions
  WHERE id = _session_id;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Support session not found';
  END IF;

  IF v_session.status = 'revoked' OR v_session.is_revoked THEN
    RETURN; -- already revoked
  END IF;

  UPDATE public.platform_support_sessions
  SET status = 'revoked',
      is_revoked = true,
      revoked_at = now(),
      revoked_by = v_caller_id,
      revocation_reason = COALESCE(_reason, 'Revoked by administrator'),
      ended_at = COALESCE(ended_at, now()),
      ended_by = v_caller_id,
      end_reason = 'Revoked: ' || COALESCE(_reason, 'Administrative revocation')
  WHERE id = _session_id;

  -- If the revoker was the admin inside that session, switch back
  IF v_session.admin_id = v_caller_id THEN
    SELECT tenant_id INTO v_home FROM public.profiles WHERE id = v_caller_id;
    IF v_home IS NOT NULL AND v_home IS DISTINCT FROM v_session.target_tenant_id THEN
      PERFORM public.switch_tenant(v_home::text);
    END IF;
  END IF;

  -- Platform audit
  PERFORM public.platform_audit(
    'support.session.revoke',
    'support_session',
    v_session.id,
    'Session for ' || v_session.target_tenant_name,
    jsonb_build_object(
      'session_id', v_session.id,
      'admin_id', v_session.admin_id,
      'admin_email', v_session.admin_email,
      'target_tenant_id', v_session.target_tenant_id,
      'target_tenant_name', v_session.target_tenant_name,
      'reason', _reason,
      'revoked_by', v_caller_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_support_session(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_support_session(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_support_session(uuid, text) TO service_role;


-- 7. RPC: get_active_support_session
CREATE OR REPLACE FUNCTION public.get_active_support_session()
RETURNS TABLE (
  session_id         uuid,
  target_tenant_id   uuid,
  target_tenant_name text,
  target_user_id     uuid,
  target_user_email  text,
  target_user_name   text,
  reason             text,
  started_at         timestamptz,
  expires_at         timestamptz,
  minutes_remaining  numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Automatically expire stale sessions
  UPDATE public.platform_support_sessions
  SET status = 'expired',
      ended_at = expires_at,
      end_reason = 'Session expired automatically'
  WHERE status = 'active'
    AND expires_at <= now();

  RETURN QUERY
  SELECT
    ps.id AS session_id,
    ps.target_tenant_id,
    ps.target_tenant_name,
    ps.target_user_id,
    ps.target_user_email,
    ps.target_user_name,
    ps.reason,
    ps.started_at,
    ps.expires_at,
    ROUND(EXTRACT(EPOCH FROM (ps.expires_at - now())) / 60, 1) AS minutes_remaining
  FROM public.platform_support_sessions ps
  WHERE ps.admin_id = auth.uid()
    AND ps.status = 'active'
    AND ps.expires_at > now()
    AND ps.is_revoked = false
  ORDER BY ps.started_at DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_support_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_support_session() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_support_session() TO service_role;


-- 8. RPC: admin_list_support_sessions (Audited Super Admin Console Query)
CREATE OR REPLACE FUNCTION public.admin_list_support_sessions(
  _search    text DEFAULT NULL,
  _status    text DEFAULT NULL,
  _tenant_id uuid DEFAULT NULL,
  _admin_id  uuid DEFAULT NULL,
  _limit     integer DEFAULT 50,
  _offset    integer DEFAULT 0
)
RETURNS TABLE (
  id                 uuid,
  admin_id           uuid,
  admin_email        text,
  admin_name         text,
  target_tenant_id   uuid,
  target_tenant_name text,
  target_user_id     uuid,
  target_user_email  text,
  target_user_name   text,
  reason             text,
  status             text,
  started_at         timestamptz,
  expires_at         timestamptz,
  ended_at           timestamptz,
  end_reason         text,
  is_revoked         boolean,
  revoked_at         timestamptz,
  client_ip          text,
  user_agent         text,
  minutes_remaining  numeric,
  actions_count      bigint,
  total_count        bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
BEGIN
  -- Strict Permission Check
  IF NOT (
    public.has_platform_permission('platform.support.view')
    OR public.has_platform_permission('platform.support.impersonate')
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = v_caller_id
        AND pa.platform_role = 'super_admin'
        AND pa.is_active = true
        AND pa.revoked_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized: platform.support.view' USING ERRCODE = '42501';
  END IF;

  -- Auto-expire any pending sessions past expiry
  UPDATE public.platform_support_sessions
  SET status = 'expired',
      ended_at = expires_at,
      end_reason = 'Session expired automatically'
  WHERE status = 'active'
    AND expires_at <= now();

  RETURN QUERY
  WITH filtered AS (
    SELECT
      s.id,
      s.admin_id,
      s.admin_email,
      COALESCE(pa.full_name, p.full_name, s.admin_email) AS admin_name,
      s.target_tenant_id,
      s.target_tenant_name,
      s.target_user_id,
      s.target_user_email,
      s.target_user_name,
      s.reason,
      s.status,
      s.started_at,
      s.expires_at,
      s.ended_at,
      s.end_reason,
      s.is_revoked,
      s.revoked_at,
      s.client_ip,
      s.user_agent,
      CASE
        WHEN s.status = 'active' AND s.expires_at > now() THEN
          ROUND(EXTRACT(EPOCH FROM (s.expires_at - now())) / 60, 1)
        ELSE 0
      END AS minutes_remaining,
      (
        SELECT COUNT(*)
        FROM public.platform_audit_log pal
        WHERE pal.support_session_id = s.id
      ) AS actions_count
    FROM public.platform_support_sessions s
    LEFT JOIN public.platform_admins pa ON pa.user_id = s.admin_id
    LEFT JOIN public.profiles p ON p.id = s.admin_id
    WHERE
      (_tenant_id IS NULL OR s.target_tenant_id = _tenant_id)
      AND (_admin_id IS NULL OR s.admin_id = _admin_id)
      AND (
        _status IS NULL
        OR _status = 'all'
        OR s.status = _status
      )
      AND (
        _search IS NULL
        OR trim(_search) = ''
        OR s.target_tenant_name ILIKE '%' || trim(_search) || '%'
        OR s.admin_email ILIKE '%' || trim(_search) || '%'
        OR s.reason ILIKE '%' || trim(_search) || '%'
        OR COALESCE(s.target_user_email, '') ILIKE '%' || trim(_search) || '%'
        OR COALESCE(s.target_user_name, '') ILIKE '%' || trim(_search) || '%'
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
  ORDER BY f.started_at DESC
  LIMIT LEAST(COALESCE(_limit, 50), 200)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_support_sessions(text, text, uuid, uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_support_sessions(text, text, uuid, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_support_sessions(text, text, uuid, uuid, integer, integer) TO service_role;


-- 9. RPC: admin_get_support_session_actions (Inspect Audit Logs Correlated to a Support Session)
CREATE OR REPLACE FUNCTION public.admin_get_support_session_actions(
  _session_id uuid
)
RETURNS TABLE (
  id           uuid,
  created_at   timestamptz,
  actor_email  text,
  action       text,
  target_type  text,
  target_id    uuid,
  target_label text,
  detail       jsonb,
  ip_address   inet,
  user_agent   text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
BEGIN
  IF NOT (
    public.has_platform_permission('platform.support.view')
    OR public.has_platform_permission('platform.audit.view')
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = v_caller_id
        AND pa.platform_role = 'super_admin'
        AND pa.is_active = true
        AND pa.revoked_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to view support session actions' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    pal.id,
    pal.created_at,
    pal.actor_email,
    pal.action,
    pal.target_type,
    pal.target_id,
    pal.target_label,
    pal.detail,
    pal.ip_address,
    pal.user_agent
  FROM public.platform_audit_log pal
  WHERE pal.support_session_id = _session_id
  ORDER BY pal.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_support_session_actions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_support_session_actions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_support_session_actions(uuid) TO service_role;
