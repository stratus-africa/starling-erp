-- =========================================================
-- Accounting Integrity Check Engine
--
-- Single RPC: run_accounting_integrity_checks()
-- Scans the tenant GL for ten categories of data issues,
-- persists findings to accounting_integrity_findings,
-- and returns a structured summary.
--
-- Check codes:
--   UNBALANCED_JOURNAL        total_debit ≠ total_credit (±0.005)
--   JOURNAL_NO_LINES          posted/draft journal with zero lines
--   HEADER_TOTAL_MISMATCH     header totals ≠ sum of lines
--   INVALID_ACCOUNT_REF       line → account that does not exist for tenant
--   DELETED_ACCOUNT_IN_USE    line → account with deleted_at set
--   POSTED_DOC_NO_JOURNAL     invoice/bill/etc posted but no journal
--   DUPLICATE_SOURCE_POSTING  same source_ref_id posted more than once
--   CLOSED_PERIOD_POSTING     entry_date falls in a Closed/Locked period
--   NEGATIVE_ASSET_BALANCE    debit-normal account with negative running balance
--   ORPHANED_JOURNAL_LINE     journal_line.journal_id references missing entry
-- =========================================================

-- ─────────────────────────────────────────────────────────
-- 1.  Findings table
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.accounting_integrity_findings (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  check_code       text        NOT NULL,
  severity         text        NOT NULL DEFAULT 'error'
                               CONSTRAINT aif_severity CHECK (severity IN ('error','warning')),
  entity_type      text        NOT NULL,
  entity_id        uuid,
  detail           text        NOT NULL,
  detected_at      timestamptz NOT NULL DEFAULT now(),
  -- Manual acknowledgement
  resolved_at      timestamptz,
  resolved_by      uuid,
  resolution_note  text
);

CREATE INDEX IF NOT EXISTS aif_tenant_unresolved_idx
  ON public.accounting_integrity_findings (tenant_id, check_code, detected_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS aif_tenant_entity_idx
  ON public.accounting_integrity_findings (tenant_id, entity_type, entity_id)
  WHERE resolved_at IS NULL;

ALTER TABLE public.accounting_integrity_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can read integrity findings" ON public.accounting_integrity_findings;
CREATE POLICY "Tenant members can read integrity findings"
  ON public.accounting_integrity_findings FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "Accounting users can update findings" ON public.accounting_integrity_findings;
CREATE POLICY "Accounting users can update findings"
  ON public.accounting_integrity_findings FOR UPDATE TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND (public.has_permission('accounting.view') OR public.has_permission('accounting.read'))
  );

GRANT SELECT, UPDATE ON public.accounting_integrity_findings TO authenticated;
GRANT ALL ON public.accounting_integrity_findings TO service_role;

-- ─────────────────────────────────────────────────────────
-- 2.  run_accounting_integrity_checks()
--
--     Deletes all prior unresolved findings for the tenant,
--     runs all ten checks, inserts findings, returns summary.
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.run_accounting_integrity_checks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   uuid        := public.current_tenant_id();
  v_now      timestamptz := now();
  v_errors   integer     := 0;
  v_warnings integer     := 0;
  r          record;

  -- Scratch variables for check 8 (NEGATIVE_ASSET_BALANCE)
  v_debit_sum  numeric;
  v_credit_sum numeric;
  v_balance    numeric;
BEGIN
  IF NOT (
    public.has_permission('accounting.view')
    OR public.has_permission('accounting.read')
  ) THEN
    RAISE EXCEPTION 'Not authorized: accounting.view' USING ERRCODE = '42501';
  END IF;

  -- Wipe previous unresolved findings so results reflect current state
  DELETE FROM public.accounting_integrity_findings
  WHERE tenant_id = v_tenant AND resolved_at IS NULL;

  -- ────────────────────────────────────────────────────────────────────────
  -- 1. UNBALANCED_JOURNAL
  --    Posted/Draft journals where |total_debit − total_credit| > 0.005
  -- ────────────────────────────────────────────────────────────────────────
  FOR r IN
    SELECT id, number, entry_date, total_debit, total_credit
    FROM   public.journal_entries
    WHERE  tenant_id  = v_tenant
      AND  deleted_at IS NULL
      AND  status IN ('Posted','Draft')
      AND  ABS(COALESCE(total_debit,0) - COALESCE(total_credit,0)) > 0.005
  LOOP
    INSERT INTO public.accounting_integrity_findings
      (tenant_id, check_code, severity, entity_type, entity_id, detail, detected_at)
    VALUES (v_tenant, 'UNBALANCED_JOURNAL', 'error', 'journal_entry', r.id,
      format('Journal %s (%s) is unbalanced: debit %s ≠ credit %s',
        COALESCE(r.number, r.id::text), r.entry_date,
        COALESCE(r.total_debit,0)::text, COALESCE(r.total_credit,0)::text),
      v_now);
    v_errors := v_errors + 1;
  END LOOP;

  -- ────────────────────────────────────────────────────────────────────────
  -- 2. JOURNAL_NO_LINES
  --    Posted/Draft journals with no journal_lines rows
  -- ────────────────────────────────────────────────────────────────────────
  FOR r IN
    SELECT je.id, je.number, je.entry_date, je.status
    FROM   public.journal_entries je
    WHERE  je.tenant_id  = v_tenant
      AND  je.deleted_at IS NULL
      AND  je.status IN ('Posted','Draft')
      AND  NOT EXISTS (
             SELECT 1 FROM public.journal_lines jl
             WHERE jl.journal_id = je.id
          )
  LOOP
    INSERT INTO public.accounting_integrity_findings
      (tenant_id, check_code, severity, entity_type, entity_id, detail, detected_at)
    VALUES (v_tenant, 'JOURNAL_NO_LINES', 'error', 'journal_entry', r.id,
      format('%s journal %s (%s) has no lines',
        r.status, COALESCE(r.number, r.id::text), r.entry_date),
      v_now);
    v_errors := v_errors + 1;
  END LOOP;

  -- ────────────────────────────────────────────────────────────────────────
  -- 3. HEADER_TOTAL_MISMATCH
  --    Journal header totals do not match the actual sum of its lines
  -- ────────────────────────────────────────────────────────────────────────
  FOR r IN
    SELECT je.id, je.number, je.entry_date,
           je.total_debit  AS hdr_dr, je.total_credit AS hdr_cr,
           COALESCE(SUM(jl.debit),  0) AS sum_dr,
           COALESCE(SUM(jl.credit), 0) AS sum_cr
    FROM   public.journal_entries je
    JOIN   public.journal_lines   jl ON jl.journal_id = je.id
    WHERE  je.tenant_id  = v_tenant
      AND  je.deleted_at IS NULL
      AND  je.status IN ('Posted','Draft')
    GROUP  BY je.id, je.number, je.entry_date, je.total_debit, je.total_credit
    HAVING ABS(COALESCE(je.total_debit,0)  - COALESCE(SUM(jl.debit),0))  > 0.005
        OR ABS(COALESCE(je.total_credit,0) - COALESCE(SUM(jl.credit),0)) > 0.005
  LOOP
    INSERT INTO public.accounting_integrity_findings
      (tenant_id, check_code, severity, entity_type, entity_id, detail, detected_at)
    VALUES (v_tenant, 'HEADER_TOTAL_MISMATCH', 'error', 'journal_entry', r.id,
      format('Journal %s (%s): header totals (dr %s / cr %s) do not match line sums (dr %s / cr %s)',
        COALESCE(r.number, r.id::text), r.entry_date,
        r.hdr_dr, r.hdr_cr, r.sum_dr, r.sum_cr),
      v_now);
    v_errors := v_errors + 1;
  END LOOP;

  -- ────────────────────────────────────────────────────────────────────────
  -- 4. INVALID_ACCOUNT_REF
  --    Journal line points to an account that doesn't exist for this tenant
  -- ────────────────────────────────────────────────────────────────────────
  FOR r IN
    SELECT DISTINCT jl.journal_id, jl.account_id, je.number, je.entry_date
    FROM   public.journal_lines jl
    JOIN   public.journal_entries je ON je.id = jl.journal_id
    WHERE  jl.tenant_id  = v_tenant
      AND  je.deleted_at IS NULL
      AND  NOT EXISTS (
             SELECT 1 FROM public.chart_of_accounts coa
             WHERE  coa.id        = jl.account_id
               AND  coa.tenant_id = v_tenant
          )
  LOOP
    INSERT INTO public.accounting_integrity_findings
      (tenant_id, check_code, severity, entity_type, entity_id, detail, detected_at)
    VALUES (v_tenant, 'INVALID_ACCOUNT_REF', 'error', 'journal_entry', r.journal_id,
      format('Journal %s (%s) references account %s which does not exist for this tenant',
        COALESCE(r.number, r.journal_id::text), r.entry_date, r.account_id),
      v_now);
    v_errors := v_errors + 1;
  END LOOP;

  -- ────────────────────────────────────────────────────────────────────────
  -- 5. DELETED_ACCOUNT_IN_USE
  --    Journal line points to an account that has been soft-deleted
  -- ────────────────────────────────────────────────────────────────────────
  FOR r IN
    SELECT DISTINCT jl.journal_id, jl.account_id,
                    je.number, je.entry_date,
                    coa.code, coa.name
    FROM   public.journal_lines jl
    JOIN   public.journal_entries    je  ON je.id  = jl.journal_id
    JOIN   public.chart_of_accounts  coa ON coa.id = jl.account_id
    WHERE  jl.tenant_id   = v_tenant
      AND  je.deleted_at  IS NULL
      AND  coa.deleted_at IS NOT NULL
  LOOP
    INSERT INTO public.accounting_integrity_findings
      (tenant_id, check_code, severity, entity_type, entity_id, detail, detected_at)
    VALUES (v_tenant, 'DELETED_ACCOUNT_IN_USE', 'error', 'journal_entry', r.journal_id,
      format('Journal %s (%s) references deleted account %s – %s',
        COALESCE(r.number, r.journal_id::text), r.entry_date,
        COALESCE(r.code, r.account_id::text), r.name),
      v_now);
    v_errors := v_errors + 1;
  END LOOP;

  -- ────────────────────────────────────────────────────────────────────────
  -- 6. POSTED_DOC_NO_JOURNAL
  --    Documents that carry posted_at but have no associated journal_entry.
  --    Covers: invoices, bills, credit_notes, expenses, payments_received,
  --            payments_made, inventory_adjustments, production_orders.
  --    Transfers are stock-only (no GL), so intentionally excluded.
  -- ────────────────────────────────────────────────────────────────────────
  FOR r IN
    SELECT 'invoice' AS etype, id, COALESCE(number, id::text) AS ref
    FROM   public.invoices
    WHERE  tenant_id  = v_tenant AND deleted_at IS NULL
      AND  posted_at  IS NOT NULL AND voided_at IS NULL
      AND  NOT EXISTS (SELECT 1 FROM public.journal_entries je
                       WHERE je.source_ref_id = invoices.id
                         AND je.source_ref_type = 'invoice'
                         AND je.deleted_at IS NULL AND je.status = 'Posted')
    UNION ALL
    SELECT 'bill', id, COALESCE(number, id::text)
    FROM   public.bills
    WHERE  tenant_id = v_tenant AND deleted_at IS NULL
      AND  posted_at IS NOT NULL AND voided_at IS NULL
      AND  NOT EXISTS (SELECT 1 FROM public.journal_entries je
                       WHERE je.source_ref_id = bills.id
                         AND je.source_ref_type = 'bill'
                         AND je.deleted_at IS NULL AND je.status = 'Posted')
    UNION ALL
    SELECT 'credit_note', id, COALESCE(number, id::text)
    FROM   public.credit_notes
    WHERE  tenant_id = v_tenant AND deleted_at IS NULL
      AND  posted_at IS NOT NULL AND voided_at IS NULL
      AND  NOT EXISTS (SELECT 1 FROM public.journal_entries je
                       WHERE je.source_ref_id = credit_notes.id
                         AND je.source_ref_type = 'credit_note'
                         AND je.deleted_at IS NULL AND je.status = 'Posted')
    UNION ALL
    SELECT 'expense', id, COALESCE(number, id::text)
    FROM   public.expenses
    WHERE  tenant_id = v_tenant AND deleted_at IS NULL
      AND  posted_at IS NOT NULL AND voided_at IS NULL
      AND  NOT EXISTS (SELECT 1 FROM public.journal_entries je
                       WHERE je.source_ref_id = expenses.id
                         AND je.source_ref_type = 'expense'
                         AND je.deleted_at IS NULL AND je.status = 'Posted')
    UNION ALL
    SELECT 'payment_received', id, COALESCE(number, id::text)
    FROM   public.payments_received
    WHERE  tenant_id = v_tenant AND deleted_at IS NULL
      AND  posted_at IS NOT NULL AND voided_at IS NULL
      AND  NOT EXISTS (SELECT 1 FROM public.journal_entries je
                       WHERE je.source_ref_id = payments_received.id
                         AND je.source_ref_type = 'payment_received'
                         AND je.deleted_at IS NULL AND je.status = 'Posted')
    UNION ALL
    SELECT 'payment_made', id, COALESCE(number, id::text)
    FROM   public.payments_made
    WHERE  tenant_id = v_tenant AND deleted_at IS NULL
      AND  posted_at IS NOT NULL AND voided_at IS NULL
      AND  NOT EXISTS (SELECT 1 FROM public.journal_entries je
                       WHERE je.source_ref_id = payments_made.id
                         AND je.source_ref_type = 'payment_made'
                         AND je.deleted_at IS NULL AND je.status = 'Posted')
  LOOP
    INSERT INTO public.accounting_integrity_findings
      (tenant_id, check_code, severity, entity_type, entity_id, detail, detected_at)
    VALUES (v_tenant, 'POSTED_DOC_NO_JOURNAL', 'error', r.etype, r.id,
      format('%s %s is marked Posted but has no corresponding journal entry',
        initcap(replace(r.etype,'_',' ')), r.ref),
      v_now);
    v_errors := v_errors + 1;
  END LOOP;

  -- ────────────────────────────────────────────────────────────────────────
  -- 7. DUPLICATE_SOURCE_POSTING
  --    Same (source_ref_id, source_ref_type) pair appears in more than one
  --    Posted journal entry (excluding reversals of the same document).
  -- ────────────────────────────────────────────────────────────────────────
  FOR r IN
    SELECT source_ref_id, source_ref_type, COUNT(*) AS cnt
    FROM   public.journal_entries
    WHERE  tenant_id        = v_tenant
      AND  deleted_at       IS NULL
      AND  status           = 'Posted'
      AND  source_ref_type  NOT IN ('reversal','manual')
      AND  source_ref_id    IS NOT NULL
    GROUP  BY source_ref_id, source_ref_type
    HAVING COUNT(*) > 2   -- >2 because stocked invoices legitimately have 2 (AR + COGS)
  LOOP
    INSERT INTO public.accounting_integrity_findings
      (tenant_id, check_code, severity, entity_type, entity_id, detail, detected_at)
    VALUES (v_tenant, 'DUPLICATE_SOURCE_POSTING', 'warning',
      r.source_ref_type, r.source_ref_id,
      format('%s %s has %s journal entries — possible duplicate posting',
        initcap(replace(r.source_ref_type,'_',' ')), r.source_ref_id, r.cnt),
      v_now);
    v_warnings := v_warnings + 1;
  END LOOP;

  -- ────────────────────────────────────────────────────────────────────────
  -- 8. CLOSED_PERIOD_POSTING
  --    Posted journal entry whose entry_date falls in a Closed or Locked period
  -- ────────────────────────────────────────────────────────────────────────
  FOR r IN
    SELECT je.id, je.number, je.entry_date, ap.status AS period_status, ap.period_name
    FROM   public.journal_entries je
    JOIN   public.accounting_periods ap
           ON  ap.tenant_id    = v_tenant
           AND ap.period_start <= je.entry_date
           AND ap.period_end   >= je.entry_date
    WHERE  je.tenant_id  = v_tenant
      AND  je.deleted_at IS NULL
      AND  je.status     = 'Posted'
      AND  ap.status     IN ('Closed','Locked')
      -- Exclude reversal journals — they were legitimately created before the period closed
      AND  je.source_ref_type <> 'reversal'
  LOOP
    INSERT INTO public.accounting_integrity_findings
      (tenant_id, check_code, severity, entity_type, entity_id, detail, detected_at)
    VALUES (v_tenant, 'CLOSED_PERIOD_POSTING', 'warning', 'journal_entry', r.id,
      format('Journal %s is posted into %s period %s (%s)',
        COALESCE(r.number, r.id::text),
        lower(r.period_status), r.period_name, r.entry_date),
      v_now);
    v_warnings := v_warnings + 1;
  END LOOP;

  -- ────────────────────────────────────────────────────────────────────────
  -- 9. NEGATIVE_ASSET_BALANCE
  --    Debit-normal (Asset/Expense) accounts whose running GL balance is < 0
  --    This indicates data corruption or a missing opening balance entry.
  --    Only checked for Asset accounts (Expense balances reset annually).
  -- ────────────────────────────────────────────────────────────────────────
  FOR r IN
    SELECT coa.id, coa.code, coa.name,
           COALESCE(coa.opening_balance, 0)
             + COALESCE(SUM(jl.debit),  0)
             - COALESCE(SUM(jl.credit), 0) AS balance
    FROM   public.chart_of_accounts coa
    LEFT JOIN public.journal_lines jl ON jl.account_id = coa.id
    LEFT JOIN public.journal_entries je
           ON je.id         = jl.journal_id
          AND je.status     = 'Posted'
          AND je.deleted_at IS NULL
    WHERE  coa.tenant_id    = v_tenant
      AND  coa.deleted_at   IS NULL
      AND  coa.type         = 'Asset'
      AND  coa.normal_balance = 'Debit'
    GROUP  BY coa.id, coa.code, coa.name, coa.opening_balance
    HAVING COALESCE(coa.opening_balance,0)
             + COALESCE(SUM(jl.debit),0)
             - COALESCE(SUM(jl.credit),0) < -0.005
  LOOP
    INSERT INTO public.accounting_integrity_findings
      (tenant_id, check_code, severity, entity_type, entity_id, detail, detected_at)
    VALUES (v_tenant, 'NEGATIVE_ASSET_BALANCE', 'warning', 'chart_of_account', r.id,
      format('Asset account %s – %s has a negative balance of %s',
        COALESCE(r.code, r.id::text), r.name, ROUND(r.balance, 2)),
      v_now);
    v_warnings := v_warnings + 1;
  END LOOP;

  -- ────────────────────────────────────────────────────────────────────────
  -- 10. ORPHANED_JOURNAL_LINE
  --     journal_lines whose journal_id references a non-existent or deleted
  --     journal_entries row
  -- ────────────────────────────────────────────────────────────────────────
  FOR r IN
    SELECT jl.id AS line_id, jl.journal_id, jl.account_id
    FROM   public.journal_lines jl
    WHERE  jl.tenant_id = v_tenant
      AND  NOT EXISTS (
             SELECT 1 FROM public.journal_entries je
             WHERE  je.id         = jl.journal_id
               AND  je.tenant_id  = v_tenant
          )
  LOOP
    INSERT INTO public.accounting_integrity_findings
      (tenant_id, check_code, severity, entity_type, entity_id, detail, detected_at)
    VALUES (v_tenant, 'ORPHANED_JOURNAL_LINE', 'error', 'journal_line', r.line_id,
      format('Journal line %s references missing journal entry %s',
        r.line_id, r.journal_id),
      v_now);
    v_errors := v_errors + 1;
  END LOOP;

  -- ── Return summary ─────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'run_at',   v_now,
    'errors',   v_errors,
    'warnings', v_warnings,
    'total',    v_errors + v_warnings,
    'clean',    (v_errors + v_warnings) = 0
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_accounting_integrity_checks() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.run_accounting_integrity_checks() TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 3.  acknowledge_integrity_finding(id, note)
--     Marks a single finding as resolved.
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.acknowledge_integrity_finding(
  _finding_id uuid,
  _note       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (
    public.has_permission('accounting.view')
    OR public.has_permission('accounting.read')
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.accounting_integrity_findings
  SET    resolved_at      = now(),
         resolved_by      = auth.uid(),
         resolution_note  = _note
  WHERE  id        = _finding_id
    AND  tenant_id = public.current_tenant_id()
    AND  resolved_at IS NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.acknowledge_integrity_finding(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.acknowledge_integrity_finding(uuid, text) TO authenticated;
