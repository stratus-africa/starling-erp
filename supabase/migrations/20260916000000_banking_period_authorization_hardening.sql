-- Banking and accounting hardening.
-- bank_accounts.gl_account_id is the authoritative COA relationship.

-- Period changes belong to the firm owner roles only. Do not use the broad
-- accounting.post permission for this administrative operation.
CREATE OR REPLACE FUNCTION public.manage_accounting_period(
  _year integer,
  _month integer,
  _new_status text,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid := public.current_tenant_id();
  v_period_start date := make_date(_year, _month, 1);
  v_period_id uuid;
  v_period_name text := to_char(v_period_start, 'YYYY-MM');
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.tenant_id = v_tenant_id
      AND ur.role::text IN ('tenant_admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized: firm owner access required' USING ERRCODE = '42501';
  END IF;

  IF _new_status NOT IN ('Open', 'Closed', 'Locked') THEN
    RAISE EXCEPTION 'Invalid period status: %', _new_status;
  END IF;

  INSERT INTO public.accounting_periods (
    tenant_id, period_start, period_end, period_name, status,
    closed_at, closed_by, locked_at, locked_by, notes
  ) VALUES (
    v_tenant_id, v_period_start,
    (v_period_start + interval '1 month - 1 day')::date,
    v_period_name, _new_status,
    CASE WHEN _new_status IN ('Closed', 'Locked') THEN now() END,
    CASE WHEN _new_status IN ('Closed', 'Locked') THEN auth.uid() END,
    CASE WHEN _new_status = 'Locked' THEN now() END,
    CASE WHEN _new_status = 'Locked' THEN auth.uid() END,
    _notes
  )
  ON CONFLICT (tenant_id, period_start) DO UPDATE SET
    status = EXCLUDED.status,
    closed_at = CASE WHEN EXCLUDED.status IN ('Closed', 'Locked') THEN COALESCE(accounting_periods.closed_at, now()) ELSE NULL END,
    closed_by = CASE WHEN EXCLUDED.status IN ('Closed', 'Locked') THEN COALESCE(accounting_periods.closed_by, auth.uid()) ELSE NULL END,
    locked_at = CASE WHEN EXCLUDED.status = 'Locked' THEN COALESCE(accounting_periods.locked_at, now()) ELSE NULL END,
    locked_by = CASE WHEN EXCLUDED.status = 'Locked' THEN COALESCE(accounting_periods.locked_by, auth.uid()) ELSE NULL END,
    notes = COALESCE(EXCLUDED.notes, accounting_periods.notes),
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

REVOKE EXECUTE ON FUNCTION public.manage_accounting_period(integer, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manage_accounting_period(integer, integer, text, text) TO authenticated;

-- journal_entries.status is currently text in the authoritative schema. Cast
-- explicitly at the comparison boundary so this remains safe if it becomes an
-- enum later; never apply lower(coalesce(...)) to an enum value.
CREATE OR REPLACE FUNCTION public.post_manual_journal(_journal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  je public.journal_entries;
  line record;
  account record;
  debit_total numeric(14,2) := 0;
  credit_total numeric(14,2) := 0;
  line_count integer := 0;
BEGIN
  IF NOT (public.has_permission('accounting.journal.post') OR public.has_permission('accounting.post')) THEN
    RAISE EXCEPTION 'Not authorized: accounting.journal.post' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO je FROM public.journal_entries
  WHERE id = _journal_id AND tenant_id = public.current_tenant_id() FOR UPDATE;
  IF je.id IS NULL THEN RAISE EXCEPTION 'Journal entry not found'; END IF;
  IF je.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Journal entry has been deleted'; END IF;
  IF je.status::text = 'Posted' THEN RETURN _journal_id; END IF;
  IF je.status::text IN ('Voided', 'Void', 'Reversed') THEN
    RAISE EXCEPTION 'Cannot post a voided journal entry';
  END IF;
  IF je.entry_date IS NULL THEN RAISE EXCEPTION 'Journal entry must have a valid date'; END IF;
  PERFORM public.assert_period_open(public.current_tenant_id(), je.entry_date);

  FOR line IN
    SELECT jl.id, jl.debit, jl.credit, jl.account_id
    FROM public.journal_lines jl
    WHERE jl.journal_id = _journal_id AND jl.tenant_id = public.current_tenant_id()
    ORDER BY jl.created_at, jl.id FOR UPDATE
  LOOP
    line_count := line_count + 1;
    IF line.account_id IS NULL THEN RAISE EXCEPTION 'Journal line % has no account assigned', line_count; END IF;
    SELECT id, name, is_active, allow_manual_posting INTO account
    FROM public.chart_of_accounts
    WHERE id = line.account_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL;
    IF account.id IS NULL THEN RAISE EXCEPTION 'Account on line % does not exist or belongs to another tenant', line_count; END IF;
    IF NOT account.is_active THEN RAISE EXCEPTION 'Account "%" is inactive', account.name; END IF;
    IF NOT account.allow_manual_posting THEN RAISE EXCEPTION 'Account "%" does not allow manual posting (sub-ledger controlled)', account.name; END IF;
    IF COALESCE(line.debit, 0) < 0 OR COALESCE(line.credit, 0) < 0 THEN RAISE EXCEPTION 'Journal line % has a negative amount', line_count; END IF;
    IF COALESCE(line.debit, 0) > 0 AND COALESCE(line.credit, 0) > 0 THEN RAISE EXCEPTION 'Journal line % has both debit and credit', line_count; END IF;
    IF COALESCE(line.debit, 0) = 0 AND COALESCE(line.credit, 0) = 0 THEN RAISE EXCEPTION 'Journal line % has no debit or credit amount', line_count; END IF;
    debit_total := debit_total + COALESCE(line.debit, 0);
    credit_total := credit_total + COALESCE(line.credit, 0);
  END LOOP;
  IF line_count < 2 THEN RAISE EXCEPTION 'Journal must have at least 2 lines (has %)', line_count; END IF;
  IF ABS(debit_total - credit_total) > 0.005 THEN RAISE EXCEPTION 'Journal is unbalanced: debits % != credits %', debit_total, credit_total; END IF;

  UPDATE public.journal_entries
  SET status = 'Posted', total_debit = debit_total, total_credit = credit_total,
      source_ref_type = COALESCE(NULLIF(source_ref_type, ''), 'manual'), updated_at = now()
  WHERE id = _journal_id;
  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (public.current_tenant_id(), 'journal_entry', _journal_id, 'Posted',
          'Manual journal posted; debits ' || debit_total || ', credits ' || credit_total,
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));
  INSERT INTO public.posting_audit_events
    (tenant_id, entity_type, entity_id, action, permission_code, result, actor_id, metadata)
  VALUES (public.current_tenant_id(), 'journal_entry', _journal_id, 'post',
          'accounting.journal.post', 'posted', auth.uid(),
          jsonb_build_object('total_debit', debit_total, 'total_credit', credit_total, 'line_count', line_count))
  ON CONFLICT (tenant_id, entity_type, entity_id, action) DO NOTHING;
  RETURN _journal_id;
END;
$$;

COMMENT ON FUNCTION public.post_manual_journal(uuid)
IS 'Authoritative manual journal posting path. Enforces tenant scope, open accounting periods, active manual-posting accounts, and balanced journal lines.';

REVOKE EXECUTE ON FUNCTION public.post_manual_journal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_manual_journal(uuid) TO authenticated;

-- Keep direct status changes unavailable to non-owners while allowing the
-- RPC above to perform the audited transition under SECURITY DEFINER.
DROP POLICY IF EXISTS "Period managers can modify accounting periods" ON public.accounting_periods;
DROP POLICY IF EXISTS "Firm owners can modify accounting periods" ON public.accounting_periods;
CREATE POLICY "Firm owners can modify accounting periods"
  ON public.accounting_periods FOR ALL TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.tenant_id = public.current_tenant_id()
        AND ur.role::text IN ('tenant_admin', 'super_admin')
    )
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.tenant_id = public.current_tenant_id()
        AND ur.role::text IN ('tenant_admin', 'super_admin')
    )
  );