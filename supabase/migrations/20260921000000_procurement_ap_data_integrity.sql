-- Phase 1: procurement and accounts-payable data integrity.
-- Existing purchasing tables are part of the base schema. This migration only
-- adds compatible dimensions, receiving records, allocation records, and
-- database-authoritative summaries.

-- -----------------------------------------------------------------------------
-- Canonical lifecycle dimensions
-- -----------------------------------------------------------------------------

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS source_requisition_id uuid,
  ADD COLUMN IF NOT EXISTS receiving_status text NOT NULL DEFAULT 'Not Received',
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'Not Billed',
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'Unpaid';

ALTER TABLE public.purchase_requisitions
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id);

ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS source_receipt_id uuid;

ALTER TABLE public.payments_made
  ADD COLUMN IF NOT EXISTS currency text;

UPDATE public.payments_made p
SET currency = s.currency
FROM public.suppliers s
WHERE p.supplier_id = s.id AND p.tenant_id = s.tenant_id AND p.currency IS NULL;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS accounting_status text NOT NULL DEFAULT 'Unposted',
  ADD COLUMN IF NOT EXISTS reimbursement_status text NOT NULL DEFAULT 'Not Applicable';

UPDATE public.purchase_orders
SET status = CASE lower(COALESCE(status, 'draft'))
  WHEN 'pending' THEN 'Pending Approval'
  WHEN 'pending approval' THEN 'Pending Approval'
  WHEN 'approved' THEN 'Approved'
  WHEN 'sent' THEN 'Sent'
  WHEN 'acknowledged' THEN 'Acknowledged'
  WHEN 'closed' THEN 'Closed'
  WHEN 'cancelled' THEN 'Cancelled'
  ELSE 'Draft'
END,
receiving_status = CASE receiving_status
  WHEN 'Partially Received' THEN 'Partially Received'
  WHEN 'Fully Received' THEN 'Fully Received'
  ELSE 'Not Received'
END,
billing_status = CASE billing_status
  WHEN 'Partially Billed' THEN 'Partially Billed'
  WHEN 'Fully Billed' THEN 'Fully Billed'
  ELSE 'Not Billed'
END,
payment_status = CASE payment_status
  WHEN 'Partially Paid' THEN 'Partially Paid'
  WHEN 'Paid' THEN 'Paid'
  WHEN 'Overdue' THEN 'Overdue'
  ELSE 'Unpaid'
END;

UPDATE public.purchase_requisitions
SET status = CASE lower(COALESCE(status, 'draft'))
  WHEN 'submitted' THEN 'Submitted'
  WHEN 'pending' THEN 'Pending Approval'
  WHEN 'pending approval' THEN 'Pending Approval'
  WHEN 'approved' THEN 'Approved'
  WHEN 'rejected' THEN 'Rejected'
  WHEN 'cancelled' THEN 'Cancelled'
  WHEN 'converted' THEN 'Converted'
  ELSE 'Draft'
END;

UPDATE public.bills
SET status = CASE lower(COALESCE(status, 'draft'))
  WHEN 'pending' THEN 'Pending Approval'
  WHEN 'pending approval' THEN 'Pending Approval'
  WHEN 'approved' THEN 'Approved'
  WHEN 'posted' THEN 'Posted'
  WHEN 'partially paid' THEN 'Partially Paid'
  WHEN 'paid' THEN 'Paid'
  WHEN 'overdue' THEN 'Overdue'
  WHEN 'voided' THEN 'Voided'
  WHEN 'cancelled' THEN 'Cancelled'
  ELSE 'Draft'
END;

UPDATE public.expenses
SET status = CASE lower(COALESCE(status, 'draft'))
  WHEN 'submitted' THEN 'Submitted'
  WHEN 'pending' THEN 'Pending Approval'
  WHEN 'pending approval' THEN 'Pending Approval'
  WHEN 'approved' THEN 'Approved'
  WHEN 'rejected' THEN 'Rejected'
  WHEN 'posted' THEN 'Posted'
  WHEN 'reimbursed' THEN 'Reimbursed'
  WHEN 'cancelled' THEN 'Cancelled'
  ELSE 'Draft'
END,
accounting_status = CASE WHEN posted_at IS NOT NULL THEN 'Posted' ELSE 'Unposted' END,
reimbursement_status = CASE
  WHEN lower(COALESCE(status, '')) = 'reimbursed' THEN 'Reimbursed'
  WHEN supplier_id IS NULL AND bank_account_id IS NULL THEN 'Pending'
  ELSE 'Not Applicable'
END;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_status_check') THEN
    ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_status_check
      CHECK (status IN ('Draft', 'Pending Approval', 'Approved', 'Sent', 'Acknowledged', 'Closed', 'Cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_receiving_status_check') THEN
    ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_receiving_status_check
      CHECK (receiving_status IN ('Not Received', 'Partially Received', 'Fully Received'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_billing_status_check') THEN
    ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_billing_status_check
      CHECK (billing_status IN ('Not Billed', 'Partially Billed', 'Fully Billed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_payment_status_check') THEN
    ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_payment_status_check
      CHECK (payment_status IN ('Unpaid', 'Partially Paid', 'Paid', 'Overdue'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_requisitions_status_check') THEN
    ALTER TABLE public.purchase_requisitions ADD CONSTRAINT purchase_requisitions_status_check
      CHECK (status IN ('Draft', 'Submitted', 'Pending Approval', 'Approved', 'Rejected', 'Cancelled', 'Converted'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bills_status_check') THEN
    ALTER TABLE public.bills ADD CONSTRAINT bills_status_check
      CHECK (status IN ('Draft', 'Pending Approval', 'Approved', 'Posted', 'Partially Paid', 'Paid', 'Overdue', 'Voided', 'Cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_status_check') THEN
    ALTER TABLE public.expenses ADD CONSTRAINT expenses_status_check
      CHECK (status IN ('Draft', 'Submitted', 'Pending Approval', 'Approved', 'Rejected', 'Posted', 'Reimbursed', 'Cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_accounting_status_check') THEN
    ALTER TABLE public.expenses ADD CONSTRAINT expenses_accounting_status_check
      CHECK (accounting_status IN ('Unposted', 'Posted', 'Voided'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_reimbursement_status_check') THEN
    ALTER TABLE public.expenses ADD CONSTRAINT expenses_reimbursement_status_check
      CHECK (reimbursement_status IN ('Not Applicable', 'Pending', 'Partially Reimbursed', 'Reimbursed'));
  END IF;
END $$;

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_source_requisition_fk
  FOREIGN KEY (source_requisition_id) REFERENCES public.purchase_requisitions(id);

CREATE OR REPLACE FUNCTION public.validate_purchase_order_source_requisition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_requisition public.purchase_requisitions;
BEGIN
  IF NEW.source_requisition_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_requisition FROM public.purchase_requisitions
  WHERE id = NEW.source_requisition_id AND tenant_id = NEW.tenant_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source requisition does not belong to the purchase order tenant'; END IF;
  IF v_requisition.status NOT IN ('Approved', 'Converted') THEN
    RAISE EXCEPTION 'Only approved requisitions can become purchase orders';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_purchase_order_source_requisition ON public.purchase_orders;
CREATE TRIGGER trg_validate_purchase_order_source_requisition
BEFORE INSERT OR UPDATE OF source_requisition_id ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.validate_purchase_order_source_requisition();
-- -----------------------------------------------------------------------------
-- Goods/service receiving
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id),
  receipt_number text,
  receipt_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Posted', 'Cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.goods_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  receipt_id uuid NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  purchase_order_line_id uuid NOT NULL REFERENCES public.purchase_order_lines(id),
  quantity numeric(14,4) NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,4) NOT NULL CHECK (unit_price >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS goods_receipts_tenant_po_idx ON public.goods_receipts (tenant_id, purchase_order_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS goods_receipt_lines_tenant_receipt_idx ON public.goods_receipt_lines (tenant_id, receipt_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS goods_receipt_lines_po_line_idx ON public.goods_receipt_lines (tenant_id, purchase_order_line_id) WHERE deleted_at IS NULL;

ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipt_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS goods_receipts_read ON public.goods_receipts;
CREATE POLICY goods_receipts_read ON public.goods_receipts FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_permission('purchasing.read'));
DROP POLICY IF EXISTS goods_receipts_write ON public.goods_receipts;
CREATE POLICY goods_receipts_write ON public.goods_receipts FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_permission('purchasing.update'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission('purchasing.update'));
DROP POLICY IF EXISTS goods_receipt_lines_read ON public.goods_receipt_lines;
CREATE POLICY goods_receipt_lines_read ON public.goods_receipt_lines FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_permission('purchasing.read'));
DROP POLICY IF EXISTS goods_receipt_lines_write ON public.goods_receipt_lines;
CREATE POLICY goods_receipt_lines_write ON public.goods_receipt_lines FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_permission('purchasing.update'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission('purchasing.update'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_receipts, public.goods_receipt_lines TO authenticated;
GRANT ALL ON public.goods_receipts, public.goods_receipt_lines TO service_role;

CREATE OR REPLACE FUNCTION public.validate_goods_receipt_line()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_receipt public.goods_receipts; v_line public.purchase_order_lines;
BEGIN
  SELECT * INTO v_receipt FROM public.goods_receipts WHERE id = NEW.receipt_id AND tenant_id = NEW.tenant_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt does not belong to the receipt line tenant'; END IF;
  SELECT * INTO v_line FROM public.purchase_order_lines WHERE id = NEW.purchase_order_line_id AND tenant_id = NEW.tenant_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order line does not belong to the receipt line tenant'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.purchase_orders WHERE id = v_receipt.purchase_order_id AND tenant_id = NEW.tenant_id AND deleted_at IS NULL)
     OR NOT EXISTS (SELECT 1 FROM public.purchase_order_lines WHERE id = NEW.purchase_order_line_id AND document_id = v_receipt.purchase_order_id) THEN
    RAISE EXCEPTION 'Receipt line must reference a line on its purchase order';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_goods_receipt_line ON public.goods_receipt_lines;
CREATE TRIGGER trg_validate_goods_receipt_line
BEFORE INSERT OR UPDATE ON public.goods_receipt_lines
FOR EACH ROW EXECUTE FUNCTION public.validate_goods_receipt_line();

ALTER TABLE public.bills
  ADD CONSTRAINT bills_source_receipt_fk
  FOREIGN KEY (source_receipt_id) REFERENCES public.goods_receipts(id);

-- -----------------------------------------------------------------------------
-- Supplier payment allocations
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.supplier_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments_made(id),
  bill_id uuid NOT NULL REFERENCES public.bills(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  allocation_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS supplier_payment_allocations_tenant_payment_idx
  ON public.supplier_payment_allocations (tenant_id, payment_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS supplier_payment_allocations_tenant_bill_idx
  ON public.supplier_payment_allocations (tenant_id, bill_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS supplier_payment_allocations_active_unique_idx
  ON public.supplier_payment_allocations (tenant_id, payment_id, bill_id) WHERE deleted_at IS NULL;

ALTER TABLE public.supplier_payment_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS supplier_payment_allocations_read ON public.supplier_payment_allocations;
CREATE POLICY supplier_payment_allocations_read ON public.supplier_payment_allocations FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_permission('payments.read'));
DROP POLICY IF EXISTS supplier_payment_allocations_write ON public.supplier_payment_allocations;
CREATE POLICY supplier_payment_allocations_write ON public.supplier_payment_allocations FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_permission('payments.update'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission('payments.update'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_payment_allocations TO authenticated;
GRANT ALL ON public.supplier_payment_allocations TO service_role;

CREATE TABLE IF NOT EXISTS public.supplier_payment_reconciliation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments_made(id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (tenant_id, payment_id)
);
ALTER TABLE public.supplier_payment_reconciliation_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_payment_reconciliation_queue_read ON public.supplier_payment_reconciliation_queue FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_permission('payments.read'));
GRANT SELECT ON public.supplier_payment_reconciliation_queue TO authenticated;
GRANT ALL ON public.supplier_payment_reconciliation_queue TO service_role;

INSERT INTO public.supplier_payment_reconciliation_queue (tenant_id, payment_id, reason)
SELECT p.tenant_id, p.id, 'Historical payment has no reliable bill relationship; allocation requires reconciliation.'
FROM public.payments_made p
WHERE p.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.supplier_payment_allocations a WHERE a.payment_id = p.id AND a.deleted_at IS NULL)
ON CONFLICT (tenant_id, payment_id) DO NOTHING;

-- Keep cross-tenant and cross-document relationships impossible even for direct
-- inserts. The RPC below adds row locking and the same checks atomically.
CREATE OR REPLACE FUNCTION public.validate_supplier_payment_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_payment public.payments_made;
  v_bill public.bills;
  v_allocated numeric;
  v_bill_paid numeric;
BEGIN
  SELECT * INTO v_payment FROM public.payments_made WHERE id = NEW.payment_id AND tenant_id = NEW.tenant_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment does not belong to the allocation tenant'; END IF;
  SELECT * INTO v_bill FROM public.bills WHERE id = NEW.bill_id AND tenant_id = NEW.tenant_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bill does not belong to the allocation tenant'; END IF;
  IF v_payment.supplier_id IS DISTINCT FROM v_bill.supplier_id THEN RAISE EXCEPTION 'Payment and bill suppliers do not match'; END IF;
  IF upper(COALESCE(v_payment.currency, '')) <> upper(COALESCE(v_bill.currency, '')) THEN RAISE EXCEPTION 'Payment and bill currencies do not match'; END IF;
  IF v_payment.posted_at IS NULL OR v_payment.voided_at IS NOT NULL OR v_payment.reversal_id IS NOT NULL THEN RAISE EXCEPTION 'Payment is not valid for allocation'; END IF;
  IF v_bill.posted_at IS NULL OR v_bill.voided_at IS NOT NULL OR COALESCE(v_bill.status, '') IN ('Voided', 'Cancelled') THEN RAISE EXCEPTION 'Bill is not valid for allocation'; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_allocated FROM public.supplier_payment_allocations WHERE payment_id = NEW.payment_id AND deleted_at IS NULL AND id IS DISTINCT FROM NEW.id;
  IF NEW.amount > COALESCE(v_payment.amount, 0) - v_allocated THEN RAISE EXCEPTION 'Allocation exceeds payment unallocated balance'; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_bill_paid FROM public.supplier_payment_allocations WHERE bill_id = NEW.bill_id AND deleted_at IS NULL AND id IS DISTINCT FROM NEW.id;
  IF NEW.amount > GREATEST(0, COALESCE(v_bill.grand_total, 0) - v_bill_paid) THEN RAISE EXCEPTION 'Allocation exceeds bill outstanding balance'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_supplier_payment_allocation ON public.supplier_payment_allocations;
CREATE TRIGGER trg_validate_supplier_payment_allocation
BEFORE INSERT OR UPDATE ON public.supplier_payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.validate_supplier_payment_allocation();

CREATE OR REPLACE FUNCTION public.allocate_supplier_payment(_payment_id uuid, _allocations jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_payment public.payments_made;
  v_item jsonb;
  v_bill public.bills;
  v_tenant uuid := public.current_tenant_id();
  v_total numeric := 0;
  v_allocated numeric;
  v_count integer := 0;
  v_bill_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT public.has_permission('payments.update') THEN RAISE EXCEPTION 'Not authorized: payments.update' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(_allocations) <> 'array' OR jsonb_array_length(_allocations) = 0 THEN RAISE EXCEPTION 'At least one allocation is required'; END IF;
  SELECT * INTO v_payment FROM public.payments_made WHERE id = _payment_id AND tenant_id = v_tenant AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found for current tenant'; END IF;
  IF v_payment.posted_at IS NULL OR v_payment.voided_at IS NOT NULL OR v_payment.reversal_id IS NOT NULL THEN RAISE EXCEPTION 'Payment is not valid for allocation'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(_allocations) ORDER BY value->>'bill_id' LOOP
    IF (v_item->>'bill_id') IS NULL OR (v_item->>'amount') IS NULL THEN RAISE EXCEPTION 'Each allocation requires bill_id and amount'; END IF;
    IF (v_item->>'bill_id')::uuid = ANY(v_bill_ids) THEN RAISE EXCEPTION 'Duplicate bill allocation in request'; END IF;
    v_bill_ids := array_append(v_bill_ids, (v_item->>'bill_id')::uuid);
    IF round((v_item->>'amount')::numeric, 2) <= 0 THEN RAISE EXCEPTION 'Allocation amount must be greater than zero'; END IF;
    v_total := v_total + round((v_item->>'amount')::numeric, 2);
  END LOOP;
  SELECT COALESCE(SUM(amount), 0) INTO v_allocated FROM public.supplier_payment_allocations WHERE payment_id = _payment_id AND tenant_id = v_tenant AND deleted_at IS NULL;
  IF v_total > COALESCE(v_payment.amount, 0) - v_allocated THEN RAISE EXCEPTION 'Allocation exceeds payment unallocated balance'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(_allocations) ORDER BY value->>'bill_id' LOOP
    SELECT * INTO v_bill FROM public.bills WHERE id = (v_item->>'bill_id')::uuid AND tenant_id = v_tenant AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found for current tenant'; END IF;
    INSERT INTO public.supplier_payment_allocations (tenant_id, payment_id, bill_id, amount, created_by, updated_by)
    VALUES (v_tenant, _payment_id, v_bill.id, round((v_item->>'amount')::numeric, 2), auth.uid(), auth.uid());
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.unallocate_supplier_payment(_allocation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.has_permission('payments.update') THEN RAISE EXCEPTION 'Not authorized: payments.update' USING ERRCODE = '42501'; END IF;
  UPDATE public.supplier_payment_allocations SET deleted_at = now(), updated_at = now(), updated_by = auth.uid()
  WHERE id = _allocation_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active supplier payment allocation not found'; END IF;
  RETURN _allocation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_supplier_payment(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unallocate_supplier_payment(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- Authoritative summaries
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_supplier_bill_payment_summary(_bill_id uuid)
RETURNS TABLE (bill_total numeric, amount_paid numeric, outstanding numeric, credit_applied numeric, payment_status text, overdue_amount numeric, days_overdue integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_bill public.bills; v_paid numeric; v_outstanding numeric;
BEGIN
  SELECT * INTO v_bill FROM public.bills WHERE id = _bill_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found for current tenant'; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM public.supplier_payment_allocations WHERE bill_id = _bill_id AND tenant_id = v_bill.tenant_id AND deleted_at IS NULL;
  v_outstanding := GREATEST(0, COALESCE(v_bill.grand_total, 0) - v_paid);
  RETURN QUERY SELECT COALESCE(v_bill.grand_total, 0), v_paid, v_outstanding, 0::numeric,
    CASE WHEN v_outstanding <= 0.005 THEN 'Paid' WHEN v_paid > 0 THEN 'Partially Paid' WHEN v_bill.due_date < CURRENT_DATE THEN 'Overdue' ELSE 'Unpaid' END,
    CASE WHEN v_bill.due_date < CURRENT_DATE THEN v_outstanding ELSE 0 END,
    CASE WHEN v_bill.due_date < CURRENT_DATE AND v_outstanding > 0 THEN (CURRENT_DATE - v_bill.due_date)::integer ELSE 0 END;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_supplier_payment_allocation_summary(_payment_id uuid)
RETURNS TABLE (payment_amount numeric, allocated_amount numeric, unallocated_amount numeric, allocation_status text, currency text, supplier_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_payment public.payments_made; v_allocated numeric;
BEGIN
  SELECT * INTO v_payment FROM public.payments_made WHERE id = _payment_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found for current tenant'; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_allocated FROM public.supplier_payment_allocations WHERE payment_id = _payment_id AND tenant_id = v_payment.tenant_id AND deleted_at IS NULL;
  RETURN QUERY SELECT COALESCE(v_payment.amount, 0), v_allocated, GREATEST(0, COALESCE(v_payment.amount, 0) - v_allocated),
    CASE WHEN v_allocated <= 0 THEN 'Unallocated' WHEN v_allocated >= COALESCE(v_payment.amount, 0) THEN 'Fully Allocated' ELSE 'Partially Allocated' END,
    v_payment.currency, v_payment.supplier_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_supplier_ap_summary(_supplier_id uuid)
RETURNS TABLE (outstanding numeric, "current" numeric, "1_30" numeric, "31_60" numeric, "61_90" numeric, over_90 numeric, overdue numeric, unallocated_payments numeric, available_credits numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
WITH bill_balances AS (
  SELECT b.id, GREATEST(0, COALESCE(b.grand_total, 0) - COALESCE(SUM(a.amount), 0)) AS balance, b.due_date
  FROM public.bills b LEFT JOIN public.supplier_payment_allocations a ON a.bill_id = b.id AND a.deleted_at IS NULL
  WHERE b.tenant_id = public.current_tenant_id() AND b.supplier_id = _supplier_id AND b.deleted_at IS NULL AND b.voided_at IS NULL AND b.status NOT IN ('Cancelled', 'Voided')
  GROUP BY b.id
), payments AS (
  SELECT GREATEST(0, COALESCE(p.amount, 0) - COALESCE(SUM(a.amount), 0)) AS unallocated
  FROM public.payments_made p LEFT JOIN public.supplier_payment_allocations a ON a.payment_id = p.id AND a.deleted_at IS NULL
  WHERE p.tenant_id = public.current_tenant_id() AND p.supplier_id = _supplier_id AND p.deleted_at IS NULL AND p.voided_at IS NULL
  GROUP BY p.id
)
SELECT COALESCE(SUM(balance), 0), COALESCE(SUM(balance) FILTER (WHERE due_date IS NULL OR due_date >= CURRENT_DATE), 0),
  COALESCE(SUM(balance) FILTER (WHERE due_date < CURRENT_DATE AND CURRENT_DATE - due_date BETWEEN 1 AND 30), 0),
  COALESCE(SUM(balance) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 31 AND 60), 0),
  COALESCE(SUM(balance) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 61 AND 90), 0),
  COALESCE(SUM(balance) FILTER (WHERE CURRENT_DATE - due_date > 90), 0),
  COALESCE(SUM(balance) FILTER (WHERE due_date < CURRENT_DATE), 0),
  COALESCE((SELECT SUM(unallocated) FROM payments), 0), COALESCE((SELECT SUM(unallocated) FROM payments), 0)
FROM bill_balances;
$$;

CREATE OR REPLACE FUNCTION public.get_purchase_order_financial_summary(_order_id uuid)
RETURNS TABLE (order_total numeric, received_value numeric, billed_value numeric, paid_value numeric, remaining_to_receive numeric, remaining_to_bill numeric, outstanding_bill_value numeric, fulfillment_status text, billing_status text, payment_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
WITH po AS (SELECT * FROM public.purchase_orders WHERE id = _order_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL),
ordered AS (SELECT COALESCE(SUM(quantity * unit_price), 0) value FROM public.purchase_order_lines WHERE document_id = _order_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL),
received AS (SELECT COALESCE(SUM(grl.quantity * grl.unit_price), 0) value FROM public.goods_receipt_lines grl JOIN public.goods_receipts gr ON gr.id = grl.receipt_id WHERE gr.purchase_order_id = _order_id AND gr.tenant_id = public.current_tenant_id() AND gr.status = 'Posted' AND gr.deleted_at IS NULL AND grl.deleted_at IS NULL),
bills AS (SELECT COALESCE(SUM(b.grand_total), 0) billed, COALESCE(SUM(b.grand_total - COALESCE((SELECT SUM(a.amount) FROM public.supplier_payment_allocations a WHERE a.bill_id = b.id AND a.deleted_at IS NULL), 0)), 0) outstanding FROM public.bills b WHERE b.source_po_id = _order_id AND b.tenant_id = public.current_tenant_id() AND b.deleted_at IS NULL AND b.voided_at IS NULL AND b.status NOT IN ('Cancelled', 'Voided')),
paid AS (SELECT COALESCE(SUM(a.amount), 0) value FROM public.supplier_payment_allocations a JOIN public.bills b ON b.id = a.bill_id WHERE b.source_po_id = _order_id AND a.tenant_id = public.current_tenant_id() AND a.deleted_at IS NULL)
SELECT po.grand_total, received.value, bills.billed, paid.value, GREATEST(0, po.grand_total - received.value), GREATEST(0, po.grand_total - bills.billed), bills.outstanding,
  CASE WHEN received.value <= 0 THEN 'Not Received' WHEN received.value >= ordered.value THEN 'Fully Received' ELSE 'Partially Received' END,
  CASE WHEN bills.billed <= 0 THEN 'Not Billed' WHEN bills.billed >= po.grand_total THEN 'Fully Billed' ELSE 'Partially Billed' END,
  CASE WHEN bills.outstanding <= 0.005 THEN 'Paid' WHEN paid.value > 0 THEN 'Partially Paid' WHEN EXISTS (SELECT 1 FROM public.bills b WHERE b.source_po_id = _order_id AND b.due_date < CURRENT_DATE AND b.status NOT IN ('Cancelled', 'Voided')) THEN 'Overdue' ELSE 'Unpaid' END
FROM po CROSS JOIN ordered CROSS JOIN received CROSS JOIN bills CROSS JOIN paid;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_bill_payment_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_supplier_payment_allocation_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_supplier_ap_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_purchase_order_financial_summary(uuid) TO authenticated;

CREATE INDEX IF NOT EXISTS purchase_orders_source_requisition_idx ON public.purchase_orders (tenant_id, source_requisition_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS bills_supplier_status_due_idx ON public.bills (tenant_id, supplier_id, status, due_date) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bills_supplier_invoice_number_active_idx ON public.bills (tenant_id, supplier_id, number) WHERE deleted_at IS NULL AND number IS NOT NULL AND created_at >= TIMESTAMPTZ '2026-09-21 00:00:00+00';
CREATE INDEX IF NOT EXISTS payments_made_supplier_date_idx ON public.payments_made (tenant_id, supplier_id, date) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.prevent_direct_bill_balance_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('nimbus.allow_ap_balance_mutation', true) IS DISTINCT FROM 'on'
     AND (NEW.amount_paid IS DISTINCT FROM OLD.amount_paid
       OR NEW.balance IS DISTINCT FROM OLD.balance
       OR NEW.balance_due IS DISTINCT FROM OLD.balance_due) THEN
    RAISE EXCEPTION 'Bill balances are database authoritative and cannot be edited directly';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_direct_bill_balance_mutation ON public.bills;
CREATE TRIGGER trg_prevent_direct_bill_balance_mutation
BEFORE UPDATE ON public.bills
FOR EACH ROW EXECUTE FUNCTION public.prevent_direct_bill_balance_mutation();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_lines_positive_quantity_check') THEN
    ALTER TABLE public.purchase_order_lines ADD CONSTRAINT purchase_order_lines_positive_quantity_check CHECK (quantity > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_requisition_lines_positive_quantity_check') THEN
    ALTER TABLE public.purchase_requisition_lines ADD CONSTRAINT purchase_requisition_lines_positive_quantity_check CHECK (quantity > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bill_lines_positive_quantity_check') THEN
    ALTER TABLE public.bill_lines ADD CONSTRAINT bill_lines_positive_quantity_check CHECK (quantity > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_positive_amount_check') THEN
    ALTER TABLE public.expenses ADD CONSTRAINT expenses_positive_amount_check CHECK (amount > 0 AND total > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_made_positive_amount_check') THEN
    ALTER TABLE public.payments_made ADD CONSTRAINT payments_made_positive_amount_check CHECK (amount > 0) NOT VALID;
  END IF;
END $$;

COMMENT ON TABLE public.supplier_payment_reconciliation_queue IS 'Historical supplier payments without a reliable bill relationship; never auto-allocated.';