CREATE TABLE IF NOT EXISTS public.platform_gap_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  section TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('missing_action','unreachable_page','broken_button','duplicate_route','other')),
  title TEXT NOT NULL,
  route TEXT,
  component TEXT,
  observed_behavior TEXT,
  source_document TEXT NOT NULL DEFAULT 'GAPS_AUDIT.md',
  owner TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical','high','medium','low')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','blocked','fixed','verified','wont_fix')),
  verification_notes TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_gap_findings TO authenticated;
GRANT ALL ON public.platform_gap_findings TO service_role;

ALTER TABLE public.platform_gap_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins read gap findings" ON public.platform_gap_findings
  FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE POLICY "Platform admins insert gap findings" ON public.platform_gap_findings
  FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin());
CREATE POLICY "Platform admins update gap findings" ON public.platform_gap_findings
  FOR UPDATE TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY "Platform admins delete gap findings" ON public.platform_gap_findings
  FOR DELETE TO authenticated USING (public.is_platform_admin());

CREATE INDEX IF NOT EXISTS platform_gap_findings_status_idx ON public.platform_gap_findings (status, priority);

CREATE OR REPLACE FUNCTION public.touch_platform_gap_findings()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_gap_findings_touch ON public.platform_gap_findings;
CREATE TRIGGER platform_gap_findings_touch BEFORE UPDATE ON public.platform_gap_findings
  FOR EACH ROW EXECUTE FUNCTION public.touch_platform_gap_findings();

REVOKE EXECUTE ON FUNCTION public.touch_platform_gap_findings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_platform_gap_findings() TO authenticated, service_role;