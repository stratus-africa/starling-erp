-- ==============================================================================
-- Platform Sessions RPC
-- Migration: 20260910400000_platform_sessions_rpc.sql
-- ==============================================================================
-- Provides a SECURITY DEFINER view of auth.sessions for platform admins.
-- Supabase does not expose auth.sessions to authenticated role directly.

CREATE OR REPLACE FUNCTION public.admin_get_sessions(_limit integer DEFAULT 200)
RETURNS TABLE (
  id              uuid,
  user_id         uuid,
  created_at      timestamptz,
  updated_at      timestamptz,
  factor_id       uuid,
  aal             text,
  not_after       timestamptz,
  refreshed_at    text,
  user_agent      text,
  ip              inet,
  tag             text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'auth', 'public'
AS $$
BEGIN
  IF NOT public.has_platform_permission('platform.security.view', auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied: platform.security.view required';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.user_id,
    s.created_at,
    s.updated_at,
    s.factor_id,
    s.aal::text,
    s.not_after,
    NULL::text            AS refreshed_at,
    NULL::text            AS user_agent,
    NULL::inet            AS ip,
    NULL::text            AS tag
  FROM auth.sessions s
  ORDER BY s.updated_at DESC NULLS LAST
  LIMIT _limit;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_sessions(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_sessions(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_sessions(integer) TO service_role;

-- Revoke a specific session (terminate it)
CREATE OR REPLACE FUNCTION public.admin_revoke_session(_session_id uuid, _reason text DEFAULT 'Revoked by platform admin')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'auth', 'public'
AS $$
BEGIN
  IF NOT public.has_platform_permission('platform.security.view', auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied: platform.security.view required';
  END IF;

  DELETE FROM auth.sessions WHERE id = _session_id;

  PERFORM public.platform_audit(
    'session.revoked', 'session', _session_id, _reason,
    jsonb_build_object('session_id', _session_id, 'reason', _reason)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_session(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revoke_session(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_session(uuid, text) TO service_role;
