-- ==============================================================================
-- Super Admin Security Center & Platform Protection System
-- File: supabase/migrations/20260908000000_super_admin_security_center.sql
-- ==============================================================================

-- 1. Enhance platform_admins with MFA & Account Security Controls
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_admins' AND column_name = 'mfa_enforced'
  ) THEN
    ALTER TABLE public.platform_admins ADD COLUMN mfa_enforced boolean NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_admins' AND column_name = 'mfa_enrolled'
  ) THEN
    ALTER TABLE public.platform_admins ADD COLUMN mfa_enrolled boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_admins' AND column_name = 'failed_login_count'
  ) THEN
    ALTER TABLE public.platform_admins ADD COLUMN failed_login_count int NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_admins' AND column_name = 'last_failed_login_at'
  ) THEN
    ALTER TABLE public.platform_admins ADD COLUMN last_failed_login_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_admins' AND column_name = 'locked_until'
  ) THEN
    ALTER TABLE public.platform_admins ADD COLUMN locked_until timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_admins' AND column_name = 'session_revocation_nonce'
  ) THEN
    ALTER TABLE public.platform_admins ADD COLUMN session_revocation_nonce int NOT NULL DEFAULT 1;
  END IF;
END $$;


-- 2. Platform Active Sessions Tracking Table
CREATE TABLE IF NOT EXISTS public.platform_active_sessions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_email       text        NOT NULL,
  admin_role        text        NOT NULL,
  client_ip         inet,
  user_agent        text,
  device_type       text        DEFAULT 'Desktop',
  browser           text,
  os                text,
  location_hint     text,
  status            text        NOT NULL DEFAULT 'active'
                                CONSTRAINT platform_session_status_check
                                CHECK (status IN ('active', 'revoked', 'expired')),
  last_active_at    timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at        timestamptz NOT NULL DEFAULT now(),
  revoked_at        timestamptz,
  revoked_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  revocation_reason text
);

CREATE INDEX IF NOT EXISTS platform_active_sessions_user_idx
  ON public.platform_active_sessions(user_id, status, last_active_at DESC);
CREATE INDEX IF NOT EXISTS platform_active_sessions_status_idx
  ON public.platform_active_sessions(status, expires_at);

ALTER TABLE public.platform_active_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can read active sessions" ON public.platform_active_sessions;
CREATE POLICY "Platform admins can read active sessions"
  ON public.platform_active_sessions FOR SELECT TO authenticated
  USING (
    public.has_platform_permission('platform.security.view')
    OR public.has_platform_permission('platform.admins.view')
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = auth.uid() AND pa.platform_role = 'super_admin' AND pa.is_active = true
    )
  );

GRANT SELECT ON public.platform_active_sessions TO authenticated;
GRANT ALL ON public.platform_active_sessions TO service_role;


-- 3. Platform Login Activity & Failed Attempts Table
CREATE TABLE IF NOT EXISTS public.platform_login_activity (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  email          text        NOT NULL,
  status         text        NOT NULL
                             CONSTRAINT platform_login_status_check
                             CHECK (status IN ('success', 'failed', 'blocked', 'mfa_required', 'mfa_failed')),
  failure_reason text,
  ip_address     inet,
  user_agent     text,
  country        text,
  city           text,
  risk_score     int         DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_login_activity_email_time_idx
  ON public.platform_login_activity(email, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_login_activity_status_time_idx
  ON public.platform_login_activity(status, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_login_activity_risk_idx
  ON public.platform_login_activity(risk_score DESC, created_at DESC);

ALTER TABLE public.platform_login_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can read login activity" ON public.platform_login_activity;
CREATE POLICY "Platform admins can read login activity"
  ON public.platform_login_activity FOR SELECT TO authenticated
  USING (
    public.has_platform_permission('platform.security.view')
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = auth.uid() AND pa.platform_role = 'super_admin' AND pa.is_active = true
    )
  );

GRANT SELECT ON public.platform_login_activity TO authenticated;
GRANT ALL ON public.platform_login_activity TO service_role;


-- 4. Seed initial security baseline data if tables are empty
DO $$
DECLARE
  v_admin record;
BEGIN
  FOR v_admin IN SELECT * FROM public.platform_admins WHERE is_active = true LOOP
    -- Seed an active session if none exists
    IF NOT EXISTS (SELECT 1 FROM public.platform_active_sessions WHERE user_id = v_admin.user_id) THEN
      INSERT INTO public.platform_active_sessions (
        user_id, admin_email, admin_role, client_ip, user_agent,
        device_type, browser, os, location_hint, status, last_active_at, expires_at
      ) VALUES (
        v_admin.user_id, v_admin.email, v_admin.platform_role, '127.0.0.1'::inet,
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36',
        'Desktop', 'Chrome', 'Windows 11', 'Internal Admin Network', 'active',
        now(), now() + interval '24 hours'
      );
    END IF;

    -- Seed login activity baseline
    IF NOT EXISTS (SELECT 1 FROM public.platform_login_activity WHERE email = v_admin.email) THEN
      INSERT INTO public.platform_login_activity (
        user_id, email, status, ip_address, user_agent, country, city, risk_score, created_at
      ) VALUES
      (
        v_admin.user_id, v_admin.email, 'success', '127.0.0.1'::inet,
        'Chrome / Windows 11', 'US', 'Ashburn', 0, now() - interval '2 hours'
      ),
      (
        v_admin.user_id, v_admin.email, 'mfa_required', '127.0.0.1'::inet,
        'Chrome / Windows 11', 'US', 'Ashburn', 10, now() - interval '2 hours 1 minute'
      );
    END IF;
  END LOOP;
END $$;


-- 5. RPC: admin_get_security_center_overview
CREATE OR REPLACE FUNCTION public.admin_get_security_center_overview()
RETURNS TABLE (
  total_admins             bigint,
  active_admins            bigint,
  disabled_admins          bigint,
  mfa_enrolled_admins      bigint,
  mfa_compliance_rate      numeric,
  active_sessions_count    bigint,
  failed_logins_24h        bigint,
  high_risk_logins_24h     bigint,
  unresolved_security_events bigint,
  critical_events_count    bigint,
  active_support_sessions  bigint,
  system_security_posture  text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id              uuid := auth.uid();
  v_total_adm              bigint;
  v_active_adm             bigint;
  v_disabled_adm           bigint;
  v_mfa_adm                bigint;
  v_mfa_rate               numeric := 0;
  v_act_sessions           bigint;
  v_failed_24h             bigint;
  v_risk_24h               bigint;
  v_unresolved_sec         bigint;
  v_critical_sec           bigint;
  v_act_support            bigint;
  v_posture                text := 'OPTIMAL';
BEGIN
  -- Strict Permission check
  IF NOT (
    public.has_platform_permission('platform.security.view')
    OR public.has_platform_permission('platform.admins.view')
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = v_caller_id AND pa.platform_role = 'super_admin' AND pa.is_active = true
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized: platform.security.view' USING ERRCODE = '42501';
  END IF;

  -- Auto-expire sessions
  UPDATE public.platform_active_sessions
  SET status = 'expired'
  WHERE status = 'active' AND expires_at <= now();

  -- Admin telemetry
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE is_active = true AND revoked_at IS NULL),
    COUNT(*) FILTER (WHERE is_active = false OR revoked_at IS NOT NULL),
    COUNT(*) FILTER (WHERE mfa_enrolled = true)
  INTO v_total_adm, v_active_adm, v_disabled_adm, v_mfa_adm
  FROM public.platform_admins;

  IF v_active_adm > 0 THEN
    v_mfa_rate := ROUND((v_mfa_adm::numeric / v_active_adm::numeric) * 100, 1);
  END IF;

  -- Active sessions
  SELECT COUNT(*) INTO v_act_sessions
  FROM public.platform_active_sessions
  WHERE status = 'active' AND expires_at > now();

  -- Login security (24h)
  SELECT
    COUNT(*) FILTER (WHERE status IN ('failed', 'blocked', 'mfa_failed')),
    COUNT(*) FILTER (WHERE risk_score >= 50)
  INTO v_failed_24h, v_risk_24h
  FROM public.platform_login_activity
  WHERE created_at >= (now() - interval '24 hours');

  -- Security incidents
  SELECT
    COUNT(*) FILTER (WHERE resolved = false),
    COUNT(*) FILTER (WHERE resolved = false AND severity = 'critical')
  INTO v_unresolved_sec, v_critical_sec
  FROM public.platform_security_events;

  -- Active support sessions
  SELECT COUNT(*) INTO v_act_support
  FROM public.platform_support_sessions
  WHERE status = 'active' AND expires_at > now() AND is_revoked = false;

  -- Posture evaluation
  IF v_critical_sec > 0 OR v_risk_24h > 10 THEN
    v_posture := 'THREAT_DETECTED';
  ELSIF v_unresolved_sec > 0 OR v_failed_24h > 5 OR v_mfa_rate < 80 THEN
    v_posture := 'ATTENTION_REQUIRED';
  ELSE
    v_posture := 'OPTIMAL';
  END IF;

  RETURN QUERY SELECT
    v_total_adm,
    v_active_adm,
    v_disabled_adm,
    v_mfa_adm,
    v_mfa_rate,
    v_act_sessions,
    COALESCE(v_failed_24h, 0),
    COALESCE(v_risk_24h, 0),
    COALESCE(v_unresolved_sec, 0),
    COALESCE(v_critical_sec, 0),
    COALESCE(v_act_support, 0),
    v_posture;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_security_center_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_security_center_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_security_center_overview() TO service_role;


-- 6. RPC: admin_list_platform_admins
CREATE OR REPLACE FUNCTION public.admin_list_platform_admins(
  _search text    DEFAULT NULL,
  _status text    DEFAULT NULL,
  _role   text    DEFAULT NULL,
  _limit  integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  user_id          uuid,
  email            text,
  full_name        text,
  platform_role    text,
  is_active        boolean,
  mfa_enforced     boolean,
  mfa_enrolled     boolean,
  failed_logins    int,
  last_seen_at     timestamptz,
  granted_at       timestamptz,
  notes            text,
  active_sessions  bigint,
  total_count      bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (
    public.has_platform_permission('platform.admins.view')
    OR public.has_platform_permission('platform.security.view')
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = auth.uid() AND pa.platform_role = 'super_admin' AND pa.is_active = true
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized: platform.admins.view' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      pa.user_id,
      pa.email,
      pa.full_name,
      pa.platform_role,
      pa.is_active,
      pa.mfa_enforced,
      pa.mfa_enrolled,
      pa.failed_login_count AS failed_logins,
      pa.last_seen_at,
      pa.granted_at,
      pa.notes,
      (
        SELECT COUNT(*)
        FROM public.platform_active_sessions pas
        WHERE pas.user_id = pa.user_id AND pas.status = 'active' AND pas.expires_at > now()
      ) AS active_sessions
    FROM public.platform_admins pa
    WHERE
      (_role IS NULL OR _role = 'all' OR pa.platform_role = _role)
      AND (
        _status IS NULL OR _status = 'all'
        OR (_status = 'active' AND pa.is_active = true AND pa.revoked_at IS NULL)
        OR (_status = 'disabled' AND (pa.is_active = false OR pa.revoked_at IS NOT NULL))
      )
      AND (
        _search IS NULL
        OR trim(_search) = ''
        OR pa.email ILIKE '%' || trim(_search) || '%'
        OR COALESCE(pa.full_name, '') ILIKE '%' || trim(_search) || '%'
        OR pa.platform_role ILIKE '%' || trim(_search) || '%'
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
  ORDER BY f.is_active DESC, f.granted_at DESC
  LIMIT LEAST(COALESCE(_limit, 50), 100)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_platform_admins(text, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_platform_admins(text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_platform_admins(text, text, text, integer, integer) TO service_role;


-- 7. RPC: admin_set_platform_admin_status
CREATE OR REPLACE FUNCTION public.admin_set_platform_admin_status(
  _admin_id  uuid,
  _is_active boolean,
  _reason    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id  uuid := auth.uid();
  v_admin_mail text;
  v_old_status boolean;
BEGIN
  IF NOT (
    public.has_platform_permission('platform.admins.manage')
    OR public.has_platform_permission('platform.security.manage')
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = v_caller_id AND pa.platform_role = 'super_admin' AND pa.is_active = true
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to manage platform administrator accounts' USING ERRCODE = '42501';
  END IF;

  -- Prevent self-lockout
  IF _admin_id = v_caller_id AND _is_active = false THEN
    RAISE EXCEPTION 'Self-lockout prevented: you cannot disable your own platform administrator account';
  END IF;

  SELECT email, is_active INTO v_admin_mail, v_old_status
  FROM public.platform_admins
  WHERE user_id = _admin_id;

  IF v_admin_mail IS NULL THEN
    RAISE EXCEPTION 'Platform administrator not found';
  END IF;

  UPDATE public.platform_admins
  SET is_active = _is_active,
      revoked_at = CASE WHEN _is_active = false THEN now() ELSE NULL END,
      session_revocation_nonce = session_revocation_nonce + 1,
      notes = COALESCE(_reason, notes),
      updated_at = now()
  WHERE user_id = _admin_id;

  -- If disabled, instantly revoke all active sessions for this admin
  IF _is_active = false THEN
    UPDATE public.platform_active_sessions
    SET status = 'revoked',
        revoked_at = now(),
        revoked_by = v_caller_id,
        revocation_reason = COALESCE(_reason, 'Account disabled by security administrator')
    WHERE user_id = _admin_id AND status = 'active';

    -- Also terminate any open support sessions
    UPDATE public.platform_support_sessions
    SET status = 'revoked',
        is_revoked = true,
        revoked_at = now(),
        revoked_by = v_caller_id,
        revocation_reason = 'Admin account disabled'
    WHERE admin_id = _admin_id AND status = 'active';
  END IF;

  -- Platform audit
  PERFORM public.platform_audit(
    CASE WHEN _is_active THEN 'admin.account.enabled' ELSE 'admin.account.disabled' END,
    'platform_admin',
    _admin_id,
    v_admin_mail,
    jsonb_build_object(
      'previous_status', v_old_status,
      'new_status', _is_active,
      'reason', _reason
    ),
    'critical'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_platform_admin_status(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_platform_admin_status(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_platform_admin_status(uuid, boolean, text) TO service_role;


-- 8. RPC: admin_set_platform_admin_role
CREATE OR REPLACE FUNCTION public.admin_set_platform_admin_role(
  _admin_id uuid,
  _new_role text,
  _reason   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_admin_mail text;
  v_old_role  text;
BEGIN
  IF NOT (
    public.has_platform_permission('platform.admins.manage')
    OR public.has_platform_permission('platform.security.manage')
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = v_caller_id AND pa.platform_role = 'super_admin' AND pa.is_active = true
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to change platform administrator roles' USING ERRCODE = '42501';
  END IF;

  -- Validate role
  IF NOT EXISTS (SELECT 1 FROM public.platform_roles WHERE name = _new_role) THEN
    RAISE EXCEPTION 'Invalid platform role: %', _new_role;
  END IF;

  SELECT email, platform_role INTO v_admin_mail, v_old_role
  FROM public.platform_admins
  WHERE user_id = _admin_id;

  IF v_admin_mail IS NULL THEN
    RAISE EXCEPTION 'Platform administrator not found';
  END IF;

  UPDATE public.platform_admins
  SET platform_role = _new_role,
      updated_at = now()
  WHERE user_id = _admin_id;

  -- Update role in active sessions
  UPDATE public.platform_active_sessions
  SET admin_role = _new_role
  WHERE user_id = _admin_id AND status = 'active';

  -- Platform audit
  PERFORM public.platform_audit(
    'admin.role.changed',
    'platform_admin',
    _admin_id,
    v_admin_mail,
    jsonb_build_object(
      'old_role', v_old_role,
      'new_role', _new_role,
      'reason', _reason
    ),
    'high'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_platform_admin_role(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_platform_admin_role(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_platform_admin_role(uuid, text, text) TO service_role;


-- 9. RPC: admin_list_platform_sessions
CREATE OR REPLACE FUNCTION public.admin_list_platform_sessions(
  _search  text    DEFAULT NULL,
  _status  text    DEFAULT NULL,
  _user_id uuid    DEFAULT NULL,
  _limit   integer DEFAULT 50,
  _offset  integer DEFAULT 0
)
RETURNS TABLE (
  id                uuid,
  user_id           uuid,
  admin_email       text,
  admin_role        text,
  client_ip         inet,
  user_agent        text,
  device_type       text,
  browser           text,
  os                text,
  location_hint     text,
  status            text,
  last_active_at    timestamptz,
  expires_at        timestamptz,
  created_at        timestamptz,
  revoked_at        timestamptz,
  revocation_reason text,
  minutes_remaining numeric,
  total_count       bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (
    public.has_platform_permission('platform.security.view')
    OR public.has_platform_permission('platform.admins.view')
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = auth.uid() AND pa.platform_role = 'super_admin' AND pa.is_active = true
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized: platform.security.view' USING ERRCODE = '42501';
  END IF;

  -- Expire past sessions
  UPDATE public.platform_active_sessions
  SET status = 'expired'
  WHERE status = 'active' AND expires_at <= now();

  RETURN QUERY
  WITH filtered AS (
    SELECT
      s.id,
      s.user_id,
      s.admin_email,
      s.admin_role,
      s.client_ip,
      s.user_agent,
      s.device_type,
      s.browser,
      s.os,
      s.location_hint,
      s.status,
      s.last_active_at,
      s.expires_at,
      s.created_at,
      s.revoked_at,
      s.revocation_reason,
      CASE
        WHEN s.status = 'active' AND s.expires_at > now() THEN
          ROUND(EXTRACT(EPOCH FROM (s.expires_at - now())) / 60, 1)
        ELSE 0
      END AS minutes_remaining
    FROM public.platform_active_sessions s
    WHERE
      (_user_id IS NULL OR s.user_id = _user_id)
      AND (_status IS NULL OR _status = 'all' OR s.status = _status)
      AND (
        _search IS NULL
        OR trim(_search) = ''
        OR s.admin_email ILIKE '%' || trim(_search) || '%'
        OR COALESCE(s.device_type, '') ILIKE '%' || trim(_search) || '%'
        OR COALESCE(s.browser, '') ILIKE '%' || trim(_search) || '%'
        OR COALESCE(s.os, '') ILIKE '%' || trim(_search) || '%'
        OR COALESCE(s.client_ip::text, '') ILIKE '%' || trim(_search) || '%'
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
  ORDER BY f.last_active_at DESC
  LIMIT LEAST(COALESCE(_limit, 50), 100)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_platform_sessions(text, text, uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_platform_sessions(text, text, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_platform_sessions(text, text, uuid, integer, integer) TO service_role;


-- 10. RPC: admin_revoke_platform_session
CREATE OR REPLACE FUNCTION public.admin_revoke_platform_session(
  _session_id uuid,
  _reason     text DEFAULT 'Revoked by security administrator'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_session   public.platform_active_sessions;
BEGIN
  IF NOT (
    public.has_platform_permission('platform.security.manage')
    OR public.has_platform_permission('platform.admins.manage')
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = v_caller_id AND pa.platform_role = 'super_admin' AND pa.is_active = true
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to revoke platform sessions' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_session
  FROM public.platform_active_sessions
  WHERE id = _session_id;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  UPDATE public.platform_active_sessions
  SET status = 'revoked',
      revoked_at = now(),
      revoked_by = v_caller_id,
      revocation_reason = COALESCE(_reason, 'Revoked by administrator')
  WHERE id = _session_id;

  -- Platform audit
  PERFORM public.platform_audit(
    'session.revoked',
    'platform_session',
    _session_id,
    'Session for ' || v_session.admin_email,
    jsonb_build_object(
      'session_id', _session_id,
      'admin_email', v_session.admin_email,
      'admin_id', v_session.user_id,
      'reason', _reason
    ),
    'high'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_platform_session(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revoke_platform_session(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_platform_session(uuid, text) TO service_role;


-- 11. RPC: admin_revoke_all_admin_sessions
CREATE OR REPLACE FUNCTION public.admin_revoke_all_admin_sessions(
  _user_id uuid,
  _reason  text DEFAULT 'All active sessions revoked by security administrator'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_email     text;
  v_count     integer;
BEGIN
  IF NOT (
    public.has_platform_permission('platform.security.manage')
    OR public.has_platform_permission('platform.admins.manage')
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = v_caller_id AND pa.platform_role = 'super_admin' AND pa.is_active = true
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to revoke admin sessions' USING ERRCODE = '42501';
  END IF;

  SELECT email INTO v_email FROM public.platform_admins WHERE user_id = _user_id;

  WITH updated AS (
    UPDATE public.platform_active_sessions
    SET status = 'revoked',
        revoked_at = now(),
        revoked_by = v_caller_id,
        revocation_reason = COALESCE(_reason, 'Bulk session revocation')
    WHERE user_id = _user_id AND status = 'active'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM updated;

  -- Bump session revocation nonce
  UPDATE public.platform_admins
  SET session_revocation_nonce = session_revocation_nonce + 1
  WHERE user_id = _user_id;

  -- Platform audit
  PERFORM public.platform_audit(
    'sessions.bulk_revoked',
    'platform_admin',
    _user_id,
    COALESCE(v_email, 'Admin ' || _user_id::text),
    jsonb_build_object(
      'revoked_sessions_count', v_count,
      'reason', _reason
    ),
    'high'
  );

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_all_admin_sessions(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revoke_all_admin_sessions(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_all_admin_sessions(uuid, text) TO service_role;


-- 12. RPC: admin_list_login_activity
CREATE OR REPLACE FUNCTION public.admin_list_login_activity(
  _search     text        DEFAULT NULL,
  _status     text        DEFAULT NULL,
  _risk_only  boolean     DEFAULT false,
  _from       timestamptz DEFAULT NULL,
  _to         timestamptz DEFAULT NULL,
  _limit      integer     DEFAULT 50,
  _offset     integer     DEFAULT 0
)
RETURNS TABLE (
  id             uuid,
  user_id        uuid,
  email          text,
  status         text,
  failure_reason text,
  ip_address     inet,
  user_agent     text,
  country        text,
  city           text,
  risk_score     int,
  created_at     timestamptz,
  total_count    bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (
    public.has_platform_permission('platform.security.view')
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = auth.uid() AND pa.platform_role = 'super_admin' AND pa.is_active = true
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized: platform.security.view' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      la.id,
      la.user_id,
      la.email,
      la.status,
      la.failure_reason,
      la.ip_address,
      la.user_agent,
      la.country,
      la.city,
      la.risk_score,
      la.created_at
    FROM public.platform_login_activity la
    WHERE
      (_status IS NULL OR _status = 'all' OR la.status = _status)
      AND (_risk_only = false OR la.risk_score >= 50 OR la.status IN ('failed', 'blocked'))
      AND (_from IS NULL OR la.created_at >= _from)
      AND (_to IS NULL OR la.created_at <= _to)
      AND (
        _search IS NULL
        OR trim(_search) = ''
        OR la.email ILIKE '%' || trim(_search) || '%'
        OR COALESCE(la.ip_address::text, '') ILIKE '%' || trim(_search) || '%'
        OR COALESCE(la.country, '') ILIKE '%' || trim(_search) || '%'
        OR COALESCE(la.failure_reason, '') ILIKE '%' || trim(_search) || '%'
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
  LIMIT LEAST(COALESCE(_limit, 50), 100)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_login_activity(text, text, boolean, timestamptz, timestamptz, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_login_activity(text, text, boolean, timestamptz, timestamptz, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_login_activity(text, text, boolean, timestamptz, timestamptz, integer, integer) TO service_role;


-- 13. RPC: admin_list_security_events
CREATE OR REPLACE FUNCTION public.admin_list_security_events(
  _search   text    DEFAULT NULL,
  _severity text    DEFAULT NULL,
  _resolved boolean DEFAULT NULL,
  _limit    integer DEFAULT 50,
  _offset   integer DEFAULT 0
)
RETURNS TABLE (
  id              uuid,
  event_type      text,
  severity        text,
  actor_id        uuid,
  actor_email     text,
  tenant_id       uuid,
  tenant_name     text,
  detail          jsonb,
  ip_address      inet,
  user_agent      text,
  resolved        boolean,
  resolved_by     uuid,
  resolved_at     timestamptz,
  resolution_note text,
  created_at      timestamptz,
  total_count     bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (
    public.has_platform_permission('platform.security.view')
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = auth.uid() AND pa.platform_role = 'super_admin' AND pa.is_active = true
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized: platform.security.view' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      se.id,
      se.event_type,
      se.severity,
      se.actor_id,
      se.actor_email,
      se.tenant_id,
      t.name AS tenant_name,
      se.detail,
      se.ip_address,
      se.user_agent,
      se.resolved,
      se.resolved_by,
      se.resolved_at,
      se.resolution_note,
      se.created_at
    FROM public.platform_security_events se
    LEFT JOIN public.tenants t ON t.id = se.tenant_id
    WHERE
      (_severity IS NULL OR _severity = 'all' OR se.severity = _severity)
      AND (_resolved IS NULL OR se.resolved = _resolved)
      AND (
        _search IS NULL
        OR trim(_search) = ''
        OR se.event_type ILIKE '%' || trim(_search) || '%'
        OR COALESCE(se.actor_email, '') ILIKE '%' || trim(_search) || '%'
        OR COALESCE(t.name, '') ILIKE '%' || trim(_search) || '%'
        OR se.detail::text ILIKE '%' || trim(_search) || '%'
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
  ORDER BY f.resolved ASC, f.created_at DESC
  LIMIT LEAST(COALESCE(_limit, 50), 100)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_security_events(text, text, boolean, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_security_events(text, text, boolean, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_security_events(text, text, boolean, integer, integer) TO service_role;


-- 14. RPC: admin_resolve_security_event
CREATE OR REPLACE FUNCTION public.admin_resolve_security_event(
  _event_id        uuid,
  _resolution_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_event     public.platform_security_events;
BEGIN
  IF NOT (
    public.has_platform_permission('platform.security.manage')
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = v_caller_id AND pa.platform_role = 'super_admin' AND pa.is_active = true
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to resolve security incidents' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_event
  FROM public.platform_security_events
  WHERE id = _event_id;

  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'Security incident not found';
  END IF;

  UPDATE public.platform_security_events
  SET resolved = true,
      resolved_at = now(),
      resolved_by = v_caller_id,
      resolution_note = COALESCE(_resolution_note, 'Resolved by security administrator')
  WHERE id = _event_id;

  -- Platform audit
  PERFORM public.platform_audit(
    'security_event.resolved',
    'security_event',
    _event_id,
    v_event.event_type,
    jsonb_build_object(
      'event_type', v_event.event_type,
      'severity', v_event.severity,
      'resolution_note', _resolution_note
    ),
    'medium'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_security_event(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resolve_security_event(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_security_event(uuid, text) TO service_role;
