-- =========================================================
-- Tax / VAT Accounting Engine
--
-- 1.  tax_rates table — named tax codes with GL account links
-- 2.  New system GL accounts:
--       1150  Input VAT    (Asset — recoverable VAT paid on purchases)
--       2100  Output VAT   (Liability — VAT collected from customers)
-- 3.  Rewrite post_invoice_unchecked:
--       DR AR (grand_total)
--         CR Revenue (subtotal)
--         CR Output VAT (tax_total)   ← split from revenue
-- 4.  Rewrite post_bill_unchecked:
--       DR Expense/Inventory (subtotal per line, excl. tax)
--       DR Input VAT (tax per line)   ← recoverable
--         CR AP (grand_total)
-- 5.  Rewrite post_credit_note_unchecked symmetrically
-- 6.  Update handle_new_user to seed both VAT accounts
--     and a default 16 % VAT rate
-- =========================================================

-- ─────────────────────────────────────────────────────────
-- 1.  tax_rates table
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tax_rates (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name              text        NOT NULL,             -- e.g. "VAT 16%"
  code              text,                             -- e.g. "VAT16" — used on documents
  rate              numeric(7,4) NOT NULL DEFAULT 0,  -- e.g. 16.0000 = 16%
  -- Output = collected from customers (liability)
  -- Input  = paid to suppliers (asset / recoverable)
  -- Exempt = zero-rate or exempt, no VAT accounting entries
  -- Withholding = withheld from payments
  tax_type          text        NOT NULL DEFAULT 'Output'
                    CONSTRAINT tax_type_check CHECK (
                      tax_type IN ('Output','Input','Exempt','Withholding')
                    ),
  -- When true, the document line_total already includes tax (tax is backed out)
  -- When false, tax is added on top of the net amount
  is_inclusive      boolean     NOT NULL DEFAULT false,
  -- GL accounts for this tax rate
  output_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  input_account_id  uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  is_default        boolean     NOT NULL DEFAULT false,
  is_active         boolean     NOT NULL DEFAULT true,
  description       text,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS tax_rates_tenant_idx
  ON public.tax_rates (tenant_id) WHERE deleted_at IS NULL;

ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can read tax rates" ON public.tax_rates;
CREATE POLICY "Tenant members can read tax rates"
  ON public.tax_rates FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "Accounting users can write tax rates" ON public.tax_rates;
CREATE POLICY "Accounting users can write tax rates"
  ON public.tax_rates FOR ALL TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND (
      public.has_permission('accounting.settings.manage')
      OR public.has_permission('accounting.create')
    )
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (
      public.has_permission('accounting.settings.manage')
      OR public.has_permission('accounting.create')
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.tax_rates TO authenticated;
GRANT ALL ON public.tax_rates TO service_role;

CREATE TRIGGER trg_tax_rates_updated
  BEFORE UPDATE ON public.tax_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─────────────────────────────────────────────────────────
-- 2.  Seed VAT control accounts for existing tenants
--     1150  Input VAT   — Asset (debit-normal)
--     2100  Output VAT  — Liability (credit-normal)
-- ─────────────────────────────────────────────────────────

INSERT INTO public.chart_of_accounts (tenant_id, code, name, type, normal_balance, is_system, allow_manual_posting, description)
SELECT
  t.id,
  '1150',
  'Input VAT',
  'Asset',
  'Debit',
  true,
  false,
  'Recoverable VAT paid on purchases — reclaimed from KRA'
FROM public.tenants t
WHERE t.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts c
    WHERE c.tenant_id = t.id AND c.code = '1150' AND c.deleted_at IS NULL
  );

INSERT INTO public.chart_of_accounts (tenant_id, code, name, type, normal_balance, is_system, allow_manual_posting, description)
SELECT
  t.id,
  '2100',
  'Output VAT',
  'Liability',
  'Credit',
  true,
  false,
  'VAT collected from customers — payable to KRA'
FROM public.tenants t
WHERE t.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts c
    WHERE c.tenant_id = t.id AND c.code = '2100' AND c.deleted_at IS NULL
  );

-- ─────────────────────────────────────────────────────────
-- 3.  Seed default tax rates for existing tenants
--     Kenya: Standard Rate 16 %, Reduced Rate 8 %
-- ─────────────────────────────────────────────────────────

INSERT INTO public.tax_rates (
  tenant_id, name, code, rate, tax_type, is_inclusive, is_default, description,
  output_account_id, input_account_id
)
SELECT
  t.id,
  'VAT 16%',
  'VAT16',
  16.0000,
  'Output',
  false,
  true,
  'Kenya Standard VAT Rate (16%)',
  (SELECT id FROM public.chart_of_accounts WHERE tenant_id = t.id AND code = '2100' AND deleted_at IS NULL LIMIT 1),
  (SELECT id FROM public.chart_of_accounts WHERE tenant_id = t.id AND code = '1150' AND deleted_at IS NULL LIMIT 1)
FROM public.tenants t
WHERE t.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.tax_rates r WHERE r.tenant_id = t.id AND r.code = 'VAT16' AND r.deleted_at IS NULL
  );

INSERT INTO public.tax_rates (
  tenant_id, name, code, rate, tax_type, is_inclusive, is_default, description,
  output_account_id, input_account_id
)
SELECT
  t.id,
  'VAT 8%',
  'VAT8',
  8.0000,
  'Output',
  false,
  false,
  'Kenya Reduced VAT Rate (fuel, petroleum products)',
  (SELECT id FROM public.chart_of_accounts WHERE tenant_id = t.id AND code = '2100' AND deleted_at IS NULL LIMIT 1),
  (SELECT id FROM public.chart_of_accounts WHERE tenant_id = t.id AND code = '1150' AND deleted_at IS NULL LIMIT 1)
FROM public.tenants t
WHERE t.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.tax_rates r WHERE r.tenant_id = t.id AND r.code = 'VAT8' AND r.deleted_at IS NULL
  );

INSERT INTO public.tax_rates (
  tenant_id, name, code, rate, tax_type, is_inclusive, is_default, description,
  output_account_id, input_account_id
)
SELECT
  t.id,
  'VAT Exempt',
  'VATEX',
  0.0000,
  'Exempt',
  false,
  false,
  'Zero-rated / exempt from VAT',
  NULL,
  NULL
FROM public.tenants t
WHERE t.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.tax_rates r WHERE r.tenant_id = t.id AND r.code = 'VATEX' AND r.deleted_at IS NULL
  );

-- ─────────────────────────────────────────────────────────
-- 4.  Internal helper: _vat_accounts(tenant_id)
--     Returns (output_vat_id, input_vat_id) UUIDs.
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._vat_accounts(_tenant_id uuid)
RETURNS TABLE (output_vat uuid, input_vat uuid)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    (SELECT id FROM public.chart_of_accounts WHERE tenant_id = _tenant_id AND code = '2100' AND deleted_at IS NULL LIMIT 1),
    (SELECT id FROM public.chart_of_accounts WHERE tenant_id = _tenant_id AND code = '1150' AND deleted_at IS NULL LIMIT 1);
$$;

REVOKE EXECUTE ON FUNCTION public._vat_accounts(uuid) FROM PUBLIC;

-- ─────────────────────────────────────────────────────────
-- 5.  Rewrite post_invoice_unchecked
--
--  Journal 1 — Revenue recognition (tax-split):
--    DR  Accounts Receivable  (1100)   grand_total
--      CR  Sales Revenue       (4000)   subtotal    (net of tax)
--      CR  Output VAT          (2100)   tax_total   (if > 0)
--
--  Journal 2 — COGS (unchanged):
--    DR  COGS                  (5000)   qty × cost
--      CR  Inventory            (1200)
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_invoice_unchecked(_invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inv          record;
  ar_acct      uuid;
  rev_acct     uuid;
  cogs_acct    uuid;
  inv_acct     uuid;
  vat_output   uuid;
  line         record;
  tot_cogs     numeric(14,2) := 0;
  cogs_val     numeric(14,2);
  net_amt      numeric(14,2);  -- subtotal excluding tax
  tax_amt      numeric(14,2);  -- tax_total
  j_lines      jsonb;
BEGIN
  SELECT * INTO inv FROM public.invoices
  WHERE id = _invoice_id AND deleted_at IS NULL;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;

  ar_acct   := public._account_id(inv.tenant_id, '1100');
  rev_acct  := public._account_id(inv.tenant_id, '4000');
  cogs_acct := public._account_id(inv.tenant_id, '5000');
  inv_acct  := public._account_id(inv.tenant_id, '1200');

  SELECT output_vat INTO vat_output FROM public._vat_accounts(inv.tenant_id);

  IF ar_acct  IS NULL THEN RAISE EXCEPTION 'Account 1100 (Accounts Receivable) not found'; END IF;
  IF rev_acct IS NULL THEN RAISE EXCEPTION 'Account 4000 (Sales Revenue) not found'; END IF;

  -- Use stored subtotal/tax_total; fall back gracefully for zero-tax invoices
  net_amt := COALESCE(NULLIF(inv.subtotal,  0), inv.grand_total);
  tax_amt := COALESCE(inv.tax_total, 0);

  -- Rebuild net + tax to exactly match grand_total (avoids rounding drift)
  IF ABS((net_amt + tax_amt) - inv.grand_total) > 0.005 THEN
    -- Fallback: treat everything as net, no tax split
    net_amt := inv.grand_total;
    tax_amt := 0;
  END IF;

  -- ── Journal 1: Revenue recognition ──────────────────────────────────────
  -- Build the credit side dynamically so it handles zero-tax invoices cleanly
  j_lines := jsonb_build_array(
    -- AR debit — always the full grand_total
    jsonb_build_object(
      'account_id', ar_acct,
      'debit',      inv.grand_total,
      'credit',     0,
      'memo',       'AR – ' || COALESCE(inv.number, '')
    ),
    -- Revenue credit — net amount only
    jsonb_build_object(
      'account_id', rev_acct,
      'debit',      0,
      'credit',     net_amt,
      'memo',       'Revenue – ' || COALESCE(inv.number, '')
    )
  );

  -- Add Output VAT credit only when there is tax and a VAT account exists
  IF tax_amt > 0 AND vat_output IS NOT NULL THEN
    j_lines := j_lines || jsonb_build_array(
      jsonb_build_object(
        'account_id', vat_output,
        'debit',      0,
        'credit',     tax_amt,
        'memo',       'Output VAT – ' || COALESCE(inv.number, '')
      )
    );
  ELSIF tax_amt > 0 THEN
    -- No VAT account seeded — absorb tax into revenue (graceful degradation)
    j_lines := jsonb_build_array(
      jsonb_build_object('account_id', ar_acct,  'debit', inv.grand_total, 'credit', 0,              'memo', 'AR – ' || COALESCE(inv.number, '')),
      jsonb_build_object('account_id', rev_acct, 'debit', 0,               'credit', inv.grand_total, 'memo', 'Revenue (incl. tax) – ' || COALESCE(inv.number, ''))
    );
  END IF;

  PERFORM public._emit_journal(
    inv.tenant_id,
    COALESCE(inv.date, CURRENT_DATE),
    'Invoice ' || COALESCE(inv.number, inv.id::text),
    'invoice', inv.id, j_lines
  );

  -- ── Journal 2: COGS ──────────────────────────────────────────────────────
  IF cogs_acct IS NOT NULL AND inv_acct IS NOT NULL THEN
    FOR line IN
      SELECT il.quantity, i.cost AS item_cost
      FROM public.invoice_lines il
      JOIN public.items i ON i.id = il.item_id
      WHERE il.document_id = _invoice_id
        AND il.deleted_at IS NULL
        AND il.item_id IS NOT NULL
        AND i.type IN ('Product','product','Stocked','stocked','Inventory','inventory')
    LOOP
      cogs_val := ROUND(COALESCE(line.quantity,0) * COALESCE(line.item_cost,0), 2);
      tot_cogs := tot_cogs + cogs_val;
    END LOOP;

    IF tot_cogs > 0 THEN
      PERFORM public._emit_journal(
        inv.tenant_id,
        COALESCE(inv.date, CURRENT_DATE),
        'COGS – Invoice ' || COALESCE(inv.number, inv.id::text),
        'invoice', inv.id,
        jsonb_build_array(
          jsonb_build_object('account_id', cogs_acct, 'debit',  tot_cogs, 'credit', 0,        'memo', 'COGS'),
          jsonb_build_object('account_id', inv_acct,  'debit',  0,        'credit', tot_cogs, 'memo', 'Inventory out')
        )
      );
    END IF;
  END IF;

  UPDATE public.invoices SET status = 'Posted', posted_at = now() WHERE id = _invoice_id;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (inv.tenant_id, 'invoice', inv.id, 'Posted',
          'Invoice posted; AR ' || inv.grand_total || ', Revenue ' || net_amt || ', Output VAT ' || tax_amt,
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));

  RETURN _invoice_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_invoice_unchecked(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────
-- 6.  Rewrite post_bill_unchecked
--
--  For each line:
--    net_line = line_total / (1 + tax_pct/100)   when inclusive
--    net_line = line_total * (1 - tax_pct/(100+tax_pct)) approx or use subtotal
--    tax_line = line_total - net_line
--
--  Simplest correct approach: use bill.subtotal and bill.tax_total
--  (already stored by the document editor), iterate lines for DR side.
--
--  Journal:
--    DR  Expense / Inventory   (per line, at net amount excl. tax)
--    DR  Input VAT             (1150)   tax_total  (recoverable)
--      CR  Accounts Payable    (2000)   grand_total
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_bill_unchecked(_bill_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  bill         record;
  ap_acct      uuid;
  inv_acct     uuid;
  exp_acct     uuid;
  vat_input    uuid;
  line         record;
  dr_lines     jsonb := '[]'::jsonb;
  net_total    numeric(14,2) := 0;
  tax_total_v  numeric(14,2);
  line_net     numeric(14,2);
  line_tax     numeric(14,2);
  tax_ratio    numeric(10,8);
  acct_to_dr   uuid;
BEGIN
  SELECT * INTO bill FROM public.bills
  WHERE id = _bill_id AND deleted_at IS NULL;
  IF bill.id IS NULL THEN RAISE EXCEPTION 'Bill not found'; END IF;

  ap_acct  := public._account_id(bill.tenant_id, '2000');
  inv_acct := public._account_id(bill.tenant_id, '1200');
  exp_acct := public._account_id(bill.tenant_id, '6000');

  SELECT input_vat INTO vat_input FROM public._vat_accounts(bill.tenant_id);

  IF ap_acct IS NULL THEN RAISE EXCEPTION 'Account 2000 (Accounts Payable) not found'; END IF;

  -- Build per-line debit entries at net-of-tax amounts
  FOR line IN
    SELECT bl.line_total, bl.tax_pct, bl.item_id, bl.description,
           i.type AS item_type
    FROM public.bill_lines bl
    LEFT JOIN public.items i ON i.id = bl.item_id
    WHERE bl.document_id = _bill_id AND bl.deleted_at IS NULL
  LOOP
    IF COALESCE(line.line_total, 0) = 0 THEN CONTINUE; END IF;

    -- Back-compute net amount from line_total (which includes tax)
    -- line_total = net * (1 + tax_pct/100) when exclusive, so net = line_total / (1 + tax_pct/100)
    -- line_total = gross (inclusive), net = line_total / (1 + tax_pct/100)
    IF COALESCE(line.tax_pct, 0) > 0 THEN
      line_net := ROUND(line.line_total / (1 + line.tax_pct / 100.0), 2);
      line_tax := line.line_total - line_net;
    ELSE
      line_net := line.line_total;
      line_tax := 0;
    END IF;

    -- Classify the net DR account
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
      'debit',      line_net,
      'credit',     0,
      'memo',       COALESCE(line.description, 'Bill line')
    );
    net_total := net_total + line_net;
  END LOOP;

  -- Use stored tax_total for the Input VAT DR (more reliable than per-line sum)
  tax_total_v := GREATEST(COALESCE(bill.tax_total, 0), 0);

  -- Fallback: no lines present, use grand_total vs. subtotal split
  IF net_total = 0 THEN
    net_total   := COALESCE(NULLIF(bill.subtotal, 0), bill.grand_total - tax_total_v);
    tax_total_v := COALESCE(bill.tax_total, 0);
    dr_lines := jsonb_build_array(
      jsonb_build_object(
        'account_id', COALESCE(exp_acct, inv_acct),
        'debit',      net_total,
        'credit',     0,
        'memo',       'Bill total (net)'
      )
    );
  END IF;

  -- Add Input VAT debit if applicable and account exists
  IF tax_total_v > 0 AND vat_input IS NOT NULL THEN
    dr_lines := dr_lines || jsonb_build_array(
      jsonb_build_object(
        'account_id', vat_input,
        'debit',      tax_total_v,
        'credit',     0,
        'memo',       'Input VAT – ' || COALESCE(bill.number, '')
      )
    );
  ELSIF tax_total_v > 0 THEN
    -- No Input VAT account — add tax to expense (graceful degradation)
    net_total := net_total + tax_total_v;
    tax_total_v := 0;
  END IF;

  -- AP credit closes the entry at grand_total
  dr_lines := dr_lines || jsonb_build_object(
    'account_id', ap_acct,
    'debit',      0,
    'credit',     COALESCE(bill.grand_total, net_total + tax_total_v),
    'memo',       'AP – ' || COALESCE(bill.number, '')
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
          'Bill posted; net ' || net_total || ', Input VAT ' || tax_total_v || ', AP ' || bill.grand_total,
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));

  RETURN _bill_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_bill_unchecked(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────
-- 7.  Rewrite post_credit_note_unchecked (symmetric reversal)
--
--  DR  Sales Revenue  (4000)   subtotal (net)
--  DR  Output VAT     (2100)   tax_total
--    CR  AR             (1100)   grand_total
--
--  DR  Inventory      (1200)   COGS value (returns)
--    CR  COGS           (5000)
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_credit_note_unchecked(_credit_note_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cn          record;
  ar_acct     uuid;
  rev_acct    uuid;
  cogs_acct   uuid;
  inv_acct    uuid;
  vat_output  uuid;
  net_amt     numeric(14,2);
  tax_amt     numeric(14,2);
  j_lines     jsonb;
  line        record;
  tot_cogs    numeric(14,2) := 0;
BEGIN
  SELECT * INTO cn FROM public.credit_notes
  WHERE id = _credit_note_id AND deleted_at IS NULL;
  IF cn.id IS NULL THEN RAISE EXCEPTION 'Credit note not found'; END IF;

  ar_acct   := public._account_id(cn.tenant_id, '1100');
  rev_acct  := public._account_id(cn.tenant_id, '4000');
  cogs_acct := public._account_id(cn.tenant_id, '5000');
  inv_acct  := public._account_id(cn.tenant_id, '1200');

  SELECT output_vat INTO vat_output FROM public._vat_accounts(cn.tenant_id);

  IF ar_acct  IS NULL THEN RAISE EXCEPTION 'Account 1100 (AR) not found'; END IF;
  IF rev_acct IS NULL THEN RAISE EXCEPTION 'Account 4000 (Revenue) not found'; END IF;

  net_amt := COALESCE(NULLIF(cn.subtotal, 0), cn.grand_total);
  tax_amt := COALESCE(cn.tax_total, 0);

  IF ABS((net_amt + tax_amt) - cn.grand_total) > 0.005 THEN
    net_amt := cn.grand_total;
    tax_amt := 0;
  END IF;

  -- Revenue and VAT reversal
  j_lines := jsonb_build_array(
    jsonb_build_object('account_id', rev_acct, 'debit', net_amt, 'credit', 0,              'memo', 'Revenue reversal – ' || COALESCE(cn.number, '')),
    jsonb_build_object('account_id', ar_acct,  'debit', 0,       'credit', cn.grand_total, 'memo', 'AR reduction – '     || COALESCE(cn.number, ''))
  );

  IF tax_amt > 0 AND vat_output IS NOT NULL THEN
    j_lines := j_lines || jsonb_build_array(
      jsonb_build_object('account_id', vat_output, 'debit', tax_amt, 'credit', 0, 'memo', 'Output VAT reversal – ' || COALESCE(cn.number, ''))
    );
  ELSIF tax_amt > 0 THEN
    -- No VAT account — absorb into revenue reversal
    j_lines := jsonb_build_array(
      jsonb_build_object('account_id', rev_acct, 'debit', cn.grand_total, 'credit', 0,              'memo', 'Revenue reversal (incl. tax)'),
      jsonb_build_object('account_id', ar_acct,  'debit', 0,              'credit', cn.grand_total, 'memo', 'AR reduction')
    );
  END IF;

  PERFORM public._emit_journal(
    cn.tenant_id,
    COALESCE(cn.date, CURRENT_DATE),
    'Credit Note ' || COALESCE(cn.number, cn.id::text),
    'credit_note', cn.id, j_lines
  );

  -- Inventory reinstatement for returns
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
          jsonb_build_object('account_id', inv_acct,  'debit', tot_cogs, 'credit', 0,        'memo', 'Inventory returned'),
          jsonb_build_object('account_id', cogs_acct, 'debit', 0,        'credit', tot_cogs, 'memo', 'COGS reversal')
        )
      );
    END IF;
  END IF;

  UPDATE public.credit_notes SET status = 'Posted', posted_at = now() WHERE id = _credit_note_id;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (cn.tenant_id, 'credit_note', cn.id, 'Posted',
          'Credit note posted; Revenue reversal ' || net_amt || ', Output VAT reversal ' || tax_amt,
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));

  RETURN _credit_note_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_credit_note_unchecked(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────
-- 8.  Update handle_new_user to seed VAT accounts + rates
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_tenant_id    uuid;
  tenant_name      text;
  tenant_slug      text;
  output_vat_id    uuid;
  input_vat_id     uuid;
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

  -- ── Core GL accounts ─────────────────────────────────────────────────────
  INSERT INTO public.chart_of_accounts
    (tenant_id, code, name, type, normal_balance, is_system, allow_manual_posting, description, created_by)
  VALUES
    (new_tenant_id,'1000','Cash',                'Asset',    'Debit',  true, true,  'Primary cash and cash-equivalent account',                 NEW.id),
    (new_tenant_id,'1100','Accounts Receivable', 'Asset',    'Debit',  true, false, 'Amounts owed by customers',                                NEW.id),
    (new_tenant_id,'1150','Input VAT',           'Asset',    'Debit',  true, false, 'Recoverable VAT paid on purchases — reclaimed from KRA',  NEW.id),
    (new_tenant_id,'1200','Inventory',           'Asset',    'Debit',  true, false, 'Stock held for sale',                                      NEW.id),
    (new_tenant_id,'1300','Work in Progress',    'Asset',    'Debit',  true, false, 'Partially completed production costs',                     NEW.id),
    (new_tenant_id,'2000','Accounts Payable',    'Liability','Credit', true, false, 'Amounts owed to suppliers',                                NEW.id),
    (new_tenant_id,'2100','Output VAT',          'Liability','Credit', true, false, 'VAT collected from customers — payable to KRA',            NEW.id),
    (new_tenant_id,'3000','Owner Equity',        'Equity',   'Credit', true, false, 'Owner / shareholder equity',                               NEW.id),
    (new_tenant_id,'4000','Sales Revenue',       'Income',   'Credit', true, false, 'Revenue from primary business operations',                 NEW.id),
    (new_tenant_id,'5000','Cost of Goods Sold',  'Expense',  'Debit',  true, true,  'Direct cost of products sold',                             NEW.id),
    (new_tenant_id,'6000','Operating Expenses',  'Expense',  'Debit',  true, true,  'Overhead and indirect operating costs',                    NEW.id);

  -- Capture the VAT account IDs for linking to tax_rates
  SELECT id INTO output_vat_id FROM public.chart_of_accounts
  WHERE tenant_id = new_tenant_id AND code = '2100';
  SELECT id INTO input_vat_id  FROM public.chart_of_accounts
  WHERE tenant_id = new_tenant_id AND code = '1150';

  -- ── Tax rates ─────────────────────────────────────────────────────────────
  INSERT INTO public.tax_rates
    (tenant_id, name, code, rate, tax_type, is_inclusive, is_default, description, output_account_id, input_account_id, created_by)
  VALUES
    (new_tenant_id,'VAT 16%',   'VAT16', 16.0000,'Output', false, true,  'Kenya Standard VAT Rate (16%)',                       output_vat_id, input_vat_id, NEW.id),
    (new_tenant_id,'VAT 8%',    'VAT8',   8.0000,'Output', false, false, 'Kenya Reduced VAT Rate (fuel, petroleum products)',   output_vat_id, input_vat_id, NEW.id),
    (new_tenant_id,'VAT Exempt','VATEX',  0.0000,'Exempt',  false, false, 'Zero-rated / exempt from VAT',                       NULL,          NULL,          NEW.id);

  -- ── Accounting periods (current month + 11 forward) ───────────────────────
  INSERT INTO public.accounting_periods (tenant_id, period_start, period_end, period_name, status)
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
