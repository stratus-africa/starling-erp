CREATE OR REPLACE FUNCTION public.refresh_purchase_order_status(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE v_order public.purchase_orders; v_ordered numeric; v_received numeric; v_billed numeric; v_paid numeric; v_overdue boolean;
BEGIN
  SELECT * INTO v_order FROM public.purchase_orders WHERE id = _order_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT COALESCE(SUM(quantity),0) INTO v_ordered FROM public.purchase_order_lines WHERE document_id = _order_id AND tenant_id = v_order.tenant_id AND deleted_at IS NULL;
  SELECT COALESCE(SUM(grl.quantity),0) INTO v_received FROM public.goods_receipt_lines grl JOIN public.goods_receipts gr ON gr.id = grl.receipt_id WHERE gr.purchase_order_id = _order_id AND gr.tenant_id = v_order.tenant_id AND gr.status = 'Posted' AND gr.deleted_at IS NULL AND grl.deleted_at IS NULL;
  SELECT COALESCE(SUM(b.grand_total),0), COALESCE(SUM(COALESCE(a.paid,0)),0), BOOL_OR(b.due_date < CURRENT_DATE AND GREATEST(0, b.grand_total - COALESCE(a.paid,0)) > 0)
    INTO v_billed, v_paid, v_overdue
  FROM public.bills b LEFT JOIN LATERAL (SELECT SUM(spa.amount) paid FROM public.supplier_payment_allocations spa WHERE spa.bill_id = b.id AND spa.deleted_at IS NULL) a ON true
  WHERE b.source_po_id = _order_id AND b.tenant_id = v_order.tenant_id AND b.deleted_at IS NULL AND b.voided_at IS NULL AND b.status NOT IN ('Cancelled','Voided');
  UPDATE public.purchase_orders SET
    receiving_status = CASE WHEN v_received <= 0 THEN 'Not Received' WHEN v_received >= v_ordered THEN 'Fully Received' ELSE 'Partially Received' END,
    billing_status = CASE WHEN v_billed <= 0 THEN 'Not Billed' WHEN v_billed >= v_order.grand_total THEN 'Fully Billed' ELSE 'Partially Billed' END,
    payment_status = CASE WHEN v_overdue THEN 'Overdue' WHEN v_paid <= 0 THEN 'Unpaid' WHEN v_paid >= v_billed THEN 'Paid' ELSE 'Partially Paid' END,
    updated_at = now()
  WHERE id = _order_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.refresh_purchase_order_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_purchase_order_status(uuid) TO authenticated, service_role;