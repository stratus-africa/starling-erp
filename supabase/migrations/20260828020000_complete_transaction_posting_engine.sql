-- =========================================================
-- Complete Transaction Posting Engine
--
-- Every ERP transaction that moves money or inventory now
-- creates a balanced journal entry automatically on posting.
--
-- Documents covered:
--   Invoice        DR Accounts Receivable / CR Sales Revenue
--                  DR COGS / CR Inventory  (if stocked item)
--   Bill           DR Inventory or Expense / CR Accounts Payable
--   Credit Note    Reverses invoice journal (AR/Revenue/COGS/Inv)
--   Payment Rcvd   DR Cash / CR Accounts Receivable
--   Payment Made   DR Accounts Payable / CR Cash
--   Expense        DR Expense account / CR Cash or AP
--   Adj/Transfer/Production — existing logic, hardened & standardised
--
-- Architecture:
--   *_unchecked(id) — pure accounting logic, called inside a transaction
--   post_*(id)      — secure public wrapper (permission + lock + validate)
--   validate_posting_target extended to accept new document types
-- =========================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0.  Extend validate_posting_target whitelist to include payment/expense tables
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_posting_target(
  _table_name text,
  _document_id uuid,
  _permission text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id  uuid;
  v_status     text;
  v_posted_at  timestamptz;
  v_deleted_at timestamptz;
BEGIN
  IF NOT public.has_permission(_permission) THEN
    RAISE EXCEPTION 'Not authorized: %', _permission USING ERRCODE = '42501';
  END IF;

  IF _table_name NOT IN (
    'invoices', 'bills', 'credit_notes', 'shipments', 'packages',
    'inventory_adjustments', 'inventory_transfers', 'production_orders',
    'payments_received', 'payments_made', 'expenses'
  ) THEN
    RAISE EXCEPTION 'Unsupported posting document: %', _table_name;
  END IF;

  EXECUTE format(
    'SELECT tenant_id, status, posted_at, deleted_at FROM public.%I WHERE id = $1 FOR UPDATE',
    _table_name
  )
  INTO v_tenant_id, v_status, v_posted_at, v_deleted_at
  USING _document_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '% not found', _table_name;
  END IF;

  IF v_tenant_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'Tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION '% has been deleted', _table_name;
  END IF;

  -- Already posted → idempotent return
  IF v_posted_at IS NOT NULL THEN
    RETURN false;
  END IF;

  IF lower(COALESCE(v_status, '')) IN (
    'posted', 'completed', 'cancelled', 'canceled', 'voided', 'rejected'
  ) THEN
    RAISE EXCEPTION '% cannot be posted from status %',
      _table_name, COALESCE(v_status, 'NULL');
  END IF;

  RETURN true;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: emit one balanced journal entry with N lines.
-- Returns the new journal_entries.id.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._emit_journal(
  _tenant_id      uuid,
  _entry_date     date,
  _memo           text,
  _source_type    text,
  _source_id      uuid,
  _lines          jsonb   -- array of {account_id, debit, credit, memo}
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  j_id     uuid;
  tot_dr   numeric(14,2) := 0;
  tot_cr   numeric(14,2) := 0;
  line     jsonb;
BEGIN
  -- Sum the lines first so we can set header totals atomically
  FOR line IN SELECT * FROM jsonb_array_elements(_lines)
  LOOP
    tot_dr := tot_dr + COALESCE((line->>'debit')::numeric,  0);
    tot_cr := tot_cr + COALESCE((line->>'credit')::numeric, 0);
  END LOOP;

  IF ABS(tot_dr - tot_cr) > 0.005 THEN
    RAISE EXCEPTION '_emit_journal called with unbalanced lines: debit %, credit % (source % %)',
      tot_dr, tot_cr, _source_type, _source_id;
  END IF;

  -- Skip zero-value journals (no financial movement)
  IF tot_dr = 0 AND tot_cr = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.journal_entries (
    tenant_id, entry_date, memo, source_ref_type, source_ref_id,
    total_debit, total_credit, status, created_by
  ) VALUES (
    _tenant_id, _entry_date, _memo, _source_type, _source_id,
    tot_dr, tot_cr, 'Posted', auth.uid()
  ) RETURNING id INTO j_id;

  FOR line IN SELECT * FROM jsonb_array_elements(_lines)
  LOOP
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  post_invoice_unchecked
--
--     DR Accounts Receivable (1100)   grand_total
--       CR Sales Revenue (4000)         subtotal
--       CR Tax Liability / Revenue      tax_total  (mapped to 4000 if no tax acct)
--
--     For each line with a stocked item:
--       DR COGS (5000)                  qty × item.cost
--         CR Inventory (1200)             qty × item.cost
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_invoice_unchecked(_invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inv        record;
  ar_acct    uuid;
  rev_acct   uuid;
  cogs_acct  uuid;
  inv_acct   uuid;
  line       record;
  cogs_val   numeric(14,2);
  tot_cogs   numeric(14,2) := 0;
  j_id       uuid;
BEGIN
  SELECT * INTO inv FROM public.invoices
  WHERE id = _invoice_id AND deleted_at IS NULL;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;

  ar_acct   := public._account_id(inv.tenant_id, '1100');
  rev_acct  := public._account_id(inv.tenant_id, '4000');
  cogs_acct := public._account_id(inv.tenant_id, '5000');
  inv_acct  := public._account_id(inv.tenant_id, '1200');

  IF ar_acct  IS NULL THEN RAISE EXCEPTION 'Account 1100 (Accounts Receivable) not found for tenant'; END IF;
  IF rev_acct IS NULL THEN RAISE EXCEPTION 'Account 4000 (Sales Revenue) not found for tenant'; END IF;

  -- Revenue journal: AR debit, Revenue credit (on full grand_total)
  PERFORM public._emit_journal(
    inv.tenant_id,
    COALESCE(inv.date, CURRENT_DATE),
    'Invoice ' || COALESCE(inv.number, inv.id::text),
    'invoice',
    inv.id,
    jsonb_build_array(
      jsonb_build_object('account_id', ar_acct,  'debit',  inv.grand_total, 'credit', 0, 'memo', 'AR – ' || COALESCE(inv.number,'')),
      jsonb_build_object('account_id', rev_acct, 'debit',  0, 'credit', inv.grand_total, 'memo', 'Revenue – ' || COALESCE(inv.number,''))
    )
  );

  -- COGS journal: one entry per stocked line item
  IF cogs_acct IS NOT NULL AND inv_acct IS NOT NULL THEN
    FOR line IN
      SELECT il.quantity, il.line_total,
             i.cost AS item_cost, i.type AS item_type
      FROM public.invoice_lines il
      JOIN public.items i ON i.id = il.item_id
      WHERE il.document_id = _invoice_id
        AND il.deleted_at IS NULL
        AND il.item_id IS NOT NULL
        AND i.type IN ('Product', 'product', 'Stocked', 'stocked', 'Inventory', 'inventory')
    LOOP
      cogs_val := ROUND(
        COALESCE(line.quantity, 0) * COALESCE(line.item_cost, 0),
        2
      );
      tot_cogs := tot_cogs + cogs_val;
    END LOOP;

    IF tot_cogs > 0 THEN
      PERFORM public._emit_journal(
        inv.tenant_id,
        COALESCE(inv.date, CURRENT_DATE),
        'COGS – Invoice ' || COALESCE(inv.number, inv.id::text),
        'invoice',
        inv.id,
        jsonb_build_array(
          jsonb_build_object('account_id', cogs_acct, 'debit',  tot_cogs, 'credit', 0,        'memo', 'COGS'),
          jsonb_build_object('account_id', inv_acct,  'debit',  0,        'credit', tot_cogs, 'memo', 'Inventory out')
        )
      );
    END IF;
  END IF;

  UPDATE public.invoices
  SET status = 'Posted', posted_at = now()
  WHERE id = _invoice_id;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (inv.tenant_id, 'invoice', inv.id, 'Posted',
          'Invoice posted; AR and revenue journals created',
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));

  RETURN _invoice_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_invoice_unchecked(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  post_bill_unchecked
--
--     For each line:
--       If item is stocked:  DR Inventory (1200) / CR AP (2000)
--       Otherwise:           DR Expense (account_id or 6000) / CR AP (2000)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_bill_unchecked(_bill_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  bill       record;
  ap_acct    uuid;
  inv_acct   uuid;
  exp_acct   uuid;
  line       record;
  dr_lines   jsonb := '[]'::jsonb;
  cr_total   numeric(14,2) := 0;
  line_val   numeric(14,2);
  acct_to_dr uuid;
BEGIN
  SELECT * INTO bill FROM public.bills
  WHERE id = _bill_id AND deleted_at IS NULL;
  IF bill.id IS NULL THEN RAISE EXCEPTION 'Bill not found'; END IF;

  ap_acct  := public._account_id(bill.tenant_id, '2000');
  inv_acct := public._account_id(bill.tenant_id, '1200');
  exp_acct := public._account_id(bill.tenant_id, '6000');

  IF ap_acct IS NULL THEN RAISE EXCEPTION 'Account 2000 (Accounts Payable) not found for tenant'; END IF;

  FOR line IN
    SELECT bl.line_total, bl.item_id, bl.description,
           i.type AS item_type
    FROM public.bill_lines bl
    LEFT JOIN public.items i ON i.id = bl.item_id
    WHERE bl.document_id = _bill_id AND bl.deleted_at IS NULL
  LOOP
    line_val := COALESCE(line.line_total, 0);
    IF line_val = 0 THEN CONTINUE; END IF;

    -- Stocked items go to Inventory; everything else to Expense
    IF line.item_id IS NOT NULL
       AND line.item_type IN ('Product','product','Stocked','stocked','Inventory','inventory')
       AND inv_acct IS NOT NULL
    THEN
      acct_to_dr := inv_acct;
    ELSE
      acct_to_dr := COALESCE(exp_acct, inv_acct);
    END IF;

    dr_lines := dr_lines || jsonb_build_object(
      'account_id', acct_to_dr,
      'debit',  line_val,
      'credit', 0,
      'memo',   COALESCE(line.description, 'Bill line')
    );
    cr_total := cr_total + line_val;
  END LOOP;

  -- If no lines, fall back to bill grand_total against expense
  IF cr_total = 0 THEN
    cr_total := COALESCE(bill.grand_total, 0);
    dr_lines := jsonb_build_array(
      jsonb_build_object('account_id', COALESCE(exp_acct, inv_acct),
                         'debit', cr_total, 'credit', 0, 'memo', 'Bill total')
    );
  END IF;

  -- Add the AP credit line to close the journal
  dr_lines := dr_lines || jsonb_build_object(
    'account_id', ap_acct, 'debit', 0, 'credit', cr_total,
    'memo', 'AP – ' || COALESCE(bill.number, '')
  );

  PERFORM public._emit_journal(
    bill.tenant_id,
    COALESCE(bill.date, CURRENT_DATE),
    'Bill ' || COALESCE(bill.number, bill.id::text),
    'bill', bill.id, dr_lines
  );

  UPDATE public.bills SET status = 'Posted', posted_at = now() WHERE id = _bill_id;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (bill.tenant_id, 'bill', bill.id, 'Posted',
          'Bill posted; inventory/expense and AP journals created',
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));

  RETURN _bill_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_bill_unchecked(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.  post_credit_note_unchecked
--
--     Reversal of invoice:
--       DR Sales Revenue (4000)          grand_total
--         CR Accounts Receivable (1100)    grand_total
--
--     If stocked items involved:
--       DR Inventory (1200)              cogs_value
--         CR COGS (5000)                   cogs_value
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_credit_note_unchecked(_credit_note_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cn         record;
  ar_acct    uuid;
  rev_acct   uuid;
  cogs_acct  uuid;
  inv_acct   uuid;
  line       record;
  tot_cogs   numeric(14,2) := 0;
BEGIN
  SELECT * INTO cn FROM public.credit_notes
  WHERE id = _credit_note_id AND deleted_at IS NULL;
  IF cn.id IS NULL THEN RAISE EXCEPTION 'Credit note not found'; END IF;

  ar_acct   := public._account_id(cn.tenant_id, '1100');
  rev_acct  := public._account_id(cn.tenant_id, '4000');
  cogs_acct := public._account_id(cn.tenant_id, '5000');
  inv_acct  := public._account_id(cn.tenant_id, '1200');

  IF ar_acct  IS NULL THEN RAISE EXCEPTION 'Account 1100 (AR) not found for tenant'; END IF;
  IF rev_acct IS NULL THEN RAISE EXCEPTION 'Account 4000 (Revenue) not found for tenant'; END IF;

  PERFORM public._emit_journal(
    cn.tenant_id,
    COALESCE(cn.date, CURRENT_DATE),
    'Credit Note ' || COALESCE(cn.number, cn.id::text),
    'credit_note', cn.id,
    jsonb_build_array(
      jsonb_build_object('account_id', rev_acct, 'debit',  cn.grand_total, 'credit', 0,             'memo', 'Revenue reversal'),
      jsonb_build_object('account_id', ar_acct,  'debit',  0,              'credit', cn.grand_total, 'memo', 'AR reduction')
    )
  );

  -- Inventory reinstatement for stocked lines
  IF cogs_acct IS NOT NULL AND inv_acct IS NOT NULL THEN
    FOR line IN
      SELECT cnl.quantity, i.cost AS item_cost
      FROM public.credit_note_lines cnl
      JOIN public.items i ON i.id = cnl.item_id
      WHERE cnl.document_id = _credit_note_id
        AND cnl.deleted_at IS NULL
        AND cnl.item_id IS NOT NULL
        AND i.type IN ('Product','product','Stocked','stocked','Inventory','inventory')
    LOOP
      tot_cogs := tot_cogs + ROUND(COALESCE(line.quantity,0) * COALESCE(line.item_cost,0), 2);
    END LOOP;

    IF tot_cogs > 0 THEN
      PERFORM public._emit_journal(
        cn.tenant_id,
        COALESCE(cn.date, CURRENT_DATE),
        'COGS reversal – Credit Note ' || COALESCE(cn.number, cn.id::text),
        'credit_note', cn.id,
        jsonb_build_array(
          jsonb_build_object('account_id', inv_acct,  'debit',  tot_cogs, 'credit', 0,        'memo', 'Inventory returned'),
          jsonb_build_object('account_id', cogs_acct, 'debit',  0,        'credit', tot_cogs, 'memo', 'COGS reversal')
        )
      );
    END IF;
  END IF;

  UPDATE public.credit_notes SET status = 'Posted', posted_at = now() WHERE id = _credit_note_id;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (cn.tenant_id, 'credit_note', cn.id, 'Posted',
          'Credit note posted; revenue and AR reversal journals created',
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));

  RETURN _credit_note_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_credit_note_unchecked(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.  post_payment_received_unchecked
--
--     DR Cash (1000)                    amount
--       CR Accounts Receivable (1100)     amount
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_payment_received_unchecked(_payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pmt       record;
  cash_acct uuid;
  ar_acct   uuid;
  pmt_amt   numeric(14,2);
BEGIN
  SELECT * INTO pmt FROM public.payments_received
  WHERE id = _payment_id AND deleted_at IS NULL;
  IF pmt.id IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;

  cash_acct := public._account_id(pmt.tenant_id, '1000');
  ar_acct   := public._account_id(pmt.tenant_id, '1100');
  pmt_amt   := COALESCE(pmt.amount, 0);

  IF cash_acct IS NULL THEN RAISE EXCEPTION 'Account 1000 (Cash) not found for tenant'; END IF;
  IF ar_acct   IS NULL THEN RAISE EXCEPTION 'Account 1100 (AR) not found for tenant'; END IF;
  IF pmt_amt  <= 0     THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;

  PERFORM public._emit_journal(
    pmt.tenant_id,
    COALESCE(pmt.date, CURRENT_DATE),
    'Payment received ' || COALESCE(pmt.number, pmt.id::text),
    'payment_received', pmt.id,
    jsonb_build_array(
      jsonb_build_object('account_id', cash_acct, 'debit',  pmt_amt, 'credit', 0,       'memo', 'Cash in'),
      jsonb_build_object('account_id', ar_acct,   'debit',  0,       'credit', pmt_amt, 'memo', 'AR cleared')
    )
  );

  UPDATE public.payments_received
  SET status = 'Posted', posted_at = now()
  WHERE id = _payment_id;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (pmt.tenant_id, 'payment_received', pmt.id, 'Posted',
          'Payment received posted; Cash DR / AR CR',
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));

  RETURN _payment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_payment_received_unchecked(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.  post_payment_made_unchecked
--
--     DR Accounts Payable (2000)        amount
--       CR Cash (1000)                    amount
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_payment_made_unchecked(_payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pmt      record;
  ap_acct  uuid;
  cash_acct uuid;
  pmt_amt  numeric(14,2);
BEGIN
  SELECT * INTO pmt FROM public.payments_made
  WHERE id = _payment_id AND deleted_at IS NULL;
  IF pmt.id IS NULL THEN RAISE EXCEPTION 'Payment made not found'; END IF;

  ap_acct   := public._account_id(pmt.tenant_id, '2000');
  cash_acct := public._account_id(pmt.tenant_id, '1000');
  pmt_amt   := COALESCE(pmt.amount, 0);

  IF ap_acct   IS NULL THEN RAISE EXCEPTION 'Account 2000 (AP) not found for tenant'; END IF;
  IF cash_acct IS NULL THEN RAISE EXCEPTION 'Account 1000 (Cash) not found for tenant'; END IF;
  IF pmt_amt  <= 0     THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;

  PERFORM public._emit_journal(
    pmt.tenant_id,
    COALESCE(pmt.date, CURRENT_DATE),
    'Payment made ' || COALESCE(pmt.number, pmt.id::text),
    'payment_made', pmt.id,
    jsonb_build_array(
      jsonb_build_object('account_id', ap_acct,   'debit',  pmt_amt, 'credit', 0,       'memo', 'AP cleared'),
      jsonb_build_object('account_id', cash_acct, 'debit',  0,       'credit', pmt_amt, 'memo', 'Cash out')
    )
  );

  UPDATE public.payments_made
  SET status = 'Posted', posted_at = now()
  WHERE id = _payment_id;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (pmt.tenant_id, 'payment_made', pmt.id, 'Posted',
          'Payment made posted; AP DR / Cash CR',
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));

  RETURN _payment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_payment_made_unchecked(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6.  post_expense_unchecked
--
--     DR Expense account (account_id or 6000)    total
--       CR Cash (1000) if bank_account_id set,
--         else CR AP (2000)                        total
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_expense_unchecked(_expense_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  exp        record;
  dr_acct    uuid;
  cr_acct    uuid;
  exp_total  numeric(14,2);
BEGIN
  SELECT * INTO exp FROM public.expenses
  WHERE id = _expense_id AND deleted_at IS NULL;
  IF exp.id IS NULL THEN RAISE EXCEPTION 'Expense not found'; END IF;

  exp_total := COALESCE(exp.total, exp.amount, 0);
  IF exp_total <= 0 THEN RAISE EXCEPTION 'Expense total must be greater than zero'; END IF;

  -- Debit: use the expense's assigned account, fall back to 6000 Operating Expenses
  dr_acct := COALESCE(
    exp.account_id,
    public._account_id(exp.tenant_id, '6000')
  );
  IF dr_acct IS NULL THEN
    RAISE EXCEPTION 'No expense account found (set account_id or ensure account 6000 exists)';
  END IF;

  -- Credit: Cash if paid via bank account, AP if on account
  IF exp.bank_account_id IS NOT NULL THEN
    cr_acct := public._account_id(exp.tenant_id, '1000');
    IF cr_acct IS NULL THEN RAISE EXCEPTION 'Account 1000 (Cash) not found for tenant'; END IF;
  ELSE
    cr_acct := public._account_id(exp.tenant_id, '2000');
    IF cr_acct IS NULL THEN RAISE EXCEPTION 'Account 2000 (AP) not found for tenant'; END IF;
  END IF;

  PERFORM public._emit_journal(
    exp.tenant_id,
    exp.date::date,
    'Expense ' || COALESCE(exp.number, exp.id::text),
    'expense', exp.id,
    jsonb_build_array(
      jsonb_build_object('account_id', dr_acct, 'debit',  exp_total, 'credit', 0,         'memo', COALESCE(exp.category, 'Expense')),
      jsonb_build_object('account_id', cr_acct, 'debit',  0,         'credit', exp_total, 'memo', CASE WHEN exp.bank_account_id IS NOT NULL THEN 'Cash/Bank' ELSE 'AP' END)
    )
  );

  UPDATE public.expenses
  SET status = 'Posted', posted_at = now()
  WHERE id = _expense_id;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (exp.tenant_id, 'expense', exp.id, 'Posted',
          'Expense posted; expense DR / ' ||
            CASE WHEN exp.bank_account_id IS NOT NULL THEN 'Cash CR' ELSE 'AP CR' END,
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));

  RETURN _expense_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_expense_unchecked(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7.  Harden existing unchecked functions with the _emit_journal helper
--     (adjustment and production already work; we add number sequence to memo)
--
--     post_adjustment_unchecked — already correct, just re-register
--     post_production_order_unchecked — already correct, just re-register
-- ─────────────────────────────────────────────────────────────────────────────

-- Re-register adjustment with _emit_journal helper for consistency
CREATE OR REPLACE FUNCTION public.post_adjustment_unchecked(_adjustment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  adj       record;
  inv_acct  uuid;
  var_acct  uuid;
  val       numeric(14,2);
BEGIN
  SELECT * INTO adj FROM public.inventory_adjustments
  WHERE id = _adjustment_id AND deleted_at IS NULL;
  IF adj.id IS NULL THEN RAISE EXCEPTION 'Adjustment not found'; END IF;

  inv_acct := public._account_id(adj.tenant_id, '1200');
  var_acct := public._account_id(adj.tenant_id, '6000');

  val := ROUND(
    COALESCE(adj.quantity, 0) *
    COALESCE((SELECT cost FROM public.items WHERE id = adj.item_id), 0),
    2
  );

  -- Stock movement
  INSERT INTO public.stock_movements (
    tenant_id, item_id, warehouse_id, quantity, unit_cost,
    ref_type, ref_id, note, created_by
  )
  SELECT adj.tenant_id, adj.item_id, adj.warehouse_id, adj.quantity,
         COALESCE(i.cost, 0), 'adjustment', adj.id,
         'Adjustment ' || COALESCE(adj.number, ''), auth.uid()
  FROM public.items i WHERE i.id = adj.item_id;

  -- Journal (only when there's monetary value)
  IF val <> 0 AND inv_acct IS NOT NULL AND var_acct IS NOT NULL THEN
    IF val > 0 THEN
      -- Positive adjustment: inventory IN, variance CR
      PERFORM public._emit_journal(
        adj.tenant_id, adj.date::date,
        'Adjustment ' || COALESCE(adj.number, ''), 'adjustment', adj.id,
        jsonb_build_array(
          jsonb_build_object('account_id', inv_acct, 'debit',  val, 'credit', 0,   'memo', 'Inventory IN'),
          jsonb_build_object('account_id', var_acct, 'debit',  0,   'credit', val, 'memo', 'Inventory variance CR')
        )
      );
    ELSE
      -- Negative adjustment: inventory OUT, variance DR
      PERFORM public._emit_journal(
        adj.tenant_id, adj.date::date,
        'Adjustment ' || COALESCE(adj.number, ''), 'adjustment', adj.id,
        jsonb_build_array(
          jsonb_build_object('account_id', var_acct, 'debit',  ABS(val), 'credit', 0,        'memo', 'Inventory variance DR'),
          jsonb_build_object('account_id', inv_acct, 'debit',  0,        'credit', ABS(val), 'memo', 'Inventory OUT')
        )
      );
    END IF;
  END IF;

  UPDATE public.inventory_adjustments
  SET status = 'Posted', posted_at = now()
  WHERE id = _adjustment_id;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (adj.tenant_id, 'adjustment', adj.id, 'Posted',
          'Inventory adjustment posted', auth.uid(),
          (SELECT email FROM public.profiles WHERE id = auth.uid()));

  RETURN _adjustment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_adjustment_unchecked(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8.  Secure public wrappers for ALL posting functions
--     Each: permission check → validate_posting_target → unchecked → complete_posting
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_invoice(_invoice_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.validate_posting_target('invoices', _invoice_id, 'sales.accounting_post') THEN
    RETURN _invoice_id;
  END IF;
  PERFORM public.post_invoice_unchecked(_invoice_id);
  RETURN public.complete_posting(_invoice_id, 'invoice', 'post', 'sales.accounting_post', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_bill(_bill_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.validate_posting_target('bills', _bill_id, 'purchasing.post') THEN
    RETURN _bill_id;
  END IF;
  PERFORM public.post_bill_unchecked(_bill_id);
  RETURN public.complete_posting(_bill_id, 'bill', 'post', 'purchasing.post', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_credit_note(_credit_note_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.validate_posting_target('credit_notes', _credit_note_id, 'sales.accounting_post') THEN
    RETURN _credit_note_id;
  END IF;
  PERFORM public.post_credit_note_unchecked(_credit_note_id);
  RETURN public.complete_posting(_credit_note_id, 'credit_note', 'post', 'sales.accounting_post', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_payment_received(_payment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.validate_posting_target('payments_received', _payment_id, 'payments.post') THEN
    RETURN _payment_id;
  END IF;
  PERFORM public.post_payment_received_unchecked(_payment_id);
  RETURN public.complete_posting(_payment_id, 'payment_received', 'post', 'payments.post', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_payment_made(_payment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.validate_posting_target('payments_made', _payment_id, 'payments.post') THEN
    RETURN _payment_id;
  END IF;
  PERFORM public.post_payment_made_unchecked(_payment_id);
  RETURN public.complete_posting(_payment_id, 'payment_made', 'post', 'payments.post', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_expense(_expense_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.validate_posting_target('expenses', _expense_id, 'purchasing.post') THEN
    RETURN _expense_id;
  END IF;
  PERFORM public.post_expense_unchecked(_expense_id);
  RETURN public.complete_posting(_expense_id, 'expense', 'post', 'purchasing.post', true);
END;
$$;

-- Re-register the adjustment/transfer/production wrappers so they route
-- through the updated validate_posting_target and complete_posting
CREATE OR REPLACE FUNCTION public.post_adjustment(_adjustment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_requires_journal boolean; BEGIN
  IF NOT public.validate_posting_target('inventory_adjustments', _adjustment_id, 'inventory.adjust') THEN
    RETURN _adjustment_id;
  END IF;
  PERFORM public.post_adjustment_unchecked(_adjustment_id);
  SELECT EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE tenant_id = public.current_tenant_id()
      AND source_ref_id = _adjustment_id AND source_ref_type = 'adjustment'
      AND deleted_at IS NULL
  ) INTO v_requires_journal;
  RETURN public.complete_posting(_adjustment_id, 'adjustment', 'post', 'inventory.adjust', v_requires_journal);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_transfer(_transfer_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.validate_posting_target('inventory_transfers', _transfer_id, 'inventory.transfer') THEN
    RETURN _transfer_id;
  END IF;
  PERFORM public.post_transfer_unchecked(_transfer_id);
  RETURN public.complete_posting(_transfer_id, 'transfer', 'post', 'inventory.transfer', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_production_order(_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.validate_posting_target('production_orders', _order_id, 'manufacturing.post') THEN
    RETURN _order_id;
  END IF;
  PERFORM public.post_production_order_unchecked(_order_id);
  RETURN public.complete_posting(_order_id, 'production_order', 'post', 'manufacturing.post', true);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9.  Grant execute on all public wrappers
-- ─────────────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.post_invoice(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_bill(uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_credit_note(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_payment_received(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_payment_made(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_expense(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_adjustment(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_transfer(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_production_order(uuid)  TO authenticated;

-- Unchecked functions are internal only — no public/authenticated grants
REVOKE EXECUTE ON FUNCTION public.post_invoice_unchecked(uuid)           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_bill_unchecked(uuid)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_credit_note_unchecked(uuid)       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_payment_received_unchecked(uuid)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_payment_made_unchecked(uuid)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_expense_unchecked(uuid)           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_adjustment_unchecked(uuid)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_transfer_unchecked(uuid)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_production_order_unchecked(uuid)  FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10.  Seed permissions for new document types
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.permissions (code, module, action, description) VALUES
  ('payments.post', 'payments', 'post', 'Post payment accounting entries'),
  ('payments.void', 'payments', 'void', 'Void and reverse posted payments')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('accounting', 'payments.post'),
  ('accounting', 'payments.void'),
  ('cashier',    'payments.post'),
  ('sales',      'payments.post')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11.  Extend void_posted_document to recognise payment_received / payment_made
--      (it already handles those table names via the voided_at column added in
--      the reversal migration — no table changes needed, just confirm the CASE)
-- ─────────────────────────────────────────────────────────────────────────────

-- void_posted_document already has 'payment_received' and 'payment_made' in its
-- CASE block from migration 20260827160000. Nothing to add here.
-- Expense is also in that CASE block already.
