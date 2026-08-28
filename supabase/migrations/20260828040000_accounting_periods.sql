-- =========================================================
-- Accounting Periods
--
-- accounting_periods   — one row per calendar month per tenant
--   status: 'Open' | 'Closed' | 'Locked'
--     Open   — normal posting allowed
--     Closed — no new postings; reversals must use current open period
--     Locked — immutable; only super_admin / tenant_admin can re-open
--
-- Enforcement is done at the lowest possible level: inside
-- _emit_journal(), which is the single chokepoint every posting
-- function routes through.  That guarantees period enforcement
-- for invoices, bills, credit notes, payments, expenses, manual
-- journals, adjustments, and production orders simultaneously.
--
-- post_manual_journal gets an additional guard because it accepts
-- an explicit entry_date from the caller rather than deriving it
-- from a source document.
--
-- Auto-provisioning: handle_new_user seeds the current and next 11
-- calendar months as 'Open'. A trigger auto-opens the new month
-- on the first posting of that month if no row exists yet.
-- =========================================================

-- ─────────────────────────────────────────────────────────
-- 1.  Table
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.accounting_periods (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_start   date        NOT NULL,   -- always the 1st of the month
  period_end     date        NOT NULL,   -- always the last day of the month
  period_name    text        NOT NULL,   -- e.g. '2026-01'
  status         text        NOT NULL DEFAULT 'Open'
                             CONSTRAINT accounting_periods_status_check
                             CHECK (status IN ('Open','Closed','Locked')),
  closed_at      timestamptz,
  closed_by      uuid,
  locked_at      timestamptz,
  locked_by      uuid,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, period_start)
);

CREATE INDEX IF NOT EXISTS accounting_periods_tenant_start_idx
  ON public.accounting_periods (tenant_id, period_start DESC);

ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can read accounting periods" ON public.accounting_periods;
CREATE POLICY "Tenant members can read accounting periods"
  ON public.accounting_periods FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "Period managers can modify accounting periods" ON public.accounting_periods;
CREATE POLICY "Period managers can modify accounting periods"
  ON public.accounting_periods FOR ALL TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND (
      public.has_permission('accounting.periods.manage')
      OR public.has_permission('accounting.post')   -- legacy fallback
    )
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (
      public.has_permission('accounting.periods.manage')
      OR public.has_permission('accounting.post')
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.accounting_periods TO authenticated;
GRANT ALL ON public.accounting_periods TO service_role;

CREATE TRIGGER trg_accounting_periods_updated
  BEFORE UPDATE ON public.accounting_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─────────────────────────────────────────────────────────
-- 2.  Helper: assert_period_open(_tenant_id, _date)
--
--     Called by _emit_journal before inserting any journal.
--     Raises if the month of _date is Closed or Locked.
--     If no period row exists for that month, auto-creates
--     it as 'Open' (forward-looking months not yet provisioned).
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assert_period_open(
  _tenant_id  uuid,
  _date       date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_period_start date;
  v_period_end   date;
  v_period_name  text;
  v_status       text;
BEGIN
  -- Normalise to the first of the month
  v_period_start := date_trunc('month', _date)::date;
  v_period_end   := (v_period_start + interval '1 month - 1 day')::date;
  v_period_name  := to_char(_date, 'YYYY-MM');

  -- Look up the period
  SELECT status
  INTO   v_status
  FROM   public.accounting_periods
  WHERE  tenant_id    = _tenant_id
    AND  period_start = v_period_start;

  IF NOT FOUND THEN
    -- Auto-provision as Open so forward months don't block legitimate posting
    INSERT INTO public.accounting_periods (
      tenant_id, period_start, period_end, period_name, status
    ) VALUES (
      _tenant_id, v_period_start, v_period_end, v_period_name, 'Open'
    )
    ON CONFLICT (tenant_id, period_start) DO NOTHING;

    -- Re-read after upsert (another session may have inserted simultaneously)
    SELECT status INTO v_status
    FROM   public.accounting_periods
    WHERE  tenant_id    = _tenant_id
      AND  period_start = v_period_start;
  END IF;

  IF v_status = 'Closed' THEN
    RAISE EXCEPTION
      'Period % is closed. Reverse the entry in an open period instead.',
      v_period_name
      USING ERRCODE = 'P0001';
  END IF;

  IF v_status = 'Locked' THEN
    RAISE EXCEPTION
      'Period % is locked and cannot accept new transactions.',
      v_period_name
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_period_open(uuid, date) FROM PUBLIC;
-- called internally only — no public grant

-- ─────────────────────────────────────────────────────────
-- 3.  Wire assert_period_open into _emit_journal
--
--     _emit_journal is the single shared chokepoint for every
--     automated and manual journal write path.  Adding the check
--     here means every post_ function is covered automatically.
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._emit_journal(
  _tenant_id   uuid,
  _entry_date  date,
  _memo        text,
  _source_type text,
  _source_id   uuid,
  _lines       jsonb   -- array of {account_id, debit, credit, memo}
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  j_id   uuid;
  tot_dr numeric(14,2) := 0;
  tot_cr numeric(14,2) := 0;
  line   jsonb;
BEGIN
  -- ── Period guard ──────────────────────────────────────────────────────────
  PERFORM public.assert_period_open(_tenant_id, _entry_date);

  -- ── Balance check ─────────────────────────────────────────────────────────
  FOR line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    tot_dr := tot_dr + COALESCE((line->>'debit')::numeric,  0);
    tot_cr := tot_cr + COALESCE((line->>'credit')::numeric, 0);
  END LOOP;

  IF ABS(tot_dr - tot_cr) > 0.005 THEN
    RAISE EXCEPTION
      '_emit_journal: unbalanced lines: debit %, credit % (source % %)',
      tot_dr, tot_cr, _source_type, _source_id;
  END IF;

  -- Zero-value journal — skip silently
  IF tot_dr = 0 AND tot_cr = 0 THEN
    RETURN NULL;
  END IF;

  -- ── Insert ────────────────────────────────────────────────────────────────
  INSERT INTO public.journal_entries (
    tenant_id, entry_date, memo, source_ref_type, source_ref_id,
    total_debit, total_credit, status, created_by
  ) VALUES (
    _tenant_id, _entry_date, _memo, _source_type, _source_id,
    tot_dr, tot_cr, 'Posted', auth.uid()
  ) RETURNING id INTO j_id;

  FOR line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    INSERT INTO public.journal_lines (
      tenant_id, journal_id, account_id, debit, credit, memo
    ) VALUES (
      _tenant_id,
      j_id,
      (line->>'account_id')::uuid,
      COALESCE((line->>'debit')::numeric,  0),
      COALESCE((line->>'credit')::numeric, 0),
      line->>'memo'
    );
  END LOOP;

  RETURN j_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._emit_journal(uuid,date,text,text,uuid,jsonb) FROM PUBLIC;

-- ─────────────────────────────────────────────────────────
-- 4.  Wire assert_period_open into post_manual_journal
--
--     post_manual_journal accepts an explicit entry_date from
--     the caller, so we must also check the period there
--     (in addition to the check inside _emit_journal which
--     fires later during the unchecked path).
--     This gives users a clear error message before any
--     line-level validation runs.
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_manual_journal(_journal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  je           public.journal_entries;
  l            record;
  v_debit      numeric(14,2) := 0;
  v_credit     numeric(14,2) := 0;
  v_line_count integer       := 0;
  v_acct       record;
BEGIN
  -- ── Permission ────────────────────────────────────────────────────────────
  IF NOT (public.has_permission('accounting.journal.post')
          OR public.has_permission('accounting.post')) THEN
    RAISE EXCEPTION 'Not authorized: accounting.journal.post'
      USING ERRCODE = '42501';
  END IF;

  -- ── Load + lock ───────────────────────────────────────────────────────────
  SELECT * INTO je
  FROM public.journal_entries
  WHERE id = _journal_id AND tenant_id = public.current_tenant_id()
  FOR UPDATE;

  IF je.id IS NULL          THEN RAISE EXCEPTION 'Journal entry not found'; END IF;
  IF je.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Journal entry has been deleted'; END IF;
  IF lower(COALESCE(je.status,'')) = 'posted'                      THEN RETURN _journal_id; END IF;
  IF lower(COALESCE(je.status,'')) IN ('voided','void','reversed') THEN
    RAISE EXCEPTION 'Cannot post a voided journal entry';
  END IF;
  IF je.entry_date IS NULL THEN
    RAISE EXCEPTION 'Journal entry must have a valid date';
  END IF;

  -- ── Period guard — fail fast before line iteration ────────────────────────
  PERFORM public.assert_period_open(public.current_tenant_id(), je.entry_date);

  -- ── Line validation ───────────────────────────────────────────────────────
  FOR l IN
    SELECT jl.id, jl.debit, jl.credit, jl.account_id
    FROM   public.journal_lines jl
    WHERE  jl.journal_id = _journal_id
      AND  jl.tenant_id  = public.current_tenant_id()
    ORDER  BY jl.created_at, jl.id
    FOR UPDATE
  LOOP
    v_line_count := v_line_count + 1;

    IF l.account_id IS NULL THEN
      RAISE EXCEPTION 'Journal line % has no account assigned', v_line_count;
    END IF;

    SELECT id, name, is_active, allow_manual_posting INTO v_acct
    FROM   public.chart_of_accounts
    WHERE  id = l.account_id
      AND  tenant_id   = public.current_tenant_id()
      AND  deleted_at  IS NULL;

    IF v_acct.id IS NULL     THEN RAISE EXCEPTION 'Account on line % does not exist or belongs to another tenant', v_line_count; END IF;
    IF NOT v_acct.is_active  THEN RAISE EXCEPTION 'Account "%" is inactive', v_acct.name; END IF;
    IF NOT v_acct.allow_manual_posting THEN
      RAISE EXCEPTION 'Account "%" does not allow manual posting (sub-ledger controlled)', v_acct.name;
    END IF;
    IF COALESCE(l.debit,  0) < 0 THEN RAISE EXCEPTION 'Line % has a negative debit',  v_line_count; END IF;
    IF COALESCE(l.credit, 0) < 0 THEN RAISE EXCEPTION 'Line % has a negative credit', v_line_count; END IF;
    IF COALESCE(l.debit,0) > 0 AND COALESCE(l.credit,0) > 0 THEN
      RAISE EXCEPTION 'Line % has both debit and credit — only one allowed per line', v_line_count;
    END IF;
    IF COALESCE(l.debit,0) = 0 AND COALESCE(l.credit,0) = 0 THEN
      RAISE EXCEPTION 'Line % has no debit or credit amount', v_line_count;
    END IF;

    v_debit  := v_debit  + COALESCE(l.debit,  0);
    v_credit := v_credit + COALESCE(l.credit, 0);
  END LOOP;

  IF v_line_count < 2 THEN
    RAISE EXCEPTION 'Journal must have at least 2 lines (has %)', v_line_count;
  END IF;
  IF ABS(v_debit - v_credit) > 0.005 THEN
    RAISE EXCEPTION 'Journal is unbalanced: debits % ≠ credits %', v_debit, v_credit;
  END IF;

  -- ── Commit ────────────────────────────────────────────────────────────────
  UPDATE public.journal_entries
  SET    status          = 'Posted',
         total_debit     = v_debit,
         total_credit    = v_credit,
         source_ref_type = COALESCE(NULLIF(source_ref_type,''), 'manual'),
         updated_at      = now()
  WHERE  id = _journal_id;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (public.current_tenant_id(), 'journal_entry', _journal_id, 'Posted',
          'Manual journal posted; debits ' || v_debit || ', credits ' || v_credit,
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));

  INSERT INTO public.posting_audit_events
    (tenant_id, entity_type, entity_id, action, permission_code, result, actor_id, metadata)
  VALUES (
    public.current_tenant_id(), 'journal_entry', _journal_id, 'post',
    'accounting.journal.post', 'posted', auth.uid(),
    jsonb_build_object('total_debit', v_debit, 'total_credit', v_credit, 'line_count', v_line_count)
  ) ON CONFLICT (tenant_id, entity_type, entity_id, action) DO NOTHING;

  RETURN _journal_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_manual_journal(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.post_manual_journal(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 5.  Period management RPCs (open / close / lock / unlock)
--     These are the only mutation paths for period status.
--     Direct UPDATE is blocked by RLS for non-managers.
-- ─────────────────────────────────────────────────────────

-- manage_accounting_period(year, month, new_status)
-- Returns the updated period row id.
CREATE OR REPLACE FUNCTION public.manage_accounting_period(
  _year       integer,
  _month      integer,
  _new_status text,
  _notes      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id    uuid := public.current_tenant_id();
  v_period_start date;
  v_period_end   date;
  v_period_name  text;
  v_period_id    uuid;
  v_old_status   text;
BEGIN
  IF NOT (public.has_permission('accounting.periods.manage')
          OR public.has_permission('accounting.post')) THEN
    RAISE EXCEPTION 'Not authorized: accounting.periods.manage' USING ERRCODE = '42501';
  END IF;

  IF _new_status NOT IN ('Open','Closed','Locked') THEN
    RAISE EXCEPTION 'Invalid period status: %. Must be Open, Closed, or Locked', _new_status;
  END IF;

  v_period_start := make_date(_year, _month, 1);
  v_period_end   := (v_period_start + interval '1 month - 1 day')::date;
  v_period_name  := to_char(v_period_start, 'YYYY-MM');

  -- Upsert the period row
  INSERT INTO public.accounting_periods (
    tenant_id, period_start, period_end, period_name, status,
    closed_at, closed_by, locked_at, locked_by, notes
  ) VALUES (
    v_tenant_id, v_period_start, v_period_end, v_period_name,
    _new_status,
    CASE WHEN _new_status IN ('Closed','Locked') THEN now() END,
    CASE WHEN _new_status IN ('Closed','Locked') THEN auth.uid() END,
    CASE WHEN _new_status = 'Locked' THEN now() END,
    CASE WHEN _new_status = 'Locked' THEN auth.uid() END,
    _notes
  )
  ON CONFLICT (tenant_id, period_start) DO UPDATE SET
    status     = EXCLUDED.status,
    closed_at  = CASE WHEN EXCLUDED.status IN ('Closed','Locked') THEN COALESCE(accounting_periods.closed_at, now()) END,
    closed_by  = CASE WHEN EXCLUDED.status IN ('Closed','Locked') THEN COALESCE(accounting_periods.closed_by, auth.uid()) END,
    locked_at  = CASE WHEN EXCLUDED.status = 'Locked' THEN COALESCE(accounting_periods.locked_at, now()) END,
    locked_by  = CASE WHEN EXCLUDED.status = 'Locked' THEN COALESCE(accounting_periods.locked_by, auth.uid()) END,
    notes      = COALESCE(EXCLUDED.notes, accounting_periods.notes),
    updated_at = now()
  RETURNING id INTO v_period_id;

  INSERT INTO public.document_events (
    tenant_id, entity_type, entity_id, status, note, actor_id, actor_email
  ) VALUES (
    v_tenant_id, 'accounting_period', v_period_id, _new_status,
    'Period ' || v_period_name || ' changed to ' || _new_status,
    auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

  RETURN v_period_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.manage_accounting_period(integer,integer,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.manage_accounting_period(integer,integer,text,text) TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 6.  Seed 12 months of periods for existing tenants
--     (current month + 11 forward, all Open)
-- ─────────────────────────────────────────────────────────

INSERT INTO public.accounting_periods (
  tenant_id, period_start, period_end, period_name, status
)
SELECT
  t.id,
  gs::date,
  (gs + interval '1 month - 1 day')::date,
  to_char(gs, 'YYYY-MM'),
  'Open'
FROM   public.tenants t
CROSS  JOIN generate_series(
  date_trunc('month', CURRENT_DATE)::date,
  (date_trunc('month', CURRENT_DATE) + interval '11 months')::date,
  interval '1 month'
) gs
WHERE  t.deleted_at IS NULL
ON CONFLICT (tenant_id, period_start) DO NOTHING;

-- ─────────────────────────────────────────────────────────
-- 7.  Update handle_new_user to seed 12 periods on sign-up
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_tenant_id uuid;
  tenant_name   text;
  tenant_slug   text;
BEGIN
  tenant_name := COALESCE(NEW.raw_user_meta_data->>'company',
                           split_part(NEW.email,'@',1) || '''s Workspace');
  tenant_slug := lower(regexp_replace(
                   tenant_name || '-' || substr(NEW.id::text,1,8),
                   '[^a-z0-9]+','-','g'));

  INSERT INTO public.tenants (name, slug)
  VALUES (tenant_name, tenant_slug)
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.profiles (id, tenant_id, email, full_name)
  VALUES (NEW.id, new_tenant_id, NEW.email,
          COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (NEW.id, new_tenant_id, 'tenant_admin');

  -- ── System accounts ───────────────────────────────────────────────────────
  INSERT INTO public.chart_of_accounts
    (tenant_id, code, name, type, normal_balance, is_system, allow_manual_posting, description, created_by)
  VALUES
    (new_tenant_id,'1000','Cash',                'Asset',   'Debit', true, true,  'Primary cash and cash-equivalent account',  NEW.id),
    (new_tenant_id,'1100','Accounts Receivable', 'Asset',   'Debit', true, false, 'Amounts owed by customers',                 NEW.id),
    (new_tenant_id,'1200','Inventory',           'Asset',   'Debit', true, false, 'Stock held for sale',                       NEW.id),
    (new_tenant_id,'1300','Work in Progress',    'Asset',   'Debit', true, false, 'Partially completed production costs',      NEW.id),
    (new_tenant_id,'2000','Accounts Payable',    'Liability','Credit',true,false, 'Amounts owed to suppliers',                 NEW.id),
    (new_tenant_id,'3000','Owner Equity',        'Equity',  'Credit',true,false,  'Owner / shareholder equity',                NEW.id),
    (new_tenant_id,'4000','Sales Revenue',       'Income',  'Credit',true, false, 'Revenue from primary business operations',  NEW.id),
    (new_tenant_id,'5000','Cost of Goods Sold',  'Expense', 'Debit', true, true,  'Direct cost of products sold',              NEW.id),
    (new_tenant_id,'6000','Operating Expenses',  'Expense', 'Debit', true, true,  'Overhead and indirect operating costs',     NEW.id);

  -- ── Accounting periods (current month + 11 forward) ───────────────────────
  INSERT INTO public.accounting_periods (
    tenant_id, period_start, period_end, period_name, status
  )
  SELECT
    new_tenant_id,
    gs::date,
    (gs + interval '1 month - 1 day')::date,
    to_char(gs, 'YYYY-MM'),
    'Open'
  FROM generate_series(
    date_trunc('month', CURRENT_DATE)::date,
    (date_trunc('month', CURRENT_DATE) + interval '11 months')::date,
    interval '1 month'
  ) gs;

  RETURN NEW;
END;
$$;
