-- ==============================================================================
-- Platform Announcements System
-- Migration: 20260910200000_platform_announcements.sql
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.platform_announcements (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text        NOT NULL,
  body          text        NOT NULL,
  type          text        NOT NULL DEFAULT 'info'
                            CONSTRAINT ann_type_check CHECK (type IN ('info', 'warning', 'success', 'critical', 'maintenance')),
  is_active     boolean     NOT NULL DEFAULT true,
  starts_at     timestamptz,
  ends_at       timestamptz,
  target_plans  text[]      NOT NULL DEFAULT '{}',
  created_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_announcements_active_idx
  ON public.platform_announcements(is_active, starts_at, ends_at);

CREATE TRIGGER trg_platform_announcements_updated
  BEFORE UPDATE ON public.platform_announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

GRANT SELECT ON public.platform_announcements TO authenticated;
GRANT ALL ON public.platform_announcements TO service_role;
ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can read announcements" ON public.platform_announcements;
CREATE POLICY "Platform admins can read announcements"
  ON public.platform_announcements FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenants can read active announcements" ON public.platform_announcements;
CREATE POLICY "Tenants can read active announcements"
  ON public.platform_announcements FOR SELECT TO authenticated
  USING (
    is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
  );

DROP POLICY IF EXISTS "No direct writes to announcements" ON public.platform_announcements;
CREATE POLICY "No direct writes to announcements"
  ON public.platform_announcements FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- RPCs

CREATE OR REPLACE FUNCTION public.admin_create_announcement(
  _title       text,
  _body        text,
  _type        text        DEFAULT 'info',
  _is_active   boolean     DEFAULT true,
  _starts_at   timestamptz DEFAULT NULL,
  _ends_at     timestamptz DEFAULT NULL,
  _target_plans text[]     DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_platform_permission('platform.announcements.manage', auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied: platform.announcements.manage required';
  END IF;
  INSERT INTO public.platform_announcements (title, body, type, is_active, starts_at, ends_at, target_plans, created_by, updated_by)
  VALUES (_title, _body, _type, _is_active, _starts_at, _ends_at, _target_plans, auth.uid(), auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.platform_audit('announcement.created', 'announcement', v_id, _title, jsonb_build_object('type', _type));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_announcement(
  _id           uuid,
  _title        text,
  _body         text,
  _type         text,
  _is_active    boolean,
  _starts_at    timestamptz DEFAULT NULL,
  _ends_at      timestamptz DEFAULT NULL,
  _target_plans text[]      DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_platform_permission('platform.announcements.manage', auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied: platform.announcements.manage required';
  END IF;
  UPDATE public.platform_announcements
  SET title = _title, body = _body, type = _type, is_active = _is_active,
      starts_at = _starts_at, ends_at = _ends_at, target_plans = _target_plans,
      updated_by = auth.uid()
  WHERE id = _id;
  PERFORM public.platform_audit('announcement.updated', 'announcement', _id, _title, jsonb_build_object('type', _type, 'active', _is_active));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_announcement(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_title text;
BEGIN
  IF NOT public.has_platform_permission('platform.announcements.manage', auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied: platform.announcements.manage required';
  END IF;
  SELECT title INTO v_title FROM public.platform_announcements WHERE id = _id;
  DELETE FROM public.platform_announcements WHERE id = _id;
  PERFORM public.platform_audit('announcement.deleted', 'announcement', _id, v_title, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_announcement(text, text, text, boolean, timestamptz, timestamptz, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_announcement(text, text, text, boolean, timestamptz, timestamptz, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_announcement(uuid, text, text, text, boolean, timestamptz, timestamptz, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_announcement(uuid, text, text, text, boolean, timestamptz, timestamptz, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_announcement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_announcement(uuid) TO service_role;
