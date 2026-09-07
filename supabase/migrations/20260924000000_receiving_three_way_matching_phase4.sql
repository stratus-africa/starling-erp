-- Phase 4: first-class goods/service receiving and three-way matching.

ALTER TABLE public.goods_receipts
  ADD COLUMN IF NOT EXISTS supplier_id uuid,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid,
  ADD COLUMN IF NOT EXISTS receipt_type text NOT NULL DEFAULT 'Goods',
  ADD COLUMN IF NOT EXISTS service_period_start date,
  ADD COLUMN IF NOT EXISTS service_period_end date,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS accepted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS posted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS receiving_status text NOT NULL DEFAULT 'Not Received';

ALTER TABLE public.goods_receipt_lines
  ADD COLUMN IF NOT EXISTS accepted_quantity numeric(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejected_quantity numeric(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS location_id uuid,
  ADD COLUMN IF NOT EXISTS lot_id uuid,
  ADD COLUMN IF NOT EXISTS serial_id uuid,
  ADD COLUMN IF NOT EXISTS service_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS description text;

UPDATE public.goods_receipt_lines
SET accepted_quantity = quantity
WHERE accepted_quantity = 0 AND quantity > 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goods_receipts_type_check') THEN
    ALTER TABLE public.goods_receipts ADD CONSTRAINT goods_receipts_type_check CHECK (receipt_type IN ('Goods', 'Service'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goods_receipts_receiving_status_check') THEN
    ALTER TABLE public.goods_receipts ADD CONSTRAINT goods_receipts_receiving_status_check CHECK (receiving_status IN ('Not Received', 'Partially Received', 'Fully Received'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goods_receipt_lines_quantities_check') THEN
    ALTER TABLE public.goods_receipt_lines ADD CONSTRAINT goods_receipt_lines_quantities_check CHECK (accepted_quantity >= 0 AND rejected_quantity >= 0 AND accepted_quantity + rejected_quantity > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goods_receipts_supplier_fk') THEN
    ALTER TABLE public.goods_receipts ADD CONSTRAINT goods_receipts_supplier_fk FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goods_receipts_warehouse_fk') THEN
    ALTER TABLE public.goods_receipts ADD CONSTRAINT goods_receipts_warehouse_fk FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goods_receipt_lines_location_fk') THEN
    ALTER TABLE public.goods_receipt_lines ADD CONSTRAINT goods_receipt_lines_location_fk FOREIGN KEY (location_id) REFERENCES public.warehouse_locations(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goods_receipt_lines_lot_fk') THEN
    ALTER TABLE public.goods_receipt_lines ADD CONSTRAINT goods_receipt_lines_lot_fk FOREIGN KEY (lot_id) REFERENCES public.item_lots(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goods_receipt_lines_serial_fk') THEN
    ALTER TABLE public.goods_receipt_lines ADD CONSTRAINT goods_receipt_lines_serial_fk FOREIGN KEY (serial_id) REFERENCES public.item_serials(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS goods_receipts_tenant_status_idx ON public.goods_receipts (tenant_id, status, receipt_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS goods_receipt_lines_lot_serial_idx ON public.goods_receipt_lines (tenant_id, lot_id, serial_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.procurement_match_tolerances (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  quantity_tolerance_pct numeric(8,4) NOT NULL DEFAULT 0 CHECK (quantity_tolerance_pct >= 0),
  price_tolerance_pct numeric(8,4) NOT NULL DEFAULT 0 CHECK (price_tolerance_pct >= 0),
  amount_tolerance_pct numeric(8,4) NOT NULL DEFAULT 0 CHECK (amount_tolerance_pct >= 0),
  tax_tolerance_pct numeric(8,4) NOT NULL DEFAULT 0 CHECK (tax_tolerance_pct >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.procurement_match_tolerances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS procurement_match_tolerances_read ON public.procurement_match_tolerances;
CREATE POLICY procurement_match_tolerances_read ON public.procurement_match_tolerances FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() AND public.has_permission('purchasing.read'));
DROP POLICY IF EXISTS procurement_match_tolerances_write ON public.procurement_match_tolerances;
CREATE POLICY procurement_match_tolerances_write ON public.procurement_match_tolerances FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id() AND public.has_permission('purchasing.update')) WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission('purchasing.update'));
GRANT SELECT, INSERT, UPDATE ON public.procurement_match_tolerances TO authenticated;
GRANT ALL ON public.procurement_match_tolerances TO service_role;

ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS match_override_reason text,
  ADD COLUMN IF NOT EXISTS match_override_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS match_override_at timestamptz;

-- Existing receipt write policies are replaced by RPC-only capabilities.
DROP POLICY IF EXISTS goods_receipts_write ON public.goods_receipts;
CREATE POLICY goods_receipts_write ON public.goods_receipts FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_permission('purchasing.update') AND current_setting('nimbus.receipt_write', true) = 'on')
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission('purchasing.update') AND current_setting('nimbus.receipt_write', true) = 'on');
DROP POLICY IF EXISTS goods_receipt_lines_write ON public.goods_receipt_lines;
CREATE POLICY goods_receipt_lines_write ON public.goods_receipt_lines FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_permission('purchasing.update') AND current_setting('nimbus.receipt_write', true) = 'on')
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission('purchasing.update') AND current_setting('nimbus.receipt_write', true) = 'on');

CREATE OR REPLACE FUNCTION public.create_purchase_receipt(
  _purchase_order_id uuid,
  _warehouse_id uuid DEFAULT NULL,
  _receipt_type text DEFAULT 'Goods',
  _lines jsonb DEFAULT '[]'::jsonb,
  _receipt_date date DEFAULT CURRENT_DATE,
  _description text DEFAULT NULL,
  _service_period_start date DEFAULT NULL,
  _service_period_end date DEFAULT NULL,
  _allow_overreceipt boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_po public.purchase_orders; v_supplier uuid; v_receipt uuid; v_item jsonb; v_line public.purchase_order_lines; v_prev numeric; v_accept numeric; v_reject numeric; v_allow boolean := _allow_overreceipt AND public.has_permission('purchasing.post');
BEGIN
  IF NOT public.has_permission('purchasing.update') THEN RAISE EXCEPTION 'Not authorized: purchasing.update' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN RAISE EXCEPTION 'At least one receipt line is required'; END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = _purchase_order_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found for current tenant'; END IF;
  IF v_po.status IN ('Draft', 'Cancelled', 'Closed') THEN RAISE EXCEPTION 'Purchase order is not receivable in status %', v_po.status; END IF;
  IF _receipt_type = 'Goods' AND _warehouse_id IS NULL THEN RAISE EXCEPTION 'Warehouse is required for goods receipts'; END IF;
  IF _receipt_type NOT IN ('Goods', 'Service') THEN RAISE EXCEPTION 'Invalid receipt type'; END IF;
  v_supplier := v_po.supplier_id;
  PERFORM set_config('nimbus.receipt_write', 'on', true);
  INSERT INTO public.goods_receipts (tenant_id, purchase_order_id, supplier_id, warehouse_id, receipt_number, receipt_date, receipt_type, description, service_period_start, service_period_end, created_by)
  VALUES (v_po.tenant_id, _purchase_order_id, v_supplier, _warehouse_id, 'GR-' || right(replace(gen_random_uuid()::text, '-',''), 8), COALESCE(_receipt_date, CURRENT_DATE), _receipt_type, _description, _service_period_start, _service_period_end, auth.uid()) RETURNING id INTO v_receipt;
  FOR v_item IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    SELECT * INTO v_line FROM public.purchase_order_lines WHERE id = (v_item->>'purchase_order_line_id')::uuid AND document_id = _purchase_order_id AND tenant_id = v_po.tenant_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Receipt line does not belong to this purchase order'; END IF;
    v_accept := COALESCE((v_item->>'accepted_quantity')::numeric, (v_item->>'quantity')::numeric, 0);
    v_reject := COALESCE((v_item->>'rejected_quantity')::numeric, 0);
    IF v_accept < 0 OR v_reject < 0 OR v_accept + v_reject <= 0 THEN RAISE EXCEPTION 'Receipt quantities must be non-negative and non-zero'; END IF;
    SELECT COALESCE(SUM(COALESCE(accepted_quantity, quantity) + COALESCE(rejected_quantity, 0)), 0) INTO v_prev FROM public.goods_receipt_lines grl JOIN public.goods_receipts gr ON gr.id = grl.receipt_id WHERE grl.purchase_order_line_id = v_line.id AND grl.tenant_id = v_po.tenant_id AND gr.status = 'Posted' AND gr.deleted_at IS NULL AND grl.deleted_at IS NULL;
    IF NOT v_allow AND v_prev + v_accept + v_reject > v_line.quantity + 0.0001 THEN RAISE EXCEPTION 'Receipt exceeds remaining quantity for PO line %', v_line.line_no; END IF;
    INSERT INTO public.goods_receipt_lines (tenant_id, receipt_id, purchase_order_line_id, quantity, accepted_quantity, rejected_quantity, unit_price, unit, location_id, lot_id, serial_id, service_amount, description, created_by)
    VALUES (v_po.tenant_id, v_receipt, v_line.id, v_accept, v_accept, v_reject, COALESCE((v_item->>'unit_price')::numeric, v_line.unit_price), v_item->>'unit', (v_item->>'location_id')::uuid, (v_item->>'lot_id')::uuid, (v_item->>'serial_id')::uuid, (v_item->>'service_amount')::numeric, v_item->>'description', auth.uid());
  END LOOP;
  PERFORM set_config('nimbus.receipt_write', 'off', true);
  RETURN v_receipt;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('nimbus.receipt_write', 'off', true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_purchase_receipt(_receipt_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_receipt public.goods_receipts; v_line record; v_item public.items; v_movement uuid;
BEGIN
  IF NOT public.has_permission('purchasing.post') THEN RAISE EXCEPTION 'Not authorized: purchasing.post' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_receipt FROM public.goods_receipts WHERE id = _receipt_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase receipt not found for current tenant'; END IF;
  IF v_receipt.status = 'Posted' THEN RETURN _receipt_id; END IF;
  IF v_receipt.status <> 'Draft' THEN RAISE EXCEPTION 'Receipt cannot be posted from status %', v_receipt.status; END IF;
  FOR v_line IN SELECT grl.*, pol.item_id, pol.description AS po_description FROM public.goods_receipt_lines grl JOIN public.purchase_order_lines pol ON pol.id = grl.purchase_order_line_id WHERE grl.receipt_id = _receipt_id AND grl.deleted_at IS NULL FOR UPDATE LOOP
    IF v_receipt.receipt_type = 'Goods' AND v_line.accepted_quantity > 0 THEN
      IF v_line.item_id IS NULL THEN RAISE EXCEPTION 'Goods receipt line % has no inventory item', v_line.id; END IF;
      SELECT * INTO v_item FROM public.items WHERE id = v_line.item_id AND tenant_id = v_receipt.tenant_id AND deleted_at IS NULL;
      IF NOT FOUND THEN RAISE EXCEPTION 'Receipt item not found'; END IF;
      INSERT INTO public.stock_movements (tenant_id, item_id, warehouse_id, location_id, lot_id, serial_id, quantity, unit_cost, uom, ref_type, ref_id, note, created_by)
      VALUES (v_receipt.tenant_id, v_line.item_id, v_receipt.warehouse_id, v_line.location_id, v_line.lot_id, v_line.serial_id, v_line.accepted_quantity, v_line.unit_price, v_line.unit, 'purchase_receipt', _receipt_id, COALESCE(v_line.description, v_line.po_description, 'Purchase receipt'), auth.uid()) RETURNING id INTO v_movement;
    END IF;
  END LOOP;
  PERFORM set_config('nimbus.receipt_write', 'on', true);
  UPDATE public.goods_receipts SET status = 'Posted', posted_at = now(), posted_by = auth.uid(), accepted_at = COALESCE(accepted_at, now()), accepted_by = COALESCE(accepted_by, auth.uid()), receiving_status = CASE WHEN EXISTS (SELECT 1 FROM public.goods_receipt_lines WHERE receipt_id = _receipt_id AND accepted_quantity > 0) THEN 'Fully Received' ELSE 'Not Received' END, updated_at = now() WHERE id = _receipt_id;
  PERFORM set_config('nimbus.receipt_write', 'off', true);
  PERFORM public.refresh_purchase_order_status(v_receipt.purchase_order_id);
  PERFORM set_config('nimbus.receipt_write', 'on', true);
  UPDATE public.goods_receipts SET receiving_status = (SELECT receiving_status FROM public.purchase_orders WHERE id = v_receipt.purchase_order_id), updated_at = now() WHERE id = _receipt_id;
  PERFORM set_config('nimbus.receipt_write', 'off', true);
  PERFORM public.record_business_event('posted', 'purchase_receipt', _receipt_id, NULL, jsonb_build_object('purchase_order_id', v_receipt.purchase_order_id), jsonb_build_object('source','post_purchase_receipt'));
  RETURN _receipt_id;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('nimbus.receipt_write', 'off', true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_purchase_receipt_status(_receipt_id uuid)
RETURNS TABLE (receipt_status text, receiving_status text, accepted_quantity numeric, rejected_quantity numeric, received_value numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
SELECT gr.status, gr.receiving_status, COALESCE(SUM(grl.accepted_quantity),0), COALESCE(SUM(grl.rejected_quantity),0), COALESCE(SUM(grl.accepted_quantity * grl.unit_price),0)
FROM public.goods_receipts gr LEFT JOIN public.goods_receipt_lines grl ON grl.receipt_id = gr.id AND grl.deleted_at IS NULL
WHERE gr.id = _receipt_id AND gr.tenant_id = public.current_tenant_id() AND gr.deleted_at IS NULL
GROUP BY gr.id;
$$;

CREATE OR REPLACE FUNCTION public.get_purchase_order_receiving_status(_order_id uuid)
RETURNS TABLE (line_id uuid, item_id uuid, ordered_quantity numeric, previously_received numeric, remaining_quantity numeric, rejected_quantity numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
SELECT pol.id, pol.item_id, pol.quantity, COALESCE(SUM(grl.accepted_quantity),0), GREATEST(0, pol.quantity - COALESCE(SUM(grl.accepted_quantity + grl.rejected_quantity),0)), COALESCE(SUM(grl.rejected_quantity),0)
FROM public.purchase_order_lines pol LEFT JOIN public.goods_receipt_lines grl ON grl.purchase_order_line_id = pol.id AND grl.deleted_at IS NULL LEFT JOIN public.goods_receipts gr ON gr.id = grl.receipt_id AND gr.status = 'Posted' AND gr.deleted_at IS NULL
WHERE pol.document_id = _order_id AND pol.tenant_id = public.current_tenant_id() AND pol.deleted_at IS NULL
GROUP BY pol.id;
$$;

CREATE OR REPLACE FUNCTION public.get_purchase_three_way_match(_bill_id uuid)
RETURNS TABLE (bill_line_id uuid, po_line_id uuid, bill_quantity numeric, received_quantity numeric, po_unit_price numeric, bill_unit_price numeric, bill_amount numeric, expected_amount numeric, quantity_variance numeric, price_variance numeric, amount_variance numeric, tax_variance numeric, match_status text, matched boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
WITH b AS (SELECT b.*, bl.id bill_line_id, bl.item_id bill_item_id, bl.quantity bill_quantity, bl.unit_price bill_unit_price, bl.line_total bill_amount, bl.tax_pct bill_tax_pct FROM public.bills b JOIN public.bill_lines bl ON bl.document_id = b.id AND bl.deleted_at IS NULL WHERE b.id = _bill_id AND b.tenant_id = public.current_tenant_id() AND b.deleted_at IS NULL), matched AS (SELECT b.*, pol.id po_line_id, pol.quantity po_quantity, pol.unit_price po_unit_price, COALESCE((SELECT SUM(grl.accepted_quantity) FROM public.goods_receipt_lines grl JOIN public.goods_receipts gr ON gr.id = grl.receipt_id WHERE grl.purchase_order_line_id = pol.id AND gr.status = 'Posted' AND gr.deleted_at IS NULL AND grl.deleted_at IS NULL),0) received_quantity, COALESCE((SELECT quantity_tolerance_pct FROM public.procurement_match_tolerances WHERE tenant_id = b.tenant_id),0) qty_tol, COALESCE((SELECT price_tolerance_pct FROM public.procurement_match_tolerances WHERE tenant_id = b.tenant_id),0) price_tol FROM b LEFT JOIN public.purchase_order_lines pol ON pol.document_id = (SELECT source_po_id FROM public.bills WHERE id = _bill_id) AND ((b.bill_item_id IS NOT NULL AND pol.item_id = b.bill_item_id) OR (b.bill_item_id IS NULL AND pol.line_no = (SELECT line_no FROM public.bill_lines WHERE id = b.bill_line_id)))) SELECT bill_line_id, po_line_id, bill_quantity, received_quantity, po_unit_price, bill_unit_price, bill_amount, COALESCE(bill_quantity * po_unit_price,0), bill_quantity - received_quantity, (bill_unit_price - COALESCE(po_unit_price, bill_unit_price)) * bill_quantity, bill_amount - COALESCE(bill_quantity * po_unit_price,0), 0::numeric, CASE WHEN po_line_id IS NULL OR bill_quantity > received_quantity + (received_quantity * qty_tol / 100) OR abs(bill_unit_price - po_unit_price) > abs(po_unit_price) * price_tol / 100 THEN 'Exception' WHEN abs(bill_quantity - received_quantity) > 0 OR abs(bill_unit_price - po_unit_price) > 0 THEN 'Within Tolerance' ELSE 'Matched' END, CASE WHEN po_line_id IS NOT NULL AND bill_quantity <= received_quantity AND (bill_unit_price = po_unit_price OR abs(bill_unit_price - po_unit_price) <= abs(po_unit_price) * price_tol / 100) THEN true ELSE false END FROM matched;
$$;

CREATE OR REPLACE FUNCTION public.validate_supplier_bill_against_po(_bill_id uuid)
RETURNS TABLE (match_status text, quantity_variance numeric, price_variance numeric, amount_variance numeric, tax_variance numeric, matched boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
SELECT CASE WHEN COUNT(*) = 0 THEN 'Matched' WHEN BOOL_AND(match_status = 'Matched') THEN 'Matched' WHEN BOOL_AND(match_status IN ('Matched','Within Tolerance')) THEN 'Within Tolerance' ELSE 'Exception' END, COALESCE(SUM(quantity_variance),0), COALESCE(SUM(price_variance),0), COALESCE(SUM(amount_variance),0), COALESCE(SUM(tax_variance),0), BOOL_AND(matched) FROM public.get_purchase_three_way_match(_bill_id);
$$;

CREATE OR REPLACE FUNCTION public.validate_supplier_bill_receipt_match()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_match record;
BEGIN
  IF NEW.status = 'Posted' AND (OLD.status IS DISTINCT FROM NEW.status) AND NEW.source_po_id IS NOT NULL AND NEW.match_override_at IS NULL THEN
    SELECT * INTO v_match FROM public.validate_supplier_bill_against_po(NEW.id);
    IF v_match.match_status = 'Exception' THEN RAISE EXCEPTION 'Supplier bill failed three-way match: quantity %, price %, amount %', v_match.quantity_variance, v_match.price_variance, v_match.amount_variance; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_supplier_bill_receipt_match ON public.bills;
CREATE TRIGGER trg_validate_supplier_bill_receipt_match BEFORE UPDATE OF status ON public.bills FOR EACH ROW EXECUTE FUNCTION public.validate_supplier_bill_receipt_match();

CREATE OR REPLACE FUNCTION public.override_supplier_bill_match(_bill_id uuid, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.has_permission('approvals.approve') THEN RAISE EXCEPTION 'Not authorized: approvals.approve' USING ERRCODE = '42501'; END IF;
  IF NULLIF(trim(_reason),'') IS NULL THEN RAISE EXCEPTION 'Match override reason is required'; END IF;
  UPDATE public.bills SET match_override_reason = trim(_reason), match_override_by = auth.uid(), match_override_at = now() WHERE id = _bill_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier bill not found for current tenant'; END IF;
  RETURN _bill_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_purchase_receipt(uuid,uuid,text,jsonb,date,text,date,date,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_purchase_receipt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_purchase_receipt_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_purchase_order_receiving_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_purchase_three_way_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_supplier_bill_against_po(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.override_supplier_bill_match(uuid,text) TO authenticated;