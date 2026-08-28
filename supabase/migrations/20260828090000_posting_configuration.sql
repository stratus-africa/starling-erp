-- =========================================================
-- Automated Posting Configuration
--
-- Replaces hard-coded account codes scattered through SQL with
-- a per-tenant posting_config table keyed by purpose slug.
--
-- 1.  posting_config table — (tenant_id, purpose) → account_id
-- 2.  _cfg_account(tenant_id, purpose) — fast resolver used by all
--     posting RPCs instead of _account_id(tenant_id, code)
-- 3.  Expand system_account_mappings with all posting purposes
-- 4.  Seed posting_config for existing tenants from their chart
--     of accounts (resolves default code → UUID)
-- 5.  Rewrite every posting function to use _cfg_account()
-- 6.  Update handle_new_user to seed posting_config alongside COA
-- =========================================================

-- ─────────────────────────────────────────────────────────
-- 1.  posting_config table
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.posting_config (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  purpose      text        NOT NULL,  -- slugs defined in system_account_mappings
  account_id   uuid        REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid,
  UNIQUE (tenant_id, purpose)
);

CREATE INDEX IF NOT EXISTS posting_config_tenant_purpose_idx
  ON public.posting_config (tenant_id, purpose);

ALTER TABLE public.posting_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can read posting config" ON public.posting_config;
CREATE POLICY "Tenant members can read posting config"
  ON public.posting_config FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "Accounting admins can write posting config" ON public.posting_config;
CREATE POLICY "Accounting admins can write posting config"
  ON public.posting_config FOR ALL TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND (
      public.has_permission('accounting.settings.manage')
      OR public.has_permission('accounting.update')
    )
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (
      public.has_permission('accounting.settings.manage')
      OR public.has_permission('accounting.update')
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.posting_config TO authenticated;
GRANT ALL ON public.posting_config TO service_role;

-- ─────────────────────────────────────────────────────────
-- 2.  Expand system_account_mappings with every posting purpose
--     The table is the canonical catalogue of all purpose slugs.
--     module drives the UI grouping.
-- ─────────────────────────────────────────────────────────

ALTER TABLE public.system_account_mappings
  ADD COLUMN IF NOT EXISTS module       text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS sort_order   integer NOT NULL DEFAULT 99,
  ADD COLUMN IF NOT EXISTS is_required  boolean NOT NULL DEFAULT true;

INSERT INTO public.system_account_mappings
  (purpose, default_code, label, description, module, sort_order, is_required)
VALUES
  -- ── Sales ────────────────────────────────────────────────
  ('accounts_receivable',     '1100','Accounts Receivable',  'Debited when an invoice is posted',               'sales',        10, true),
  ('sales_revenue',           '4000','Sales Revenue',        'Credited for the net amount on invoices',         'sales',        20, true),
  ('sales_discount',          '4010','Sales Discount',       'Debited for any trade discounts given',           'sales',        30, false),
  ('output_vat',              '2100','Output VAT',           'VAT collected from customers — payable to KRA',   'sales',        40, false),
  -- ── Purchasing ──────────────────────────────────────────
  ('accounts_payable',        '2000','Accounts Payable',     'Credited when a bill or expense is posted',       'purchasing',   10, true),
  ('purchase_expense',        '6000','Purchase / Expense',   'Default expense account for non-inventory bills', 'purchasing',   20, true),
  ('input_vat',               '1150','Input VAT',            'Recoverable VAT paid on purchases',               'purchasing',   30, false),
  -- ── Inventory ───────────────────────────────────────────
  ('inventory',               '1200','Inventory',            'Asset account for stock on hand',                 'inventory',    10, true),
  ('wip',                     '1300','Work in Progress',     'WIP asset for production orders',                 'inventory',    20, true),
  ('cogs',                    '5000','Cost of Goods Sold',   'Debited when inventory is sold',                  'inventory',    30, true),
  ('inventory_variance',      '6000','Inventory Variance',   'Variance account for stock adjustments',          'inventory',    40, true),
  -- ── Payments ────────────────────────────────────────────
  ('cash',                    '1000','Default Cash / Bank',  'Debited for receipts, credited for payments',     'banking',      10, true),
  ('bank_revenue_contra',     '4000','Bank Revenue Contra',  'Default credit account for bank deposits',        'banking',      20, false),
  ('bank_expense_contra',     '6000','Bank Expense Contra',  'Default debit account for bank withdrawals',      'banking',      30, false),
  -- ── Equity ──────────────────────────────────────────────
  ('equity',                  '3000','Equity',               'Owner / shareholder equity',                      'general',      10, true),
  ('retained_earnings',       '3100','Retained Earnings',    'Accumulated prior-year profits',                  'general',      20, false)
ON CONFLICT (purpose) DO UPDATE SET
  default_code = EXCLUDED.default_code,
  label        = EXCLUDED.label,
  description  = EXCLUDED.description,
  module       = EXCLUDED.module,
  sort_order   = EXCLUDED.sort_order,
  is_required  = EXCLUDED.is_required;

-- ─────────────────────────────────────────────────────────
-- 3.  _cfg_account(tenant_id, purpose)
--
--     Lookup chain:
--       1. posting_config for this tenant (explicit override)
--       2. _account_id(tenant, default_code from system_account_mappings)
--     Returns NULL if neither resolves (caller decides how to handle).
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._cfg_account(
  _tenant_id uuid,
  _purpose   text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_account_id uuid;
  v_default_code text;
BEGIN
  -- 1. Explicit tenant override
  SELECT account_id INTO v_account_id
  FROM public.posting_config
  WHERE tenant_id = _tenant_id
    AND purpose   = _purpose;

  IF v_account_id IS NOT NULL THEN
    RETURN v_account_id;
  END IF;

  -- 2. Fall back to default code from system_account_mappings
  SELECT default_code INTO v_default_code
  FROM public.system_account_mappings
  WHERE purpose = _purpose;

  IF v_default_code IS NOT NULL THEN
    RETURN public._account_id(_tenant_id, v_default_code);
  END IF;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._cfg_account(uuid, text) FROM PUBLIC;
-- Called internally only — no public grant needed

-- ─────────────────────────────────────────────────────────
-- 4.  Seed posting_config for every existing tenant
--     Walk each purpose, resolve its default code for each tenant
-- ─────────────────────────────────────────────────────────

INSERT INTO public.posting_config (tenant_id, purpose, account_id)
SELECT
  t.id AS tenant_id,
  m.purpose,
  (SELECT coa.id
   FROM public.chart_of_accounts coa
   WHERE coa.tenant_id  = t.id
     AND coa.code       = m.default_code
     AND coa.deleted_at IS NULL
   LIMIT 1) AS account_id
FROM public.tenants t
CROSS JOIN public.system_account_mappings m
WHERE t.deleted_at IS NULL
ON CONFLICT (tenant_id, purpose) DO NOTHING;

-- ─────────────────────────────────────────────────────────
-- 5a.  Rewrite post_invoice_unchecked using _cfg_account
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
  net_amt      numeric(14,2);
  tax_amt      numeric(14,2);
  j_lines      jsonb;
BEGIN
  SELECT * INTO inv FROM public.invoices WHERE id = _invoice_id AND deleted_at IS NULL;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;

  ar_acct    := public._cfg_account(inv.tenant_id, 'accounts_receivable');
  rev_acct   := public._cfg_account(inv.tenant_id, 'sales_revenue');
  cogs_acct  := public._cfg_account(inv.tenant_id, 'cogs');
  inv_acct   := public._cfg_account(inv.tenant_id, 'inventory');
  vat_output := public._cfg_account(inv.tenant_id, 'output_vat');

  IF ar_acct  IS NULL THEN RAISE EXCEPTION 'Posting config: accounts_receivable account not set'; END IF;
  IF rev_acct IS NULL THEN RAISE EXCEPTION 'Posting config: sales_revenue account not set'; END IF;

  net_amt := COALESCE(NULLIF(inv.subtotal, 0), inv.grand_total);
  tax_amt := COALESCE(inv.tax_total, 0);
  IF ABS((net_amt + tax_amt) - inv.grand_total) > 0.005 THEN
    net_amt := inv.grand_total; tax_amt := 0;
  END IF;

  j_lines := jsonb_build_array(
    jsonb_build_object('account_id', ar_acct,  'debit', inv.grand_total, 'credit', 0,       'memo', 'AR – '      || COALESCE(inv.number,'')),
    jsonb_build_object('account_id', rev_acct, 'debit', 0,               'credit', net_amt, 'memo', 'Revenue – ' || COALESCE(inv.number,''))
  );
  IF tax_amt > 0 AND vat_output IS NOT NULL THEN
    j_lines := j_lines || jsonb_build_array(
      jsonb_build_object('account_id', vat_output, 'debit', 0, 'credit', tax_amt, 'memo', 'Output VAT – ' || COALESCE(inv.number,''))
    );
  ELSIF tax_amt > 0 THEN
    j_lines := jsonb_build_array(
      jsonb_build_object('account_id', ar_acct,  'debit', inv.grand_total, 'credit', 0,              'memo', 'AR – '                  || COALESCE(inv.number,'')),
      jsonb_build_object('account_id', rev_acct, 'debit', 0,               'credit', inv.grand_total,'memo', 'Revenue (incl. tax) – ' || COALESCE(inv.number,''))
    );
  END IF;

  PERFORM public._emit_journal(
    inv.tenant_id, COALESCE(inv.date, CURRENT_DATE),
    'Invoice ' || COALESCE(inv.number, inv.id::text), 'invoice', inv.id, j_lines
  );

  IF cogs_acct IS NOT NULL AND inv_acct IS NOT NULL THEN
    FOR line IN
      SELECT il.quantity, i.cost AS item_cost
      FROM public.invoice_lines il JOIN public.items i ON i.id = il.item_id
      WHERE il.document_id = _invoice_id AND il.deleted_at IS NULL AND il.item_id IS NOT NULL
        AND i.type IN ('Product','product','Stocked','stocked','Inventory','inventory')
    LOOP
      tot_cogs := tot_cogs + ROUND(COALESCE(line.quantity,0)*COALESCE(line.item_cost,0), 2);
    END LOOP;
    IF tot_cogs > 0 THEN
      PERFORM public._emit_journal(
        inv.tenant_id, COALESCE(inv.date, CURRENT_DATE),
        'COGS – Invoice ' || COALESCE(inv.number, inv.id::text), 'invoice', inv.id,
        jsonb_build_array(
          jsonb_build_object('account_id', cogs_acct, 'debit', tot_cogs, 'credit', 0,        'memo', 'COGS'),
          jsonb_build_object('account_id', inv_acct,  'debit', 0,        'credit', tot_cogs, 'memo', 'Inventory out')
        )
      );
    END IF;
  END IF;

  UPDATE public.invoices SET status = 'Posted', posted_at = now() WHERE id = _invoice_id;
  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (inv.tenant_id, 'invoice', inv.id, 'Posted',
          'Invoice posted; AR ' || inv.grand_total || ', Revenue ' || net_amt || ', VAT ' || tax_amt,
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));
  RETURN _invoice_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.post_invoice_unchecked(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────
-- 5b.  post_bill_unchecked
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
  acct_to_dr   uuid;
BEGIN
  SELECT * INTO bill FROM public.bills WHERE id = _bill_id AND deleted_at IS NULL;
  IF bill.id IS NULL THEN RAISE EXCEPTION 'Bill not found'; END IF;

  ap_acct   := public._cfg_account(bill.tenant_id, 'accounts_payable');
  inv_acct  := public._cfg_account(bill.tenant_id, 'inventory');
  exp_acct  := public._cfg_account(bill.tenant_id, 'purchase_expense');
  vat_input := public._cfg_account(bill.tenant_id, 'input_vat');

  IF ap_acct IS NULL THEN RAISE EXCEPTION 'Posting config: accounts_payable account not set'; END IF;

  FOR line IN
    SELECT bl.line_total, bl.tax_pct, bl.item_id, bl.description, i.type AS item_type
    FROM public.bill_lines bl LEFT JOIN public.items i ON i.id = bl.item_id
    WHERE bl.document_id = _bill_id AND bl.deleted_at IS NULL
  LOOP
    IF COALESCE(line.line_total, 0) = 0 THEN CONTINUE; END IF;
    IF COALESCE(line.tax_pct, 0) > 0 THEN
      line_net := ROUND(line.line_total / (1 + line.tax_pct / 100.0), 2);
    ELSE
      line_net := line.line_total;
    END IF;
    IF line.item_id IS NOT NULL
       AND line.item_type IN ('Product','product','Stocked','stocked','Inventory','inventory')
       AND inv_acct IS NOT NULL
    THEN
      acct_to_dr := inv_acct;
    ELSE
      acct_to_dr := COALESCE(exp_acct, inv_acct);
    END IF;
    dr_lines  := dr_lines || jsonb_build_object('account_id', acct_to_dr, 'debit', line_net, 'credit', 0, 'memo', COALESCE(line.description,'Bill line'));
    net_total := net_total + line_net;
  END LOOP;

  tax_total_v := GREATEST(COALESCE(bill.tax_total, 0), 0);
  IF net_total = 0 THEN
    net_total   := COALESCE(NULLIF(bill.subtotal,0), bill.grand_total - tax_total_v);
    tax_total_v := COALESCE(bill.tax_total, 0);
    dr_lines := jsonb_build_array(jsonb_build_object('account_id', COALESCE(exp_acct,inv_acct), 'debit', net_total, 'credit', 0, 'memo', 'Bill total (net)'));
  END IF;
  IF tax_total_v > 0 AND vat_input IS NOT NULL THEN
    dr_lines := dr_lines || jsonb_build_array(jsonb_build_object('account_id', vat_input, 'debit', tax_total_v, 'credit', 0, 'memo', 'Input VAT – ' || COALESCE(bill.number,'')));
  ELSIF tax_total_v > 0 THEN
    net_total := net_total + tax_total_v; tax_total_v := 0;
  END IF;
  dr_lines := dr_lines || jsonb_build_object('account_id', ap_acct, 'debit', 0, 'credit', COALESCE(bill.grand_total, net_total + tax_total_v), 'memo', 'AP – ' || COALESCE(bill.number,''));

  PERFORM public._emit_journal(bill.tenant_id, COALESCE(bill.date, CURRENT_DATE), 'Bill ' || COALESCE(bill.number, bill.id::text), 'bill', bill.id, dr_lines);
  UPDATE public.bills SET status = 'Posted', posted_at = now() WHERE id = _bill_id;
  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (bill.tenant_id, 'bill', bill.id, 'Posted',
          'Bill posted; net ' || net_total || ', Input VAT ' || tax_total_v,
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));
  RETURN _bill_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.post_bill_unchecked(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────
-- 5c.  post_credit_note_unchecked
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
  SELECT * INTO cn FROM public.credit_notes WHERE id = _credit_note_id AND deleted_at IS NULL;
  IF cn.id IS NULL THEN RAISE EXCEPTION 'Credit note not found'; END IF;

  ar_acct    := public._cfg_account(cn.tenant_id, 'accounts_receivable');
  rev_acct   := public._cfg_account(cn.tenant_id, 'sales_revenue');
  cogs_acct  := public._cfg_account(cn.tenant_id, 'cogs');
  inv_acct   := public._cfg_account(cn.tenant_id, 'inventory');
  vat_output := public._cfg_account(cn.tenant_id, 'output_vat');

  IF ar_acct  IS NULL THEN RAISE EXCEPTION 'Posting config: accounts_receivable account not set'; END IF;
  IF rev_acct IS NULL THEN RAISE EXCEPTION 'Posting config: sales_revenue account not set'; END IF;

  net_amt := COALESCE(NULLIF(cn.subtotal,0), cn.grand_total);
  tax_amt := COALESCE(cn.tax_total, 0);
  IF ABS((net_amt + tax_amt) - cn.grand_total) > 0.005 THEN
    net_amt := cn.grand_total; tax_amt := 0;
  END IF;

  j_lines := jsonb_build_array(
    jsonb_build_object('account_id', rev_acct, 'debit', net_amt,       'credit', 0,              'memo', 'Revenue reversal – ' || COALESCE(cn.number,'')),
    jsonb_build_object('account_id', ar_acct,  'debit', 0,             'credit', cn.grand_total, 'memo', 'AR reduction – '     || COALESCE(cn.number,''))
  );
  IF tax_amt > 0 AND vat_output IS NOT NULL THEN
    j_lines := j_lines || jsonb_build_array(
      jsonb_build_object('account_id', vat_output, 'debit', tax_amt, 'credit', 0, 'memo', 'Output VAT reversal – ' || COALESCE(cn.number,''))
    );
  ELSIF tax_amt > 0 THEN
    j_lines := jsonb_build_array(
      jsonb_build_object('account_id', rev_acct, 'debit', cn.grand_total, 'credit', 0,              'memo', 'Revenue reversal (incl. tax)'),
      jsonb_build_object('account_id', ar_acct,  'debit', 0,              'credit', cn.grand_total, 'memo', 'AR reduction')
    );
  END IF;

  PERFORM public._emit_journal(cn.tenant_id, COALESCE(cn.date, CURRENT_DATE), 'Credit Note ' || COALESCE(cn.number, cn.id::text), 'credit_note', cn.id, j_lines);

  IF cogs_acct IS NOT NULL AND inv_acct IS NOT NULL THEN
    FOR line IN
      SELECT cnl.quantity, i.cost AS item_cost
      FROM public.credit_note_lines cnl JOIN public.items i ON i.id = cnl.item_id
      WHERE cnl.document_id = _credit_note_id AND cnl.deleted_at IS NULL AND cnl.item_id IS NOT NULL
        AND i.type IN ('Product','product','Stocked','stocked','Inventory','inventory')
    LOOP
      tot_cogs := tot_cogs + ROUND(COALESCE(line.quantity,0)*COALESCE(line.item_cost,0),2);
    END LOOP;
    IF tot_cogs > 0 THEN
      PERFORM public._emit_journal(cn.tenant_id, COALESCE(cn.date, CURRENT_DATE),
        'COGS reversal – Credit Note ' || COALESCE(cn.number, cn.id::text), 'credit_note', cn.id,
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
          'Credit note posted; Revenue reversal ' || net_amt || ', VAT reversal ' || tax_amt,
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));
  RETURN _credit_note_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.post_credit_note_unchecked(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────
-- 5d.  post_payment_received_unchecked
-- ─────────────────────────────────────────────────────────

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
  SELECT * INTO pmt FROM public.payments_received WHERE id = _payment_id AND deleted_at IS NULL;
  IF pmt.id IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;

  cash_acct := public._cfg_account(pmt.tenant_id, 'cash');
  ar_acct   := public._cfg_account(pmt.tenant_id, 'accounts_receivable');
  pmt_amt   := COALESCE(pmt.amount, 0);

  IF cash_acct IS NULL THEN RAISE EXCEPTION 'Posting config: cash account not set'; END IF;
  IF ar_acct   IS NULL THEN RAISE EXCEPTION 'Posting config: accounts_receivable account not set'; END IF;
  IF pmt_amt  <= 0     THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;

  PERFORM public._emit_journal(pmt.tenant_id, COALESCE(pmt.date, CURRENT_DATE),
    'Payment received ' || COALESCE(pmt.number, pmt.id::text), 'payment_received', pmt.id,
    jsonb_build_array(
      jsonb_build_object('account_id', cash_acct, 'debit', pmt_amt, 'credit', 0,       'memo', 'Cash in'),
      jsonb_build_object('account_id', ar_acct,   'debit', 0,       'credit', pmt_amt, 'memo', 'AR cleared')
    )
  );

  UPDATE public.payments_received SET status = 'Posted', posted_at = now() WHERE id = _payment_id;
  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (pmt.tenant_id, 'payment_received', pmt.id, 'Posted', 'Payment received posted; Cash DR / AR CR',
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));
  RETURN _payment_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.post_payment_received_unchecked(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────
-- 5e.  post_payment_made_unchecked
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_payment_made_unchecked(_payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pmt       record;
  ap_acct   uuid;
  cash_acct uuid;
  pmt_amt   numeric(14,2);
BEGIN
  SELECT * INTO pmt FROM public.payments_made WHERE id = _payment_id AND deleted_at IS NULL;
  IF pmt.id IS NULL THEN RAISE EXCEPTION 'Payment made not found'; END IF;

  ap_acct   := public._cfg_account(pmt.tenant_id, 'accounts_payable');
  cash_acct := public._cfg_account(pmt.tenant_id, 'cash');
  pmt_amt   := COALESCE(pmt.amount, 0);

  IF ap_acct   IS NULL THEN RAISE EXCEPTION 'Posting config: accounts_payable account not set'; END IF;
  IF cash_acct IS NULL THEN RAISE EXCEPTION 'Posting config: cash account not set'; END IF;
  IF pmt_amt  <= 0     THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;

  PERFORM public._emit_journal(pmt.tenant_id, COALESCE(pmt.date, CURRENT_DATE),
    'Payment made ' || COALESCE(pmt.number, pmt.id::text), 'payment_made', pmt.id,
    jsonb_build_array(
      jsonb_build_object('account_id', ap_acct,   'debit', pmt_amt, 'credit', 0,       'memo', 'AP cleared'),
      jsonb_build_object('account_id', cash_acct, 'debit', 0,       'credit', pmt_amt, 'memo', 'Cash out')
    )
  );

  UPDATE public.payments_made SET status = 'Posted', posted_at = now() WHERE id = _payment_id;
  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (pmt.tenant_id, 'payment_made', pmt.id, 'Posted', 'Payment made posted; AP DR / Cash CR',
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));
  RETURN _payment_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.post_payment_made_unchecked(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────
-- 5f.  post_expense_unchecked
-- ─────────────────────────────────────────────────────────

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
  SELECT * INTO exp FROM public.expenses WHERE id = _expense_id AND deleted_at IS NULL;
  IF exp.id IS NULL THEN RAISE EXCEPTION 'Expense not found'; END IF;

  exp_total := COALESCE(exp.total, exp.amount, 0);
  IF exp_total <= 0 THEN RAISE EXCEPTION 'Expense total must be greater than zero'; END IF;

  -- Debit: use expense's own account, fall back to purchase_expense config
  dr_acct := COALESCE(exp.account_id, public._cfg_account(exp.tenant_id, 'purchase_expense'));
  IF dr_acct IS NULL THEN RAISE EXCEPTION 'Posting config: purchase_expense account not set'; END IF;

  -- Credit: Cash if bank_account_id set, else AP
  IF exp.bank_account_id IS NOT NULL THEN
    cr_acct := public._cfg_account(exp.tenant_id, 'cash');
    IF cr_acct IS NULL THEN RAISE EXCEPTION 'Posting config: cash account not set'; END IF;
  ELSE
    cr_acct := public._cfg_account(exp.tenant_id, 'accounts_payable');
    IF cr_acct IS NULL THEN RAISE EXCEPTION 'Posting config: accounts_payable account not set'; END IF;
  END IF;

  PERFORM public._emit_journal(exp.tenant_id, exp.date::date,
    'Expense ' || COALESCE(exp.number, exp.id::text), 'expense', exp.id,
    jsonb_build_array(
      jsonb_build_object('account_id', dr_acct, 'debit', exp_total, 'credit', 0,         'memo', COALESCE(exp.category, 'Expense')),
      jsonb_build_object('account_id', cr_acct, 'debit', 0,         'credit', exp_total, 'memo', CASE WHEN exp.bank_account_id IS NOT NULL THEN 'Cash/Bank' ELSE 'AP' END)
    )
  );

  UPDATE public.expenses SET status = 'Posted', posted_at = now() WHERE id = _expense_id;
  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (exp.tenant_id, 'expense', exp.id, 'Posted',
          'Expense posted; ' || CASE WHEN exp.bank_account_id IS NOT NULL THEN 'Cash CR' ELSE 'AP CR' END,
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));
  RETURN _expense_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.post_expense_unchecked(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────
-- 5g.  post_adjustment_unchecked
-- ─────────────────────────────────────────────────────────

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
  SELECT * INTO adj FROM public.inventory_adjustments WHERE id = _adjustment_id AND deleted_at IS NULL;
  IF adj.id IS NULL THEN RAISE EXCEPTION 'Adjustment not found'; END IF;

  inv_acct := public._cfg_account(adj.tenant_id, 'inventory');
  var_acct := public._cfg_account(adj.tenant_id, 'inventory_variance');
  val := ROUND(COALESCE(adj.quantity,0) * COALESCE((SELECT cost FROM public.items WHERE id = adj.item_id),0), 2);

  INSERT INTO public.stock_movements (tenant_id, item_id, warehouse_id, quantity, unit_cost, ref_type, ref_id, note, created_by)
  SELECT adj.tenant_id, adj.item_id, adj.warehouse_id, adj.quantity,
         COALESCE(i.cost,0), 'adjustment', adj.id,
         'Adjustment ' || COALESCE(adj.number,''), auth.uid()
  FROM public.items i WHERE i.id = adj.item_id;

  IF val <> 0 AND inv_acct IS NOT NULL AND var_acct IS NOT NULL THEN
    IF val > 0 THEN
      PERFORM public._emit_journal(adj.tenant_id, adj.date::date,
        'Adjustment ' || COALESCE(adj.number,''), 'adjustment', adj.id,
        jsonb_build_array(
          jsonb_build_object('account_id', inv_acct, 'debit', val,      'credit', 0,   'memo', 'Inventory IN'),
          jsonb_build_object('account_id', var_acct, 'debit', 0,        'credit', val, 'memo', 'Inventory variance CR')
        )
      );
    ELSE
      PERFORM public._emit_journal(adj.tenant_id, adj.date::date,
        'Adjustment ' || COALESCE(adj.number,''), 'adjustment', adj.id,
        jsonb_build_array(
          jsonb_build_object('account_id', var_acct, 'debit', ABS(val), 'credit', 0,        'memo', 'Inventory variance DR'),
          jsonb_build_object('account_id', inv_acct, 'debit', 0,        'credit', ABS(val), 'memo', 'Inventory OUT')
        )
      );
    END IF;
  END IF;

  UPDATE public.inventory_adjustments SET status = 'Posted', posted_at = now() WHERE id = _adjustment_id;
  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (adj.tenant_id, 'adjustment', adj.id, 'Posted', 'Inventory adjustment posted',
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));
  RETURN _adjustment_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.post_adjustment_unchecked(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────
-- 5h.  post_bank_transaction — update to use _cfg_account
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_bank_transaction(_txn_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  txn         public.bank_transactions;
  ba          public.bank_accounts;
  dest_ba     public.bank_accounts;
  bank_gl     uuid;
  dest_gl     uuid;
  contra_gl   uuid;
  memo_text   text;
BEGIN
  IF NOT (public.has_permission('banking.create') OR public.has_permission('banking.update')) THEN
    RAISE EXCEPTION 'Not authorized: banking.create' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO txn FROM public.bank_transactions WHERE id = _txn_id AND tenant_id = public.current_tenant_id() FOR UPDATE;
  IF txn.id IS NULL          THEN RAISE EXCEPTION 'Bank transaction not found'; END IF;
  IF txn.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Bank transaction has been deleted'; END IF;
  IF txn.posted_at IS NOT NULL   THEN RETURN _txn_id; END IF;
  IF txn.status = 'Voided'       THEN RAISE EXCEPTION 'Cannot post a voided transaction'; END IF;
  PERFORM public.assert_period_open(public.current_tenant_id(), txn.date);

  SELECT * INTO ba FROM public.bank_accounts WHERE id = txn.bank_account_id AND deleted_at IS NULL;
  bank_gl := COALESCE(ba.gl_account_id, public._cfg_account(txn.tenant_id, 'cash'));
  IF bank_gl IS NULL THEN RAISE EXCEPTION 'Posting config: cash account not set for bank account %', ba.name; END IF;

  contra_gl := txn.contra_account_id;
  IF contra_gl IS NULL AND txn.type IN ('Deposit','Receipt') THEN
    contra_gl := public._cfg_account(txn.tenant_id, 'bank_revenue_contra');
  ELSIF contra_gl IS NULL AND txn.type IN ('Withdrawal','Fee','Payment') THEN
    contra_gl := public._cfg_account(txn.tenant_id, 'bank_expense_contra');
  END IF;

  memo_text := COALESCE(txn.description, txn.type || ' – ' || COALESCE(txn.reference, txn.id::text));

  IF txn.type = 'Transfer' THEN
    IF txn.transfer_to_account_id IS NULL THEN RAISE EXCEPTION 'Transfer must specify a destination account'; END IF;
    SELECT * INTO dest_ba FROM public.bank_accounts WHERE id = txn.transfer_to_account_id AND deleted_at IS NULL;
    dest_gl := COALESCE(dest_ba.gl_account_id, public._cfg_account(txn.tenant_id, 'cash'));
    PERFORM public._emit_journal(txn.tenant_id, txn.date, 'Transfer: ' || ba.name || ' → ' || dest_ba.name, 'bank_transfer', txn.id,
      jsonb_build_array(
        jsonb_build_object('account_id', dest_gl, 'debit', txn.amount, 'credit', 0,           'memo', 'Transfer IN – '  || dest_ba.name),
        jsonb_build_object('account_id', bank_gl, 'debit', 0,          'credit', txn.amount,  'memo', 'Transfer OUT – ' || ba.name)
      )
    );
    UPDATE public.bank_accounts SET balance = COALESCE(balance,0) + txn.amount WHERE id = txn.transfer_to_account_id;
  ELSIF txn.type IN ('Deposit','Receipt') THEN
    IF contra_gl IS NULL THEN RAISE EXCEPTION 'No contra account for % — set bank_revenue_contra in posting config', txn.type; END IF;
    PERFORM public._emit_journal(txn.tenant_id, txn.date, memo_text, 'bank_' || lower(txn.type), txn.id,
      jsonb_build_array(
        jsonb_build_object('account_id', bank_gl,   'debit', txn.amount, 'credit', 0,          'memo', txn.type || ': ' || COALESCE(txn.payee,'')),
        jsonb_build_object('account_id', contra_gl, 'debit', 0,          'credit', txn.amount, 'memo', txn.type || ' – contra')
      )
    );
  ELSE
    IF contra_gl IS NULL THEN RAISE EXCEPTION 'No contra account for % — set bank_expense_contra in posting config', txn.type; END IF;
    PERFORM public._emit_journal(txn.tenant_id, txn.date, memo_text, 'bank_' || lower(txn.type), txn.id,
      jsonb_build_array(
        jsonb_build_object('account_id', contra_gl, 'debit', txn.amount, 'credit', 0,          'memo', txn.type || ' – contra'),
        jsonb_build_object('account_id', bank_gl,   'debit', 0,          'credit', txn.amount, 'memo', txn.type || ': ' || COALESCE(txn.payee,''))
      )
    );
    UPDATE public.bank_accounts SET balance = COALESCE(balance,0) - txn.amount WHERE id = txn.bank_account_id;
  END IF;

  IF txn.type IN ('Deposit','Receipt') THEN
    UPDATE public.bank_accounts SET balance = COALESCE(balance,0) + txn.amount WHERE id = txn.bank_account_id;
  END IF;
  IF txn.type = 'Transfer' THEN
    UPDATE public.bank_accounts SET balance = COALESCE(balance,0) - txn.amount WHERE id = txn.bank_account_id;
  END IF;

  UPDATE public.bank_transactions SET status = 'Posted', posted_at = now(), updated_at = now() WHERE id = _txn_id;
  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (txn.tenant_id, 'bank_transaction', txn.id, 'Posted',
          txn.type || ' of ' || txn.amount || ' posted', auth.uid(),
          (SELECT email FROM public.profiles WHERE id = auth.uid()));
  RETURN _txn_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.post_bank_transaction(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_bank_transaction(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 6.  RPC: upsert_posting_config(purpose, account_id)
--     Callable from the UI settings page.
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_posting_config(
  _purpose    text,
  _account_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.current_tenant_id();
  v_id     uuid;
BEGIN
  IF NOT (public.has_permission('accounting.settings.manage')
       OR public.has_permission('accounting.update')) THEN
    RAISE EXCEPTION 'Not authorized: accounting.settings.manage' USING ERRCODE = '42501';
  END IF;

  -- Validate account belongs to this tenant
  IF _account_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.chart_of_accounts
      WHERE id = _account_id AND tenant_id = v_tenant AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Account does not belong to this tenant';
    END IF;
  END IF;

  INSERT INTO public.posting_config (tenant_id, purpose, account_id, updated_by)
  VALUES (v_tenant, _purpose, _account_id, auth.uid())
  ON CONFLICT (tenant_id, purpose) DO UPDATE SET
    account_id = EXCLUDED.account_id,
    updated_by = auth.uid(),
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_posting_config(text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.upsert_posting_config(text, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 7.  Update get_accounting_dashboard to use _cfg_account
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_accounting_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant  uuid := public.current_tenant_id();
  v_today   date := CURRENT_DATE;
  v_yr_start date := date_trunc('year', CURRENT_DATE)::date;
  v_30      date := CURRENT_DATE - 30;
  v_cash_id uuid; v_ar_id uuid; v_ap_id uuid; v_inv_id uuid;
  v_rev_id  uuid; v_exp5_id uuid; v_exp6_id uuid;
  v_cash_bal numeric:=0; v_ar_bal numeric:=0; v_ap_bal numeric:=0;
  v_inv_bal  numeric:=0; v_revenue numeric:=0; v_expenses numeric:=0;
  v_net_profit numeric:=0;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No active tenant'; END IF;

  v_cash_id  := public._cfg_account(v_tenant, 'cash');
  v_ar_id    := public._cfg_account(v_tenant, 'accounts_receivable');
  v_ap_id    := public._cfg_account(v_tenant, 'accounts_payable');
  v_inv_id   := public._cfg_account(v_tenant, 'inventory');
  v_rev_id   := public._cfg_account(v_tenant, 'sales_revenue');
  v_exp5_id  := public._cfg_account(v_tenant, 'cogs');
  v_exp6_id  := public._cfg_account(v_tenant, 'purchase_expense');

  SELECT COALESCE(coa.opening_balance,0)+COALESCE(SUM(jl.debit),0)-COALESCE(SUM(jl.credit),0)
  INTO v_cash_bal FROM public.chart_of_accounts coa
  LEFT JOIN public.journal_lines jl ON jl.account_id=coa.id AND jl.tenant_id=v_tenant
  LEFT JOIN public.journal_entries je ON je.id=jl.journal_id AND je.status='Posted' AND je.deleted_at IS NULL
  WHERE coa.id=v_cash_id AND coa.tenant_id=v_tenant;

  SELECT COALESCE(coa.opening_balance,0)+COALESCE(SUM(jl.debit),0)-COALESCE(SUM(jl.credit),0)
  INTO v_ar_bal FROM public.chart_of_accounts coa
  LEFT JOIN public.journal_lines jl ON jl.account_id=coa.id AND jl.tenant_id=v_tenant
  LEFT JOIN public.journal_entries je ON je.id=jl.journal_id AND je.status='Posted' AND je.deleted_at IS NULL
  WHERE coa.id=v_ar_id AND coa.tenant_id=v_tenant;

  SELECT COALESCE(coa.opening_balance,0)+COALESCE(SUM(jl.credit),0)-COALESCE(SUM(jl.debit),0)
  INTO v_ap_bal FROM public.chart_of_accounts coa
  LEFT JOIN public.journal_lines jl ON jl.account_id=coa.id AND jl.tenant_id=v_tenant
  LEFT JOIN public.journal_entries je ON je.id=jl.journal_id AND je.status='Posted' AND je.deleted_at IS NULL
  WHERE coa.id=v_ap_id AND coa.tenant_id=v_tenant;

  SELECT COALESCE(coa.opening_balance,0)+COALESCE(SUM(jl.debit),0)-COALESCE(SUM(jl.credit),0)
  INTO v_inv_bal FROM public.chart_of_accounts coa
  LEFT JOIN public.journal_lines jl ON jl.account_id=coa.id AND jl.tenant_id=v_tenant
  LEFT JOIN public.journal_entries je ON je.id=jl.journal_id AND je.status='Posted' AND je.deleted_at IS NULL
  WHERE coa.id=v_inv_id AND coa.tenant_id=v_tenant;

  SELECT COALESCE(SUM(jl.credit),0)-COALESCE(SUM(jl.debit),0) INTO v_revenue
  FROM public.journal_lines jl JOIN public.journal_entries je ON je.id=jl.journal_id
  WHERE jl.account_id=v_rev_id AND jl.tenant_id=v_tenant
    AND je.status='Posted' AND je.deleted_at IS NULL AND je.entry_date>=v_yr_start;

  SELECT COALESCE(SUM(jl.debit),0)-COALESCE(SUM(jl.credit),0) INTO v_expenses
  FROM public.journal_lines jl JOIN public.journal_entries je ON je.id=jl.journal_id
  WHERE jl.account_id IN (v_exp5_id, v_exp6_id) AND jl.tenant_id=v_tenant
    AND je.status='Posted' AND je.deleted_at IS NULL AND je.entry_date>=v_yr_start;

  v_net_profit := COALESCE(v_revenue,0) - COALESCE(v_expenses,0);

  RETURN jsonb_build_object(
    'kpis', jsonb_build_array(
      jsonb_build_object('key','cash',       'label','Cash',        'value',COALESCE(v_cash_bal,0),'href','/accounting/banking',    'up',COALESCE(v_cash_bal,0)>=0),
      jsonb_build_object('key','receivables','label','Receivables', 'value',COALESCE(v_ar_bal,0),  'href','/accounting/ledger',      'up',true),
      jsonb_build_object('key','payables',   'label','Payables',    'value',COALESCE(v_ap_bal,0),  'href','/accounting/ledger',      'up',false),
      jsonb_build_object('key','inventory',  'label','Inventory',   'value',COALESCE(v_inv_bal,0), 'href','/inventory/items',        'up',true),
      jsonb_build_object('key','revenue',    'label','Revenue YTD', 'value',COALESCE(v_revenue,0), 'href','/accounting/profit-loss', 'up',true),
      jsonb_build_object('key','expenses',   'label','Expenses YTD','value',COALESCE(v_expenses,0),'href','/accounting/profit-loss', 'up',false),
      jsonb_build_object('key','net_profit', 'label','Net Profit',  'value',v_net_profit,           'href','/accounting/profit-loss', 'up',v_net_profit>=0)
    ),
    'cash_trend', COALESCE((SELECT jsonb_agg(jsonb_build_object('x',to_char(d,'DD Mon'),'v',
      COALESCE(v_cash_bal,0)-COALESCE((SELECT SUM(jl2.debit)-SUM(jl2.credit) FROM public.journal_lines jl2
        JOIN public.journal_entries je2 ON je2.id=jl2.journal_id WHERE jl2.account_id=v_cash_id
        AND jl2.tenant_id=v_tenant AND je2.status='Posted' AND je2.deleted_at IS NULL AND je2.entry_date>d::date),0))
      ORDER BY d) FROM generate_series(v_30, v_today, interval '1 day') d),'[]'::jsonb),
    'receivables_aging',(SELECT jsonb_build_object('current',COALESCE(SUM(balance_due)FILTER(WHERE v_today-COALESCE(due_date,date)<=0),0),'days_1_30',COALESCE(SUM(balance_due)FILTER(WHERE v_today-COALESCE(due_date,date) BETWEEN 1 AND 30),0),'days_31_60',COALESCE(SUM(balance_due)FILTER(WHERE v_today-COALESCE(due_date,date) BETWEEN 31 AND 60),0),'days_61_90',COALESCE(SUM(balance_due)FILTER(WHERE v_today-COALESCE(due_date,date) BETWEEN 61 AND 90),0),'over_90',COALESCE(SUM(balance_due)FILTER(WHERE v_today-COALESCE(due_date,date)>90),0)) FROM public.invoices WHERE tenant_id=v_tenant AND deleted_at IS NULL AND voided_at IS NULL AND COALESCE(balance_due,0)>0),
    'payables_aging',(SELECT jsonb_build_object('current',COALESCE(SUM(balance_due)FILTER(WHERE v_today-COALESCE(due_date,date)<=0),0),'days_1_30',COALESCE(SUM(balance_due)FILTER(WHERE v_today-COALESCE(due_date,date) BETWEEN 1 AND 30),0),'days_31_60',COALESCE(SUM(balance_due)FILTER(WHERE v_today-COALESCE(due_date,date) BETWEEN 31 AND 60),0),'days_61_90',COALESCE(SUM(balance_due)FILTER(WHERE v_today-COALESCE(due_date,date) BETWEEN 61 AND 90),0),'over_90',COALESCE(SUM(balance_due)FILTER(WHERE v_today-COALESCE(due_date,date)>90),0)) FROM public.bills WHERE tenant_id=v_tenant AND deleted_at IS NULL AND voided_at IS NULL AND COALESCE(balance_due,0)>0),
    'revenue_trend',COALESCE((SELECT jsonb_agg(jsonb_build_object('x',to_char(m,'Mon YY'),'v',rev) ORDER BY m) FROM (SELECT date_trunc('month',je.entry_date)::date m,COALESCE(SUM(jl.credit)-SUM(jl.debit),0) AS rev FROM public.journal_lines jl JOIN public.journal_entries je ON je.id=jl.journal_id WHERE jl.account_id=v_rev_id AND jl.tenant_id=v_tenant AND je.status='Posted' AND je.deleted_at IS NULL AND je.entry_date>=(date_trunc('month',v_today)-interval '5 months')::date GROUP BY 1)t),'[]'::jsonb),
    'expense_trend',COALESCE((SELECT jsonb_agg(jsonb_build_object('x',to_char(m,'Mon YY'),'v',exp) ORDER BY m) FROM (SELECT date_trunc('month',je.entry_date)::date m,COALESCE(SUM(jl.debit)-SUM(jl.credit),0) AS exp FROM public.journal_lines jl JOIN public.journal_entries je ON je.id=jl.journal_id WHERE jl.account_id IN(v_exp5_id,v_exp6_id) AND jl.tenant_id=v_tenant AND je.status='Posted' AND je.deleted_at IS NULL AND je.entry_date>=(date_trunc('month',v_today)-interval '5 months')::date GROUP BY 1)t),'[]'::jsonb),
    'unposted',jsonb_build_object('invoices',(SELECT COUNT(*) FROM public.invoices WHERE tenant_id=v_tenant AND deleted_at IS NULL AND voided_at IS NULL AND posted_at IS NULL AND status NOT IN('Cancelled','Voided')),'bills',(SELECT COUNT(*) FROM public.bills WHERE tenant_id=v_tenant AND deleted_at IS NULL AND voided_at IS NULL AND posted_at IS NULL AND status NOT IN('Cancelled','Voided')),'payments_in',(SELECT COUNT(*) FROM public.payments_received WHERE tenant_id=v_tenant AND deleted_at IS NULL AND voided_at IS NULL AND posted_at IS NULL),'payments_out',(SELECT COUNT(*) FROM public.payments_made WHERE tenant_id=v_tenant AND deleted_at IS NULL AND voided_at IS NULL AND posted_at IS NULL),'journals',(SELECT COUNT(*) FROM public.journal_entries WHERE tenant_id=v_tenant AND deleted_at IS NULL AND status='Draft'),'expenses',(SELECT COUNT(*) FROM public.expenses WHERE tenant_id=v_tenant AND deleted_at IS NULL AND voided_at IS NULL AND posted_at IS NULL AND status NOT IN('Cancelled','Voided'))),
    'reconciliation',COALESCE((SELECT jsonb_agg(jsonb_build_object('account',ba.name,'balance',COALESCE(ba.balance,0),'last_reconciled',(SELECT MAX(r.reconciled_at) FROM public.bank_reconciliations r WHERE r.bank_account_id=ba.id AND r.status='Reconciled'),'last_period',(SELECT r.period_name FROM public.bank_reconciliations r WHERE r.bank_account_id=ba.id AND r.status='Reconciled' ORDER BY r.period_name DESC LIMIT 1),'unreconciled_count',(SELECT COUNT(*) FROM public.bank_transactions bt WHERE bt.bank_account_id=ba.id AND bt.status='Posted' AND bt.reconciliation_id IS NULL AND bt.deleted_at IS NULL)) ORDER BY ba.name) FROM public.bank_accounts ba WHERE ba.tenant_id=v_tenant AND ba.deleted_at IS NULL AND ba.status='Active'),'[]'::jsonb),
    'recent_journals',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',je.id,'number',je.number,'entry_date',je.entry_date,'memo',je.memo,'total_debit',je.total_debit,'source_type',je.source_ref_type,'status',je.status) ORDER BY je.entry_date DESC,je.created_at DESC) FROM (SELECT * FROM public.journal_entries WHERE tenant_id=v_tenant AND deleted_at IS NULL AND status='Posted' ORDER BY entry_date DESC,created_at DESC LIMIT 8)je),'[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_accounting_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_accounting_dashboard() TO authenticated;
