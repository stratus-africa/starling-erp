-- Phase 3: centralized procurement and expense state machines.

ALTER TABLE public.payments_made
  ADD COLUMN IF NOT EXISTS allocation_status text NOT NULL DEFAULT 'Unallocated';

UPDATE public.purchase_requisitions
SET status = CASE
  WHEN lower(COALESCE(status, '')) = 'ordered' OR (converted_po_id IS NOT NULL AND status NOT IN ('Cancelled', 'Rejected')) THEN 'Converted'
  WHEN lower(COALESCE(status, '')) = 'pending' THEN 'Pending Approval'
  ELSE COALESCE(status, 'Draft')
END
WHERE status IS NULL OR status NOT IN ('Draft', 'Submitted', 'Pending Approval', 'Approved', 'Rejected', 'Cancelled', 'Converted');

UPDATE public.purchase_orders
SET status = CASE lower(COALESCE(status, 'draft'))
  WHEN 'confirmed' THEN 'Approved'
  WHEN 'processing' THEN 'Sent'
  WHEN 'completed' THEN 'Closed'
  WHEN 'cancelled' THEN 'Cancelled'
  ELSE COALESCE(status, 'Draft')
END
WHERE status IS NULL OR status NOT IN ('Draft', 'Pending Approval', 'Approved', 'Sent', 'Acknowledged', 'Closed', 'Cancelled');

UPDATE public.expenses
SET status = CASE lower(COALESCE(status, 'draft'))
  WHEN 'unbilled' THEN 'Draft'
  WHEN 'billed' THEN 'Submitted'
  WHEN 'pending' THEN 'Pending Approval'
  ELSE COALESCE(status, 'Draft')
END
WHERE status IS NULL OR status NOT IN ('Draft', 'Submitted', 'Pending Approval', 'Approved', 'Rejected', 'Posted', 'Cancelled');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_made_allocation_status_check') THEN
    ALTER TABLE public.payments_made ADD CONSTRAINT payments_made_allocation_status_check
      CHECK (allocation_status IN ('Unallocated', 'Partially Allocated', 'Fully Allocated'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.procurement_status_transition_allowed(
  _entity_type text, _old_status text, _new_status text
) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _entity_type
    WHEN 'purchase_requisition' THEN (_old_status, _new_status) IN (
      ('Draft','Submitted'), ('Submitted','Pending Approval'),
      ('Pending Approval','Approved'), ('Pending Approval','Rejected'),
      ('Approved','Converted'), ('Draft','Cancelled'), ('Submitted','Cancelled')
    )
    WHEN 'purchase_order' THEN (_old_status, _new_status) IN (
      ('Draft','Pending Approval'), ('Pending Approval','Approved'),
      ('Approved','Sent'), ('Sent','Acknowledged'), ('Acknowledged','Closed'),
      ('Draft','Cancelled'), ('Pending Approval','Cancelled'), ('Approved','Cancelled'),
      ('Sent','Cancelled'), ('Acknowledged','Cancelled')
    )
    WHEN 'supplier_bill' THEN (_old_status, _new_status) IN (
      ('Draft','Pending Approval'), ('Pending Approval','Approved'),
      ('Approved','Posted'), ('Posted','Partially Paid'), ('Posted','Paid'),
      ('Posted','Overdue'), ('Partially Paid','Paid'), ('Partially Paid','Overdue')
    )
    WHEN 'supplier_payment' THEN (_old_status, _new_status) IN (('Draft','Posted'), ('Posted','Voided'))
    WHEN 'expense' THEN (_old_status, _new_status) IN (
      ('Draft','Submitted'), ('Submitted','Pending Approval'),
      ('Pending Approval','Approved'), ('Pending Approval','Rejected'), ('Approved','Posted'),
      ('Posted','Cancelled')
    )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_status_event(
  _entity_type text, _entity_id uuid, _old_status text, _new_status text, _reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.record_business_event(
    'status_changed', _entity_type, _entity_id,
    jsonb_build_object('status', _old_status),
    jsonb_build_object('status', _new_status),
    jsonb_build_object('reason', NULLIF(trim(_reason), ''), 'source', 'procurement_status_machine')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_purchase_requisition(
  _requisition_id uuid, _new_status text, _reason text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_req public.purchase_requisitions; v_old text;
BEGIN
  IF NOT (public.has_permission('purchasing.update') OR public.has_permission('approvals.approve')) THEN RAISE EXCEPTION 'Not authorized: purchasing requisition transition' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_req FROM public.purchase_requisitions WHERE id = _requisition_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase requisition not found for current tenant'; END IF;
  v_old := COALESCE(v_req.status, 'Draft');
  IF v_old = _new_status THEN RETURN v_old; END IF;
  IF NOT public.procurement_status_transition_allowed('purchase_requisition', v_old, _new_status) THEN RAISE EXCEPTION 'Invalid purchase requisition transition: % -> %', v_old, _new_status; END IF;
  IF _new_status IN ('Approved','Rejected') AND NOT (public.has_permission('approvals.approve') OR public.has_permission('purchasing.update')) THEN RAISE EXCEPTION 'Not authorized to decide requisition'; END IF;
  PERFORM set_config('nimbus.procurement_transition', 'on', true);
  UPDATE public.purchase_requisitions SET status = _new_status, approved_at = CASE WHEN _new_status = 'Approved' THEN now() ELSE approved_at END, approved_by = CASE WHEN _new_status = 'Approved' THEN auth.uid() ELSE approved_by END, updated_at = now() WHERE id = _requisition_id;
  PERFORM set_config('nimbus.procurement_transition', 'off', true);
  PERFORM public.procurement_status_event('purchase_requisition', _requisition_id, v_old, _new_status, _reason);
  RETURN _new_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_purchase_order_status(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_order public.purchase_orders; v_ordered numeric; v_received numeric; v_billed numeric; v_paid numeric; v_overdue boolean;
BEGIN
  SELECT * INTO v_order FROM public.purchase_orders WHERE id = _order_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT COALESCE(SUM(quantity),0) INTO v_ordered FROM public.purchase_order_lines WHERE document_id = _order_id AND tenant_id = v_order.tenant_id AND deleted_at IS NULL;
  SELECT COALESCE(SUM(grl.quantity),0) INTO v_received FROM public.goods_receipt_lines grl JOIN public.goods_receipts gr ON gr.id = grl.receipt_id WHERE gr.purchase_order_id = _order_id AND gr.tenant_id = v_order.tenant_id AND gr.status = 'Posted' AND gr.deleted_at IS NULL AND grl.deleted_at IS NULL;
  SELECT COALESCE(SUM(b.grand_total),0), COALESCE(SUM(a.amount),0), BOOL_OR(b.due_date < CURRENT_DATE AND GREATEST(0, b.grand_total - COALESCE(a.paid,0)) > 0) INTO v_billed, v_paid, v_overdue
  FROM public.bills b LEFT JOIN LATERAL (SELECT SUM(spa.amount) paid FROM public.supplier_payment_allocations spa WHERE spa.bill_id = b.id AND spa.deleted_at IS NULL) a ON true
  WHERE b.source_po_id = _order_id AND b.tenant_id = v_order.tenant_id AND b.deleted_at IS NULL AND b.voided_at IS NULL AND b.status NOT IN ('Cancelled','Voided');
  UPDATE public.purchase_orders SET receiving_status = CASE WHEN v_received <= 0 THEN 'Not Received' WHEN v_received >= v_ordered THEN 'Fully Received' ELSE 'Partially Received' END, billing_status = CASE WHEN v_billed <= 0 THEN 'Not Billed' WHEN v_billed >= v_order.grand_total THEN 'Fully Billed' ELSE 'Partially Billed' END, payment_status = CASE WHEN v_overdue THEN 'Overdue' WHEN v_paid <= 0 THEN 'Unpaid' WHEN v_paid >= v_billed THEN 'Paid' ELSE 'Partially Paid' END, updated_at = now() WHERE id = _order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_purchase_order(
  _order_id uuid, _new_status text, _reason text DEFAULT NULL, _force_close boolean DEFAULT false
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_order public.purchase_orders; v_old text; v_lines integer; v_received text; v_line_total numeric;
BEGIN
  IF NOT public.has_permission('purchasing.update') THEN RAISE EXCEPTION 'Not authorized: purchasing.update' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_order FROM public.purchase_orders WHERE id = _order_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found for current tenant'; END IF;
  v_old := COALESCE(v_order.status, 'Draft');
  IF v_old = _new_status THEN RETURN v_old; END IF;
  IF NOT public.procurement_status_transition_allowed('purchase_order', v_old, _new_status) THEN RAISE EXCEPTION 'Invalid purchase order transition: % -> %', v_old, _new_status; END IF;
  SELECT COUNT(*) INTO v_lines FROM public.purchase_order_lines WHERE document_id = _order_id AND tenant_id = v_order.tenant_id AND deleted_at IS NULL AND quantity > 0 AND unit_price >= 0;
  SELECT COALESCE(SUM(line_total), 0) INTO v_line_total FROM public.purchase_order_lines WHERE document_id = _order_id AND tenant_id = v_order.tenant_id AND deleted_at IS NULL;
  IF _new_status = 'Sent' AND (v_order.supplier_id IS NULL OR v_lines = 0 OR v_order.grand_total < 0 OR abs(v_line_total - v_order.grand_total) > 0.01) THEN RAISE EXCEPTION 'Purchase order is not ready to send'; END IF;
  SELECT receiving_status INTO v_received FROM public.purchase_orders WHERE id = _order_id;
  IF _new_status = 'Closed' AND v_received <> 'Fully Received' AND NOT _force_close THEN RAISE EXCEPTION 'Purchase order cannot close before it is fully received'; END IF;
  PERFORM set_config('nimbus.procurement_transition', 'on', true);
  UPDATE public.purchase_orders SET status = _new_status, updated_at = now() WHERE id = _order_id;
  PERFORM set_config('nimbus.procurement_transition', 'off', true);
  PERFORM public.procurement_status_event('purchase_order', _order_id, v_old, _new_status, _reason);
  RETURN _new_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_supplier_bill_status(_bill_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_summary record; v_bill public.bills; v_status text;
BEGIN
  SELECT * INTO v_bill FROM public.bills WHERE id = _bill_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v_summary FROM public.get_supplier_bill_payment_summary(_bill_id);
  v_status := CASE WHEN v_bill.status IN ('Draft','Pending Approval','Approved','Voided','Cancelled') THEN v_bill.status WHEN v_summary.outstanding <= 0.005 THEN 'Paid' WHEN v_summary.amount_paid > 0 THEN 'Partially Paid' WHEN v_summary.payment_status = 'Overdue' THEN 'Overdue' ELSE 'Posted' END;
  PERFORM set_config('nimbus.allow_ap_balance_mutation', 'on', true); PERFORM set_config('nimbus.allow_posted_mutation', 'on', true);
  UPDATE public.bills SET amount_paid = v_summary.amount_paid, balance_due = v_summary.outstanding, balance = v_summary.outstanding, status = v_status, updated_at = now() WHERE id = _bill_id;
  PERFORM set_config('nimbus.allow_ap_balance_mutation', 'off', true); PERFORM set_config('nimbus.allow_posted_mutation', 'off', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_supplier_payment_status(_payment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_amount numeric; v_allocated numeric;
BEGIN
  SELECT amount INTO v_amount FROM public.payments_made WHERE id = _payment_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL;
  SELECT COALESCE(SUM(amount),0) INTO v_allocated FROM public.supplier_payment_allocations WHERE payment_id = _payment_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL;
  UPDATE public.payments_made SET allocation_status = CASE WHEN v_allocated <= 0 THEN 'Unallocated' WHEN v_allocated >= COALESCE(v_amount,0) THEN 'Fully Allocated' ELSE 'Partially Allocated' END, updated_at = now() WHERE id = _payment_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_supplier_bill(_bill_id uuid, _new_status text, _reason text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_bill public.bills; v_old text; v_lines integer; v_sum numeric;
BEGIN
  IF NOT (public.has_permission('purchasing.update') OR public.has_permission('purchasing.post')) THEN RAISE EXCEPTION 'Not authorized: supplier bill transition' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_bill FROM public.bills WHERE id = _bill_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier bill not found for current tenant'; END IF;
  v_old := COALESCE(v_bill.status, 'Draft'); IF v_old = _new_status THEN RETURN v_old; END IF;
  IF NOT public.procurement_status_transition_allowed('supplier_bill', v_old, _new_status) THEN RAISE EXCEPTION 'Invalid supplier bill transition: % -> %', v_old, _new_status; END IF;
  IF _new_status = 'Posted' THEN
    SELECT COUNT(*), COALESCE(SUM(line_total),0) INTO v_lines, v_sum FROM public.bill_lines WHERE document_id = _bill_id AND tenant_id = v_bill.tenant_id AND deleted_at IS NULL AND quantity > 0;
    IF v_bill.supplier_id IS NULL OR v_lines = 0 OR abs(v_sum - v_bill.grand_total) > 0.01 THEN RAISE EXCEPTION 'Supplier bill has invalid supplier, lines, or totals'; END IF;
    IF EXISTS (SELECT 1 FROM public.approval_requests WHERE tenant_id = v_bill.tenant_id AND entity_id = _bill_id AND entity_type IN ('bill','supplier_bill') AND status <> 'approved') THEN RAISE EXCEPTION 'Required supplier bill approvals are incomplete'; END IF;
    PERFORM public.post_bill(_bill_id);
  ELSE
    PERFORM set_config('nimbus.procurement_transition', 'on', true);
    UPDATE public.bills SET status = _new_status, updated_at = now() WHERE id = _bill_id;
    PERFORM set_config('nimbus.procurement_transition', 'off', true);
  END IF;
  PERFORM public.procurement_status_event('supplier_bill', _bill_id, v_old, _new_status, _reason);
  RETURN _new_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_supplier_payment(_payment_id uuid, _new_status text, _reason text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_payment public.payments_made; v_old text;
BEGIN
  SELECT * INTO v_payment FROM public.payments_made WHERE id = _payment_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier payment not found for current tenant'; END IF;
  v_old := COALESCE(v_payment.status, CASE WHEN v_payment.posted_at IS NOT NULL THEN 'Posted' ELSE 'Draft' END); IF v_old = _new_status THEN RETURN v_old; END IF;
  IF NOT public.procurement_status_transition_allowed('supplier_payment', v_old, _new_status) THEN RAISE EXCEPTION 'Invalid supplier payment transition: % -> %', v_old, _new_status; END IF;
  IF _new_status = 'Posted' THEN PERFORM public.post_supplier_payment(_payment_id); ELSE PERFORM public.void_supplier_payment(_payment_id, COALESCE(_reason, 'Supplier payment voided')); END IF;
  PERFORM public.procurement_status_event('supplier_payment', _payment_id, v_old, _new_status, _reason);
  RETURN _new_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_expense_status(_expense_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.expenses SET accounting_status = CASE WHEN posted_at IS NOT NULL AND voided_at IS NULL THEN 'Posted' WHEN voided_at IS NOT NULL THEN 'Voided' ELSE 'Unposted' END, updated_at = now() WHERE id = _expense_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_expense(_expense_id uuid, _new_status text, _reason text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_exp public.expenses; v_old text;
BEGIN
  IF NOT (public.has_permission('purchasing.update') OR public.has_permission('purchasing.post')) THEN RAISE EXCEPTION 'Not authorized: purchasing expense transition' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_exp FROM public.expenses WHERE id = _expense_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found for current tenant'; END IF;
  v_old := COALESCE(v_exp.status, 'Draft'); IF v_old = _new_status THEN RETURN v_old; END IF;
  IF NOT public.procurement_status_transition_allowed('expense', v_old, _new_status) THEN RAISE EXCEPTION 'Invalid expense transition: % -> %', v_old, _new_status; END IF;
  IF _new_status = 'Posted' THEN PERFORM public.post_expense(_expense_id); ELSE PERFORM set_config('nimbus.procurement_transition', 'on', true); UPDATE public.expenses SET status = _new_status, updated_at = now() WHERE id = _expense_id; PERFORM set_config('nimbus.procurement_transition', 'off', true); END IF;
  PERFORM public.procurement_status_event('expense', _expense_id, v_old, _new_status, _reason);
  RETURN _new_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.convert_requisition_to_purchase_order(
  _requisition_id uuid, _supplier_id uuid, _po_date date DEFAULT CURRENT_DATE,
  _expected_date date DEFAULT NULL, _currency text DEFAULT NULL,
  _notes text DEFAULT NULL, _unit_prices jsonb DEFAULT '[]'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_req public.purchase_requisitions; v_supplier public.suppliers; v_po uuid; v_currency text; v_subtotal numeric := 0; v_discount numeric := 0; v_tax numeric := 0; v_grand numeric := 0; v_line record; v_price numeric; v_line_total numeric;
BEGIN
  IF NOT public.has_permission('purchasing.create') THEN RAISE EXCEPTION 'Not authorized: purchasing.create' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_req FROM public.purchase_requisitions WHERE id = _requisition_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase requisition not found for current tenant'; END IF;
  IF v_req.status = 'Converted' AND v_req.converted_po_id IS NOT NULL THEN RETURN v_req.converted_po_id; END IF;
  IF v_req.status <> 'Approved' THEN RAISE EXCEPTION 'Only approved requisitions can be converted'; END IF;
  SELECT * INTO v_supplier FROM public.suppliers WHERE id = _supplier_id AND tenant_id = v_req.tenant_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier not found for current tenant'; END IF;
  v_currency := upper(COALESCE(NULLIF(trim(_currency), ''), v_req.currency, v_supplier.currency));
  IF v_currency IS NULL OR (v_supplier.currency IS NOT NULL AND upper(v_supplier.currency) <> v_currency) THEN RAISE EXCEPTION 'PO currency does not match supplier'; END IF;
  IF EXISTS (SELECT 1 FROM public.purchase_orders WHERE source_requisition_id = _requisition_id AND tenant_id = v_req.tenant_id AND deleted_at IS NULL) THEN SELECT id INTO v_po FROM public.purchase_orders WHERE source_requisition_id = _requisition_id AND tenant_id = v_req.tenant_id AND deleted_at IS NULL ORDER BY created_at LIMIT 1; RETURN v_po; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.purchase_requisition_lines WHERE document_id = _requisition_id AND tenant_id = v_req.tenant_id AND deleted_at IS NULL AND quantity > 0) THEN RAISE EXCEPTION 'Requisition has no valid lines'; END IF;
  INSERT INTO public.purchase_orders (tenant_id, number, date, expected_date, supplier_id, currency, subtotal, discount_total, tax_total, grand_total, amount, status, source_requisition_id, notes, created_by)
  VALUES (v_req.tenant_id, 'PO-' || right(replace(gen_random_uuid()::text, '-',''), 8), _po_date, _expected_date, _supplier_id, v_currency, 0, 0, 0, 0, 0, 'Draft', _requisition_id, _notes, auth.uid()) RETURNING id INTO v_po;
  FOR v_line IN SELECT * FROM public.purchase_requisition_lines WHERE document_id = _requisition_id AND tenant_id = v_req.tenant_id AND deleted_at IS NULL ORDER BY line_no LOOP
    SELECT COALESCE((SELECT (x->>'unit_price')::numeric FROM jsonb_array_elements(_unit_prices) x WHERE (x->>'line_id')::uuid = v_line.id), v_line.unit_price) INTO v_price;
    v_line_total := round(v_line.quantity * v_price * (1 - COALESCE(v_line.discount_pct,0)/100) * (1 + COALESCE(v_line.tax_pct,0)/100), 2);
    v_subtotal := v_subtotal + v_line.quantity * v_price; v_discount := v_discount + v_line.quantity * v_price * COALESCE(v_line.discount_pct,0)/100; v_tax := v_tax + (v_line.quantity * v_price - v_line.quantity * v_price * COALESCE(v_line.discount_pct,0)/100) * COALESCE(v_line.tax_pct,0)/100; v_grand := v_grand + v_line_total;
    INSERT INTO public.purchase_order_lines (tenant_id, document_id, line_no, item_id, description, quantity, unit_price, discount_pct, tax_pct, line_total) VALUES (v_req.tenant_id, v_po, v_line.line_no, v_line.item_id, v_line.description, v_line.quantity, v_price, v_line.discount_pct, v_line.tax_pct, v_line_total);
  END LOOP;
  UPDATE public.purchase_orders SET subtotal = round(v_subtotal,2), discount_total = round(v_discount,2), tax_total = round(v_tax,2), grand_total = round(v_grand,2), amount = round(v_grand,2) WHERE id = v_po;
  PERFORM set_config('nimbus.procurement_transition', 'on', true); UPDATE public.purchase_requisitions SET status = 'Converted', converted_po_id = v_po, updated_at = now() WHERE id = _requisition_id; PERFORM set_config('nimbus.procurement_transition', 'off', true);
  PERFORM public.procurement_status_event('purchase_requisition', _requisition_id, 'Approved', 'Converted', 'Converted to purchase order');
  PERFORM public.record_business_event('created', 'purchase_order', v_po, NULL, jsonb_build_object('source_requisition_id', _requisition_id), jsonb_build_object('source','convert_requisition_to_purchase_order'));
  RETURN v_po;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_supplier_payment_dependents()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_payment uuid := COALESCE(NEW.payment_id, OLD.payment_id); v_bill uuid := COALESCE(NEW.bill_id, OLD.bill_id); v_order uuid;
BEGIN
  PERFORM public.refresh_supplier_payment_status(v_payment); PERFORM public.refresh_supplier_bill_status(v_bill); SELECT source_po_id INTO v_order FROM public.bills WHERE id = v_bill; IF v_order IS NOT NULL THEN PERFORM public.refresh_purchase_order_status(v_order); END IF; IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_refresh_supplier_payment_dependents ON public.supplier_payment_allocations;
CREATE TRIGGER trg_refresh_supplier_payment_dependents AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payment_allocations FOR EACH ROW EXECUTE FUNCTION public.refresh_supplier_payment_dependents();

CREATE OR REPLACE FUNCTION public.refresh_supplier_bill_after_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF current_setting('nimbus.status_refresh', true) = 'on' THEN RETURN NEW; END IF;
  PERFORM set_config('nimbus.status_refresh', 'on', true);
  PERFORM public.refresh_supplier_bill_status(NEW.id);
  IF NEW.source_po_id IS NOT NULL THEN PERFORM public.refresh_purchase_order_status(NEW.source_po_id); END IF;
  PERFORM set_config('nimbus.status_refresh', 'off', true);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_refresh_supplier_bill_after_change ON public.bills;
CREATE TRIGGER trg_refresh_supplier_bill_after_change AFTER INSERT OR UPDATE OF status, posted_at, voided_at, source_po_id ON public.bills FOR EACH ROW EXECUTE FUNCTION public.refresh_supplier_bill_after_change();

CREATE OR REPLACE FUNCTION public.refresh_purchase_order_after_receipt_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_order uuid;
BEGIN
  SELECT purchase_order_id INTO v_order FROM public.goods_receipts WHERE id = COALESCE(NEW.receipt_id, OLD.receipt_id);
  IF v_order IS NOT NULL THEN PERFORM public.refresh_purchase_order_status(v_order); END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_refresh_purchase_order_after_receipt_change ON public.goods_receipt_lines;
CREATE TRIGGER trg_refresh_purchase_order_after_receipt_change AFTER INSERT OR UPDATE OR DELETE ON public.goods_receipt_lines FOR EACH ROW EXECUTE FUNCTION public.refresh_purchase_order_after_receipt_change();

CREATE OR REPLACE FUNCTION public.prevent_direct_procurement_status_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND current_setting('nimbus.procurement_transition', true) IS DISTINCT FROM 'on'
     AND current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'Procurement status changes must use the transition RPC';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['purchase_requisitions', 'purchase_orders', 'bills', 'expenses'] LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_prevent_direct_%s_status ON public.%I', v_table, v_table);
      EXECUTE format('CREATE TRIGGER trg_prevent_direct_%s_status BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_direct_procurement_status_mutation()', v_table, v_table);
    END IF;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.transition_purchase_requisition(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_purchase_order(uuid,text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_supplier_bill(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_supplier_payment(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_expense(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_requisition_to_purchase_order(uuid,uuid,date,date,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_purchase_order_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_supplier_bill_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_supplier_payment_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_expense_status(uuid) TO authenticated;