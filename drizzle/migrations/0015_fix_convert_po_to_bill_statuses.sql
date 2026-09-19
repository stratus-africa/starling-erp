CREATE OR REPLACE FUNCTION public.convert_po_to_bill(_po_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  po public.purchase_orders;
  new_id uuid;
  new_num text;
BEGIN
  SELECT * INTO po FROM public.purchase_orders WHERE id = _po_id AND deleted_at IS NULL;
  IF po.id IS NULL THEN RAISE EXCEPTION 'PO not found'; END IF;
  IF po.tenant_id <> public.current_tenant_id() AND NOT public.is_super_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF po.converted_bill_id IS NOT NULL THEN RETURN po.converted_bill_id; END IF;

  new_num := 'BILL-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,6);

  INSERT INTO public.bills(tenant_id, number, supplier_id, date, due_date, status, subtotal, discount_total, tax_total, grand_total, amount, notes, currency, source_po_id, balance_due, balance, created_by)
  VALUES (po.tenant_id, new_num, po.supplier_id, CURRENT_DATE, CURRENT_DATE + 30, 'Draft', po.subtotal, po.discount_total, po.tax_total, po.grand_total, po.grand_total, po.notes, po.currency, po.id, po.grand_total, po.grand_total, auth.uid())
  RETURNING id INTO new_id;

  INSERT INTO public.bill_lines(tenant_id, document_id, line_no, item_id, description, quantity, unit_price, discount_pct, tax_pct, line_total)
  SELECT tenant_id, new_id, line_no, item_id, description, quantity, unit_price, discount_pct, tax_pct, line_total
  FROM public.purchase_order_lines WHERE document_id = _po_id AND deleted_at IS NULL;

  UPDATE public.purchase_orders SET converted_bill_id = new_id, billing_status = 'Fully Billed' WHERE id = _po_id;
  RETURN new_id;
END
$fn$;

REVOKE ALL ON FUNCTION public.convert_po_to_bill(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_po_to_bill(uuid) TO authenticated, service_role;