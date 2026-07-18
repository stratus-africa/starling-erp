
-- Extend purchase_orders
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grand_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS expected_date date,
  ADD COLUMN IF NOT EXISTS converted_bill_id uuid;

-- Extend bills
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grand_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS source_po_id uuid,
  ADD COLUMN IF NOT EXISTS amount_paid numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_due numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz;

-- Extend payments_made
ALTER TABLE public.payments_made
  ADD COLUMN IF NOT EXISTS reference text;

-- purchase_order_lines
CREATE TABLE IF NOT EXISTS public.purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  document_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  line_no int NOT NULL DEFAULT 1,
  item_id uuid,
  description text,
  quantity numeric(14,4) NOT NULL DEFAULT 0,
  unit_price numeric(14,4) NOT NULL DEFAULT 0,
  discount_pct numeric(6,2) NOT NULL DEFAULT 0,
  tax_pct numeric(6,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_lines TO authenticated;
GRANT ALL ON public.purchase_order_lines TO service_role;
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_lines_tenant_read" ON public.purchase_order_lines FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY "po_lines_tenant_write" ON public.purchase_order_lines FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE INDEX IF NOT EXISTS idx_po_lines_doc ON public.purchase_order_lines(document_id) WHERE deleted_at IS NULL;

-- bill_lines
CREATE TABLE IF NOT EXISTS public.bill_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  document_id uuid NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  line_no int NOT NULL DEFAULT 1,
  item_id uuid,
  description text,
  quantity numeric(14,4) NOT NULL DEFAULT 0,
  unit_price numeric(14,4) NOT NULL DEFAULT 0,
  discount_pct numeric(6,2) NOT NULL DEFAULT 0,
  tax_pct numeric(6,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bill_lines TO authenticated;
GRANT ALL ON public.bill_lines TO service_role;
ALTER TABLE public.bill_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bill_lines_tenant_read" ON public.bill_lines FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY "bill_lines_tenant_write" ON public.bill_lines FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE INDEX IF NOT EXISTS idx_bill_lines_doc ON public.bill_lines(document_id) WHERE deleted_at IS NULL;

-- payment_made_applications
CREATE TABLE IF NOT EXISTS public.payment_made_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  payment_id uuid NOT NULL REFERENCES public.payments_made(id) ON DELETE CASCADE,
  bill_id uuid NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_made_applications TO authenticated;
GRANT ALL ON public.payment_made_applications TO service_role;
ALTER TABLE public.payment_made_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pma_read" ON public.payment_made_applications FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY "pma_write" ON public.payment_made_applications FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_super_admin());

-- Update trigger for line tables
CREATE TRIGGER trg_po_lines_updated BEFORE UPDATE ON public.purchase_order_lines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_bill_lines_updated BEFORE UPDATE ON public.bill_lines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RPC: convert PO to Bill
CREATE OR REPLACE FUNCTION public.convert_po_to_bill(_po_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  po purchase_orders;
  new_id uuid;
  new_num text;
BEGIN
  SELECT * INTO po FROM purchase_orders WHERE id = _po_id AND deleted_at IS NULL;
  IF po.id IS NULL THEN RAISE EXCEPTION 'PO not found'; END IF;
  IF po.tenant_id <> current_tenant_id() AND NOT is_super_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF po.converted_bill_id IS NOT NULL THEN RETURN po.converted_bill_id; END IF;

  new_num := 'BILL-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,6);

  INSERT INTO bills(tenant_id, number, supplier_id, date, due_date, status, subtotal, discount_total, tax_total, grand_total, amount, notes, currency, source_po_id, balance_due, balance, created_by)
  VALUES (po.tenant_id, new_num, po.supplier_id, CURRENT_DATE, CURRENT_DATE + 30, 'Pending', po.subtotal, po.discount_total, po.tax_total, po.grand_total, po.grand_total, po.notes, po.currency, po.id, po.grand_total, po.grand_total, auth.uid())
  RETURNING id INTO new_id;

  INSERT INTO bill_lines(tenant_id, document_id, line_no, item_id, description, quantity, unit_price, discount_pct, tax_pct, line_total)
  SELECT tenant_id, new_id, line_no, item_id, description, quantity, unit_price, discount_pct, tax_pct, line_total
  FROM purchase_order_lines WHERE document_id = _po_id AND deleted_at IS NULL;

  UPDATE purchase_orders SET converted_bill_id = new_id, status = 'Billed' WHERE id = _po_id;
  RETURN new_id;
END $$;

-- RPC: post_bill — AP credit, Inventory/Expense debit, stock movements in
CREATE OR REPLACE FUNCTION public.post_bill(_bill_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b bills;
  j_id uuid;
  ap_acct uuid; inv_acct uuid; exp_acct uuid; tax_acct uuid;
  wh uuid;
  line record;
  stock_total numeric(14,2) := 0;
  expense_total numeric(14,2) := 0;
BEGIN
  SELECT * INTO b FROM bills WHERE id = _bill_id AND deleted_at IS NULL;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Bill not found'; END IF;
  IF b.tenant_id <> current_tenant_id() AND NOT is_super_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF b.posted_at IS NOT NULL THEN RAISE EXCEPTION 'Bill already posted'; END IF;

  ap_acct  := _account_id(b.tenant_id, '2000');
  inv_acct := _account_id(b.tenant_id, '1200');
  exp_acct := _account_id(b.tenant_id, '6000');
  tax_acct := _account_id(b.tenant_id, '1200'); -- input tax (simplified into inventory)

  SELECT id INTO wh FROM warehouses WHERE tenant_id = b.tenant_id AND deleted_at IS NULL ORDER BY created_at LIMIT 1;

  FOR line IN
    SELECT bl.*, i.type AS item_type
    FROM bill_lines bl LEFT JOIN items i ON i.id = bl.item_id
    WHERE bl.document_id = _bill_id AND bl.deleted_at IS NULL
  LOOP
    IF line.item_id IS NOT NULL AND (line.item_type IS NULL OR line.item_type NOT IN ('Service')) THEN
      INSERT INTO stock_movements(tenant_id, item_id, warehouse_id, quantity, unit_cost, ref_type, ref_id, note, created_by)
      VALUES (b.tenant_id, line.item_id, wh, line.quantity, line.unit_price, 'bill', b.id, 'Bill ' || b.number, auth.uid());
      stock_total := stock_total + line.line_total;
    ELSE
      expense_total := expense_total + line.line_total;
    END IF;
  END LOOP;

  INSERT INTO journal_entries(tenant_id, entry_date, memo, source_ref_type, source_ref_id, total_debit, total_credit, created_by)
  VALUES (b.tenant_id, CURRENT_DATE, 'Bill ' || b.number, 'bill', b.id, b.grand_total, b.grand_total, auth.uid())
  RETURNING id INTO j_id;

  IF stock_total > 0 AND inv_acct IS NOT NULL THEN
    INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES (b.tenant_id, j_id, inv_acct, stock_total, 0, 'Inventory in');
  END IF;
  IF expense_total > 0 AND exp_acct IS NOT NULL THEN
    INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES (b.tenant_id, j_id, exp_acct, expense_total, 0, 'Expense');
  END IF;
  IF ap_acct IS NOT NULL THEN
    INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES (b.tenant_id, j_id, ap_acct, 0, b.grand_total, 'AP');
  END IF;

  UPDATE bills SET status = 'Posted', posted_at = now(), balance_due = grand_total - amount_paid, balance = grand_total - amount_paid WHERE id = _bill_id;
  RETURN _bill_id;
END $$;

-- RPC: apply_payment_made — allocations jsonb: [{ bill_id, amount }]
CREATE OR REPLACE FUNCTION public.apply_payment_made(_payment_id uuid, _allocations jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p payments_made;
  alloc jsonb;
  bill_id_v uuid;
  amt numeric(14,2);
  total_alloc numeric(14,2) := 0;
  j_id uuid;
  cash_acct uuid; ap_acct uuid;
BEGIN
  SELECT * INTO p FROM payments_made WHERE id = _payment_id AND deleted_at IS NULL;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF p.tenant_id <> current_tenant_id() AND NOT is_super_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;

  DELETE FROM payment_made_applications WHERE payment_id = _payment_id;

  FOR alloc IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
    bill_id_v := (alloc->>'bill_id')::uuid;
    amt := (alloc->>'amount')::numeric;
    IF amt <= 0 THEN CONTINUE; END IF;
    INSERT INTO payment_made_applications(tenant_id, payment_id, bill_id, amount)
    VALUES (p.tenant_id, _payment_id, bill_id_v, amt);
    UPDATE bills SET amount_paid = amount_paid + amt,
           balance_due = grand_total - (amount_paid + amt),
           balance = grand_total - (amount_paid + amt),
           status = CASE WHEN (amount_paid + amt) >= grand_total THEN 'Paid' ELSE status END
    WHERE id = bill_id_v;
    total_alloc := total_alloc + amt;
  END LOOP;

  cash_acct := _account_id(p.tenant_id, '1000');
  ap_acct   := _account_id(p.tenant_id, '2000');

  IF total_alloc > 0 AND cash_acct IS NOT NULL AND ap_acct IS NOT NULL THEN
    INSERT INTO journal_entries(tenant_id, entry_date, memo, source_ref_type, source_ref_id, total_debit, total_credit, created_by)
    VALUES (p.tenant_id, CURRENT_DATE, 'Payment ' || COALESCE(p.reference,''), 'payment_made', p.id, total_alloc, total_alloc, auth.uid())
    RETURNING id INTO j_id;
    INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES (p.tenant_id, j_id, ap_acct, total_alloc, 0, 'AP paid');
    INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES (p.tenant_id, j_id, cash_acct, 0, total_alloc, 'Cash out');
  END IF;
END $$;
