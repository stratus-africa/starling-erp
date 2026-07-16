
-- =========================================================
-- Extend sales_quotes, sales_orders, invoices with totals + links + workflow fields
-- =========================================================
ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grand_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS converted_order_id uuid;

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grand_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS source_quote_id uuid,
  ADD COLUMN IF NOT EXISTS converted_invoice_id uuid;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grand_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS source_order_id uuid,
  ADD COLUMN IF NOT EXISTS amount_paid numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_due numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz;

-- =========================================================
-- Generic line-items: sales_quote_lines, sales_order_lines, invoice_lines
-- =========================================================
CREATE TABLE IF NOT EXISTS public.sales_quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
  line_no int NOT NULL DEFAULT 1,
  item_id uuid REFERENCES public.items(id),
  description text NOT NULL DEFAULT '',
  quantity numeric(14,4) NOT NULL DEFAULT 1,
  unit_price numeric(14,4) NOT NULL DEFAULT 0,
  discount_pct numeric(6,3) NOT NULL DEFAULT 0,
  tax_pct numeric(6,3) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_quote_lines TO authenticated;
GRANT ALL ON public.sales_quote_lines TO service_role;
ALTER TABLE public.sales_quote_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY sql_read ON public.sales_quote_lines FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY sql_write ON public.sales_quote_lines FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.tenant_write_ok(ARRAY['sales']::app_role[]))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.tenant_write_ok(ARRAY['sales']::app_role[]));
CREATE INDEX IF NOT EXISTS sql_doc_idx ON public.sales_quote_lines(document_id);
CREATE TRIGGER sql_upd BEFORE UPDATE ON public.sales_quote_lines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.sales_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  line_no int NOT NULL DEFAULT 1,
  item_id uuid REFERENCES public.items(id),
  description text NOT NULL DEFAULT '',
  quantity numeric(14,4) NOT NULL DEFAULT 1,
  unit_price numeric(14,4) NOT NULL DEFAULT 0,
  discount_pct numeric(6,3) NOT NULL DEFAULT 0,
  tax_pct numeric(6,3) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_order_lines TO authenticated;
GRANT ALL ON public.sales_order_lines TO service_role;
ALTER TABLE public.sales_order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY sol_read ON public.sales_order_lines FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY sol_write ON public.sales_order_lines FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.tenant_write_ok(ARRAY['sales']::app_role[]))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.tenant_write_ok(ARRAY['sales']::app_role[]));
CREATE INDEX IF NOT EXISTS sol_doc_idx ON public.sales_order_lines(document_id);
CREATE TRIGGER sol_upd BEFORE UPDATE ON public.sales_order_lines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  line_no int NOT NULL DEFAULT 1,
  item_id uuid REFERENCES public.items(id),
  description text NOT NULL DEFAULT '',
  quantity numeric(14,4) NOT NULL DEFAULT 1,
  unit_price numeric(14,4) NOT NULL DEFAULT 0,
  discount_pct numeric(6,3) NOT NULL DEFAULT 0,
  tax_pct numeric(6,3) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_lines TO authenticated;
GRANT ALL ON public.invoice_lines TO service_role;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY il_read ON public.invoice_lines FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY il_write ON public.invoice_lines FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.tenant_write_ok(ARRAY['sales','accounting']::app_role[]))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.tenant_write_ok(ARRAY['sales','accounting']::app_role[]));
CREATE INDEX IF NOT EXISTS il_doc_idx ON public.invoice_lines(document_id);
CREATE TRIGGER il_upd BEFORE UPDATE ON public.invoice_lines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =========================================================
-- Stock movements ledger (append-only)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items(id),
  warehouse_id uuid REFERENCES public.warehouses(id),
  quantity numeric(14,4) NOT NULL,  -- positive = in, negative = out
  unit_cost numeric(14,4) NOT NULL DEFAULT 0,
  ref_type text NOT NULL,  -- 'invoice','bill','adjustment','transfer','production'
  ref_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
GRANT SELECT, INSERT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY sm_read ON public.stock_movements FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY sm_insert ON public.stock_movements FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_tenant_id());
CREATE INDEX IF NOT EXISTS sm_item_idx ON public.stock_movements(tenant_id, item_id);
CREATE INDEX IF NOT EXISTS sm_ref_idx ON public.stock_movements(ref_type, ref_id);

-- =========================================================
-- Journal lines (double-entry rows for journal_entries)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  journal_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id),
  debit numeric(14,2) NOT NULL DEFAULT 0,
  credit numeric(14,2) NOT NULL DEFAULT 0,
  memo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.journal_lines TO authenticated;
GRANT ALL ON public.journal_lines TO service_role;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY jl_read ON public.journal_lines FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY jl_insert ON public.journal_lines FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_tenant_id());
CREATE INDEX IF NOT EXISTS jl_journal_idx ON public.journal_lines(journal_id);

-- Add source_ref_type/id + status/total to journal_entries (idempotent)
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS source_ref_type text,
  ADD COLUMN IF NOT EXISTS source_ref_id uuid,
  ADD COLUMN IF NOT EXISTS total_debit numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_credit numeric(14,2) NOT NULL DEFAULT 0;

-- =========================================================
-- Payment applications (allocate customer payment across invoices)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.payment_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments_received(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.payment_applications TO authenticated;
GRANT ALL ON public.payment_applications TO service_role;
ALTER TABLE public.payment_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY pa_read ON public.payment_applications FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY pa_write ON public.payment_applications FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.tenant_write_ok(ARRAY['sales','accounting']::app_role[]))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.tenant_write_ok(ARRAY['sales','accounting']::app_role[]));
CREATE INDEX IF NOT EXISTS pa_invoice_idx ON public.payment_applications(invoice_id);

-- =========================================================
-- RPCs: convert / post / apply payment
-- =========================================================

-- Helper: fetch account id by code within current tenant
CREATE OR REPLACE FUNCTION public._account_id(_tenant uuid, _code text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM chart_of_accounts WHERE tenant_id = _tenant AND code = _code AND deleted_at IS NULL LIMIT 1
$$;

-- convert_quote_to_order
CREATE OR REPLACE FUNCTION public.convert_quote_to_order(_quote_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q sales_quotes;
  new_id uuid;
  new_num text;
BEGIN
  SELECT * INTO q FROM sales_quotes WHERE id = _quote_id AND deleted_at IS NULL;
  IF q.id IS NULL THEN RAISE EXCEPTION 'Quote not found'; END IF;
  IF q.tenant_id <> current_tenant_id() AND NOT is_super_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF q.converted_order_id IS NOT NULL THEN RETURN q.converted_order_id; END IF;

  new_num := 'SO-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,6);

  INSERT INTO sales_orders(tenant_id, number, customer_id, order_date, status, subtotal, discount_total, tax_total, grand_total, notes, currency, source_quote_id, created_by)
  VALUES (q.tenant_id, new_num, q.customer_id, CURRENT_DATE, 'draft', q.subtotal, q.discount_total, q.tax_total, q.grand_total, q.notes, q.currency, q.id, auth.uid())
  RETURNING id INTO new_id;

  INSERT INTO sales_order_lines(tenant_id, document_id, line_no, item_id, description, quantity, unit_price, discount_pct, tax_pct, line_total)
  SELECT tenant_id, new_id, line_no, item_id, description, quantity, unit_price, discount_pct, tax_pct, line_total
  FROM sales_quote_lines WHERE document_id = _quote_id AND deleted_at IS NULL;

  UPDATE sales_quotes SET converted_order_id = new_id, status = 'accepted' WHERE id = _quote_id;
  RETURN new_id;
END $$;

-- convert_order_to_invoice
CREATE OR REPLACE FUNCTION public.convert_order_to_invoice(_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o sales_orders;
  new_id uuid;
  new_num text;
BEGIN
  SELECT * INTO o FROM sales_orders WHERE id = _order_id AND deleted_at IS NULL;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.tenant_id <> current_tenant_id() AND NOT is_super_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF o.converted_invoice_id IS NOT NULL THEN RETURN o.converted_invoice_id; END IF;

  new_num := 'INV-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,6);

  INSERT INTO invoices(tenant_id, number, customer_id, invoice_date, due_date, status, subtotal, discount_total, tax_total, grand_total, notes, currency, source_order_id, balance_due, created_by)
  VALUES (o.tenant_id, new_num, o.customer_id, CURRENT_DATE, CURRENT_DATE + 30, 'draft', o.subtotal, o.discount_total, o.tax_total, o.grand_total, o.notes, o.currency, o.id, o.grand_total, auth.uid())
  RETURNING id INTO new_id;

  INSERT INTO invoice_lines(tenant_id, document_id, line_no, item_id, description, quantity, unit_price, discount_pct, tax_pct, line_total)
  SELECT tenant_id, new_id, line_no, item_id, description, quantity, unit_price, discount_pct, tax_pct, line_total
  FROM sales_order_lines WHERE document_id = _order_id AND deleted_at IS NULL;

  UPDATE sales_orders SET converted_invoice_id = new_id, status = 'invoiced' WHERE id = _order_id;
  RETURN new_id;
END $$;

-- post_invoice: creates journal + stock movements
CREATE OR REPLACE FUNCTION public.post_invoice(_invoice_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv invoices;
  j_id uuid;
  ar_acct uuid; rev_acct uuid; tax_acct uuid; cogs_acct uuid; inv_acct uuid;
  cogs_total numeric(14,2) := 0;
  line record;
  wh uuid;
BEGIN
  SELECT * INTO inv FROM invoices WHERE id = _invoice_id AND deleted_at IS NULL;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF inv.tenant_id <> current_tenant_id() AND NOT is_super_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF inv.posted_at IS NOT NULL THEN RAISE EXCEPTION 'Invoice already posted'; END IF;

  ar_acct   := _account_id(inv.tenant_id, '1100');
  rev_acct  := _account_id(inv.tenant_id, '4000');
  tax_acct  := _account_id(inv.tenant_id, '2000');
  cogs_acct := _account_id(inv.tenant_id, '5000');
  inv_acct  := _account_id(inv.tenant_id, '1200');

  SELECT id INTO wh FROM warehouses WHERE tenant_id = inv.tenant_id AND deleted_at IS NULL ORDER BY created_at LIMIT 1;

  -- Journal header
  INSERT INTO journal_entries(tenant_id, entry_date, memo, source_ref_type, source_ref_id, total_debit, total_credit, created_by)
  VALUES (inv.tenant_id, CURRENT_DATE, 'Invoice ' || inv.number, 'invoice', inv.id, inv.grand_total, inv.grand_total, auth.uid())
  RETURNING id INTO j_id;

  -- AR debit
  INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
  VALUES (inv.tenant_id, j_id, ar_acct, inv.grand_total, 0, 'AR');

  -- Revenue credit (subtotal - discount)
  INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
  VALUES (inv.tenant_id, j_id, rev_acct, 0, inv.subtotal - inv.discount_total, 'Revenue');

  -- Tax credit
  IF inv.tax_total > 0 THEN
    INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES (inv.tenant_id, j_id, tax_acct, 0, inv.tax_total, 'Tax payable');
  END IF;

  -- Stock movements + COGS for stocked items
  FOR line IN
    SELECT il.*, i.type as item_type, i.purchase_price
    FROM invoice_lines il LEFT JOIN items i ON i.id = il.item_id
    WHERE il.document_id = _invoice_id AND il.deleted_at IS NULL AND il.item_id IS NOT NULL
  LOOP
    IF line.item_type = 'inventory' OR line.item_type IS NULL THEN
      INSERT INTO stock_movements(tenant_id, item_id, warehouse_id, quantity, unit_cost, ref_type, ref_id, note, created_by)
      VALUES (inv.tenant_id, line.item_id, wh, -line.quantity, COALESCE(line.purchase_price,0), 'invoice', inv.id, 'Invoice ' || inv.number, auth.uid());
      cogs_total := cogs_total + (COALESCE(line.purchase_price,0) * line.quantity);
    END IF;
  END LOOP;

  IF cogs_total > 0 AND cogs_acct IS NOT NULL AND inv_acct IS NOT NULL THEN
    INSERT INTO journal_entries(tenant_id, entry_date, memo, source_ref_type, source_ref_id, total_debit, total_credit, created_by)
    VALUES (inv.tenant_id, CURRENT_DATE, 'COGS for ' || inv.number, 'invoice_cogs', inv.id, cogs_total, cogs_total, auth.uid())
    RETURNING id INTO j_id;
    INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES (inv.tenant_id, j_id, cogs_acct, cogs_total, 0, 'COGS');
    INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES (inv.tenant_id, j_id, inv_acct, 0, cogs_total, 'Inventory');
  END IF;

  UPDATE invoices SET status = 'posted', posted_at = now(), balance_due = grand_total - amount_paid WHERE id = _invoice_id;
  RETURN _invoice_id;
END $$;

-- apply_payment: allocate payments_received across invoices
CREATE OR REPLACE FUNCTION public.apply_payment(_payment_id uuid, _allocations jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p payments_received;
  alloc jsonb;
  inv_id uuid;
  amt numeric(14,2);
  total_alloc numeric(14,2) := 0;
  j_id uuid;
  cash_acct uuid; ar_acct uuid;
  bank_acct_code text := '1000';
BEGIN
  SELECT * INTO p FROM payments_received WHERE id = _payment_id AND deleted_at IS NULL;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF p.tenant_id <> current_tenant_id() AND NOT is_super_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;

  DELETE FROM payment_applications WHERE payment_id = _payment_id;

  FOR alloc IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
    inv_id := (alloc->>'invoice_id')::uuid;
    amt := (alloc->>'amount')::numeric;
    IF amt <= 0 THEN CONTINUE; END IF;
    INSERT INTO payment_applications(tenant_id, payment_id, invoice_id, amount)
    VALUES (p.tenant_id, _payment_id, inv_id, amt);
    UPDATE invoices SET amount_paid = amount_paid + amt, balance_due = grand_total - (amount_paid + amt),
           status = CASE WHEN (amount_paid + amt) >= grand_total THEN 'paid' ELSE status END
    WHERE id = inv_id;
    total_alloc := total_alloc + amt;
  END LOOP;

  cash_acct := _account_id(p.tenant_id, bank_acct_code);
  ar_acct   := _account_id(p.tenant_id, '1100');

  IF total_alloc > 0 AND cash_acct IS NOT NULL AND ar_acct IS NOT NULL THEN
    INSERT INTO journal_entries(tenant_id, entry_date, memo, source_ref_type, source_ref_id, total_debit, total_credit, created_by)
    VALUES (p.tenant_id, CURRENT_DATE, 'Payment ' || COALESCE(p.reference,''), 'payment_received', p.id, total_alloc, total_alloc, auth.uid())
    RETURNING id INTO j_id;
    INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES (p.tenant_id, j_id, cash_acct, total_alloc, 0, 'Cash received');
    INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES (p.tenant_id, j_id, ar_acct, 0, total_alloc, 'AR settled');
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.convert_quote_to_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_order_to_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_payment(uuid, jsonb) TO authenticated;
