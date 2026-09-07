-- Phase 5: supplier bill/AP workflow, duplicate protection, credits, and history.

ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS supplier_invoice_number text,
  ADD COLUMN IF NOT EXISTS duplicate_override_reason text,
  ADD COLUMN IF NOT EXISTS duplicate_override_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS duplicate_override_at timestamptz;

CREATE INDEX IF NOT EXISTS bills_supplier_invoice_lookup_idx
  ON public.bills (tenant_id, supplier_id, lower(supplier_invoice_number))
  WHERE deleted_at IS NULL AND supplier_invoice_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bills_supplier_invoice_new_unique_idx
  ON public.bills (tenant_id, supplier_id, lower(supplier_invoice_number))
  WHERE deleted_at IS NULL AND supplier_invoice_number IS NOT NULL AND created_at >= TIMESTAMPTZ '2026-09-25 00:00:00+00';

INSERT INTO public.permissions (code, module, action, description) VALUES
  ('purchasing.bill_duplicate_override', 'purchasing', 'bill_duplicate_override', 'Override duplicate supplier invoice protection')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

DROP POLICY IF EXISTS centralized_bills_insert ON public.bills;
CREATE POLICY centralized_bills_insert ON public.bills FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission('purchasing.create') AND current_setting('nimbus.supplier_bill_create', true) = 'on');

CREATE TABLE IF NOT EXISTS public.supplier_credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  number text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  currency text NOT NULL,
  total numeric(14,2) NOT NULL CHECK (total > 0),
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Posted','Voided','Cancelled')),
  notes text,
  posted_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.supplier_credit_note_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  credit_note_id uuid NOT NULL REFERENCES public.supplier_credit_notes(id),
  bill_id uuid NOT NULL REFERENCES public.bills(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  application_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS supplier_credit_note_applications_bill_idx ON public.supplier_credit_note_applications (tenant_id, bill_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS supplier_credit_note_applications_note_idx ON public.supplier_credit_note_applications (tenant_id, credit_note_id) WHERE deleted_at IS NULL;
ALTER TABLE public.supplier_credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_credit_note_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_credit_notes_read ON public.supplier_credit_notes FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() AND public.has_permission('purchasing.read'));
CREATE POLICY supplier_credit_note_applications_read ON public.supplier_credit_note_applications FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() AND public.has_permission('purchasing.read'));
GRANT SELECT ON public.supplier_credit_notes, public.supplier_credit_note_applications TO authenticated;
GRANT ALL ON public.supplier_credit_notes, public.supplier_credit_note_applications TO service_role;

CREATE OR REPLACE FUNCTION public.create_supplier_bill(
  _supplier_id uuid, _date date, _due_date date, _currency text,
  _supplier_invoice_number text DEFAULT NULL, _source_po_id uuid DEFAULT NULL,
  _source_receipt_id uuid DEFAULT NULL, _lines jsonb DEFAULT '[]'::jsonb,
  _notes text DEFAULT NULL, _duplicate_override_reason text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.current_tenant_id(); v_supplier public.suppliers; v_bill uuid; v_po public.purchase_orders; v_receipt public.goods_receipts; v_item jsonb; v_line_no integer := 0; v_qty numeric; v_price numeric; v_discount numeric; v_tax numeric; v_total numeric; v_subtotal numeric := 0; v_discount_total numeric := 0; v_tax_total numeric := 0; v_grand_total numeric := 0; v_duplicate boolean;
BEGIN
  IF NOT public.has_permission('purchasing.create') THEN RAISE EXCEPTION 'Not authorized: purchasing.create' USING ERRCODE = '42501'; END IF;
  IF _lines IS NULL OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN RAISE EXCEPTION 'At least one bill line is required'; END IF;
  SELECT * INTO v_supplier FROM public.suppliers WHERE id = _supplier_id AND tenant_id = v_tenant AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier not found for current tenant'; END IF;
  IF _currency IS NULL OR upper(_currency) <> upper(COALESCE(v_supplier.currency, _currency)) THEN RAISE EXCEPTION 'Bill currency does not match supplier'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.bills WHERE tenant_id = v_tenant AND supplier_id = _supplier_id AND lower(supplier_invoice_number) = lower(NULLIF(trim(_supplier_invoice_number), '')) AND deleted_at IS NULL AND status NOT IN ('Cancelled','Voided')) INTO v_duplicate;
  IF v_duplicate AND (NULLIF(trim(_duplicate_override_reason), '') IS NULL OR NOT public.has_permission('purchasing.bill_duplicate_override')) THEN RAISE EXCEPTION 'Duplicate supplier invoice number requires an authorized override'; END IF;
  IF _source_po_id IS NOT NULL THEN
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = _source_po_id AND tenant_id = v_tenant AND deleted_at IS NULL;
    IF NOT FOUND OR v_po.supplier_id IS DISTINCT FROM _supplier_id THEN RAISE EXCEPTION 'Source purchase order is invalid for this supplier'; END IF;
  END IF;
  IF _source_receipt_id IS NOT NULL THEN
    SELECT * INTO v_receipt FROM public.goods_receipts WHERE id = _source_receipt_id AND tenant_id = v_tenant AND deleted_at IS NULL AND status = 'Posted';
    IF NOT FOUND OR v_receipt.supplier_id IS DISTINCT FROM _supplier_id THEN RAISE EXCEPTION 'Source receipt is invalid for this supplier'; END IF;
    IF _source_po_id IS NULL THEN _source_po_id := v_receipt.purchase_order_id; END IF;
  END IF;
  PERFORM set_config('nimbus.supplier_bill_create', 'on', true);
  INSERT INTO public.bills (tenant_id, supplier_id, number, supplier_invoice_number, date, due_date, currency, subtotal, discount_total, tax_total, grand_total, amount, balance, balance_due, status, source_po_id, source_receipt_id, notes, duplicate_override_reason, duplicate_override_by, duplicate_override_at, created_by)
  VALUES (v_tenant, _supplier_id, 'BILL-' || right(replace(gen_random_uuid()::text, '-',''), 8), NULLIF(trim(_supplier_invoice_number), ''), COALESCE(_date, CURRENT_DATE), _due_date, upper(_currency), 0, 0, 0, 0, 0, 0, 0, 'Draft', _source_po_id, _source_receipt_id, _notes, NULLIF(trim(_duplicate_override_reason), ''), CASE WHEN v_duplicate THEN auth.uid() END, CASE WHEN v_duplicate THEN now() END, auth.uid()) RETURNING id INTO v_bill;
  FOR v_item IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    v_line_no := v_line_no + 1; v_qty := COALESCE((v_item->>'quantity')::numeric, 0); v_price := COALESCE((v_item->>'unit_price')::numeric, 0); v_discount := COALESCE((v_item->>'discount_pct')::numeric, 0); v_tax := COALESCE((v_item->>'tax_pct')::numeric, 0);
    IF v_qty <= 0 OR v_price < 0 THEN RAISE EXCEPTION 'Bill quantities must be positive and prices non-negative'; END IF;
    v_total := round(v_qty * v_price * (1 - v_discount / 100) * (1 + v_tax / 100), 2); v_subtotal := v_subtotal + v_qty * v_price; v_discount_total := v_discount_total + v_qty * v_price * v_discount / 100; v_tax_total := v_tax_total + (v_qty * v_price - v_qty * v_price * v_discount / 100) * v_tax / 100; v_grand_total := v_grand_total + v_total;
    INSERT INTO public.bill_lines (tenant_id, document_id, line_no, item_id, description, quantity, unit_price, discount_pct, tax_pct, line_total) VALUES (v_tenant, v_bill, v_line_no, (v_item->>'item_id')::uuid, v_item->>'description', v_qty, v_price, v_discount, v_tax, v_total);
  END LOOP;
  UPDATE public.bills SET subtotal = round(v_subtotal,2), discount_total = round(v_discount_total,2), tax_total = round(v_tax_total,2), grand_total = round(v_grand_total,2), amount = round(v_grand_total,2), balance = round(v_grand_total,2), balance_due = round(v_grand_total,2) WHERE id = v_bill;
  PERFORM set_config('nimbus.supplier_bill_create', 'off', true);
  RETURN v_bill;
EXCEPTION WHEN OTHERS THEN PERFORM set_config('nimbus.supplier_bill_create', 'off', true); RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_supplier_bill_ap_detail(_bill_id uuid)
RETURNS TABLE (bill_total numeric, amount_paid numeric, credit_applied numeric, outstanding numeric, payment_status text, overdue_amount numeric, days_overdue integer, match_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
WITH bill AS (SELECT * FROM public.bills WHERE id = _bill_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL), paid AS (SELECT COALESCE(SUM(amount),0) amount FROM public.supplier_payment_allocations WHERE bill_id = _bill_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL), credits AS (SELECT COALESCE(SUM(amount),0) amount FROM public.supplier_credit_note_applications WHERE bill_id = _bill_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL), match AS (SELECT * FROM public.validate_supplier_bill_against_po(_bill_id)) SELECT bill.grand_total, paid.amount, credits.amount, GREATEST(0, bill.grand_total - paid.amount - credits.amount), CASE WHEN GREATEST(0, bill.grand_total - paid.amount - credits.amount) <= 0.005 THEN 'Paid' WHEN paid.amount > 0 THEN 'Partially Paid' WHEN bill.due_date < CURRENT_DATE AND bill.posted_at IS NOT NULL THEN 'Overdue' ELSE 'Unpaid' END, CASE WHEN bill.due_date < CURRENT_DATE AND bill.posted_at IS NOT NULL THEN GREATEST(0, bill.grand_total - paid.amount - credits.amount) ELSE 0 END, CASE WHEN bill.due_date < CURRENT_DATE AND bill.posted_at IS NOT NULL AND GREATEST(0, bill.grand_total - paid.amount - credits.amount) > 0 THEN CURRENT_DATE - bill.due_date ELSE 0 END, COALESCE((SELECT match_status FROM match WHERE (SELECT source_po_id FROM public.bills WHERE id = _bill_id) IS NOT NULL), 'Not Applicable') FROM bill CROSS JOIN paid CROSS JOIN credits;
$$;

CREATE OR REPLACE FUNCTION public.apply_supplier_credit_note(_credit_note_id uuid, _bill_id uuid, _amount numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_note public.supplier_credit_notes; v_bill public.bills; v_used numeric; v_bill_used numeric; v_paid numeric; v_application_id uuid;
BEGIN
  IF NOT public.has_permission('purchasing.update') THEN RAISE EXCEPTION 'Not authorized: purchasing.update' USING ERRCODE = '42501'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Credit application must be greater than zero'; END IF;
  SELECT * INTO v_note FROM public.supplier_credit_notes WHERE id = _credit_note_id AND tenant_id = public.current_tenant_id() AND status = 'Posted' AND deleted_at IS NULL FOR UPDATE;
  SELECT * INTO v_bill FROM public.bills WHERE id = _bill_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL AND status NOT IN ('Cancelled','Voided') FOR UPDATE;
  IF NOT FOUND OR v_note.supplier_id IS DISTINCT FROM v_bill.supplier_id OR upper(v_note.currency) <> upper(v_bill.currency) THEN RAISE EXCEPTION 'Credit note and bill are not compatible'; END IF;
  SELECT COALESCE(SUM(amount),0) INTO v_used FROM public.supplier_credit_note_applications WHERE credit_note_id = _credit_note_id AND deleted_at IS NULL;
  SELECT COALESCE(SUM(amount),0) INTO v_bill_used FROM public.supplier_credit_note_applications WHERE bill_id = _bill_id AND deleted_at IS NULL;
  IF _amount > v_note.total - v_used THEN RAISE EXCEPTION 'Credit application exceeds available credit'; END IF;
  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.supplier_payment_allocations WHERE bill_id = _bill_id AND deleted_at IS NULL;
  IF _amount > v_bill.grand_total - v_bill_used - v_paid THEN RAISE EXCEPTION 'Credit application exceeds bill outstanding balance'; END IF;
  INSERT INTO public.supplier_credit_note_applications (tenant_id, credit_note_id, bill_id, amount, created_by) VALUES (v_bill.tenant_id, _credit_note_id, _bill_id, round(_amount,2), auth.uid()) RETURNING id INTO v_application_id;
  RETURN v_application_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_supplier_bill(uuid,date,date,text,text,uuid,uuid,jsonb,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_supplier_bill_ap_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_supplier_credit_note(uuid,uuid,numeric) TO authenticated;