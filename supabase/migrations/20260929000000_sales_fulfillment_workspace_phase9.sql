-- Sales fulfillment workspace: adds a fulfillment header/line layer over the
-- existing packages, shipments, sales orders, and inventory ledger.

CREATE TABLE IF NOT EXISTS public.sales_fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id),
  fulfillment_number text NOT NULL,
  status text NOT NULL DEFAULT 'Not Started' CHECK (status IN ('Not Started','Picking','Picked','Packing','Packed','Ready to Ship','Shipped','In Transit','Delivered','On Hold','Partially Fulfilled','Delivery Exception','Cancelled')),
  warehouse_id uuid REFERENCES public.warehouses(id),
  requested_date date,
  promised_date date,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id),
  cancellation_reason text,
  deleted_at timestamptz,
  UNIQUE (tenant_id, fulfillment_number)
);

CREATE TABLE IF NOT EXISTS public.sales_fulfillment_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  fulfillment_id uuid NOT NULL REFERENCES public.sales_fulfillments(id) ON DELETE CASCADE,
  sales_order_line_id uuid NOT NULL REFERENCES public.sales_order_lines(id),
  product_id uuid REFERENCES public.items(id),
  ordered_quantity numeric(14,4) NOT NULL DEFAULT 0,
  fulfillment_quantity numeric(14,4) NOT NULL CHECK (fulfillment_quantity > 0),
  picked_quantity numeric(14,4) NOT NULL DEFAULT 0,
  packed_quantity numeric(14,4) NOT NULL DEFAULT 0,
  shipped_quantity numeric(14,4) NOT NULL DEFAULT 0,
  delivered_quantity numeric(14,4) NOT NULL DEFAULT 0,
  rejected_quantity numeric(14,4) NOT NULL DEFAULT 0,
  backordered_quantity numeric(14,4) NOT NULL DEFAULT 0,
  unit text,
  warehouse_id uuid REFERENCES public.warehouses(id),
  location_id uuid REFERENCES public.warehouse_locations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS fulfillment_id uuid REFERENCES public.sales_fulfillments(id);
ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS fulfillment_id uuid REFERENCES public.sales_fulfillments(id), ADD COLUMN IF NOT EXISTS estimated_delivery_date date, ADD COLUMN IF NOT EXISTS received_by text, ADD COLUMN IF NOT EXISTS delivery_notes text;

CREATE INDEX IF NOT EXISTS sales_fulfillments_tenant_status_idx ON public.sales_fulfillments (tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS sales_fulfillments_tenant_warehouse_idx ON public.sales_fulfillments (tenant_id, warehouse_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS sales_fulfillments_promised_date_idx ON public.sales_fulfillments (tenant_id, promised_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS sales_fulfillment_lines_fulfillment_idx ON public.sales_fulfillment_lines (tenant_id, fulfillment_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS sales_fulfillment_lines_order_line_idx ON public.sales_fulfillment_lines (tenant_id, sales_order_line_id) WHERE deleted_at IS NULL;

ALTER TABLE public.sales_fulfillments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_fulfillment_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY sales_fulfillments_read ON public.sales_fulfillments FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() AND public.has_permission('sales.read'));
CREATE POLICY sales_fulfillments_write ON public.sales_fulfillments FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id() AND public.has_permission('sales.update')) WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission('sales.update'));
CREATE POLICY sales_fulfillment_lines_read ON public.sales_fulfillment_lines FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() AND public.has_permission('sales.read'));
CREATE POLICY sales_fulfillment_lines_write ON public.sales_fulfillment_lines FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id() AND public.has_permission('sales.update')) WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission('sales.update'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_fulfillments, public.sales_fulfillment_lines TO authenticated;
GRANT ALL ON public.sales_fulfillments, public.sales_fulfillment_lines TO service_role;

CREATE OR REPLACE FUNCTION public.create_sales_fulfillment(_sales_order_id uuid, _warehouse_id uuid, _quantities jsonb, _promised_date date DEFAULT NULL, _notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.current_tenant_id(); v_order public.sales_orders; v_line public.sales_order_lines; v_item jsonb; v_qty numeric; v_prev numeric; v_id uuid;
BEGIN
  IF NOT public.has_permission('sales.create') THEN RAISE EXCEPTION 'Not authorized: sales.create' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_order FROM public.sales_orders WHERE id=_sales_order_id AND tenant_id=v_tenant AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_order.status IN ('Cancelled','Completed') THEN RAISE EXCEPTION 'Sales order is not eligible for fulfillment'; END IF;
  INSERT INTO public.sales_fulfillments (tenant_id,sales_order_id,fulfillment_number,status,warehouse_id,requested_date,promised_date,notes,created_by)
  VALUES (v_tenant,_sales_order_id,'FUL-'||right(replace(gen_random_uuid()::text,'-',''),8),'Not Started',_warehouse_id,CURRENT_DATE,_promised_date,_notes,auth.uid()) RETURNING id INTO v_id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(_quantities) LOOP
    SELECT * INTO v_line FROM public.sales_order_lines WHERE id=(v_item->>'sales_order_line_id')::uuid AND document_id=_sales_order_id AND tenant_id=v_tenant AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sales order line does not belong to the order'; END IF;
    v_qty := (v_item->>'quantity')::numeric;
    SELECT COALESCE(SUM(sfl.fulfillment_quantity),0) INTO v_prev FROM public.sales_fulfillment_lines sfl JOIN public.sales_fulfillments sf ON sf.id=sfl.fulfillment_id WHERE sfl.sales_order_line_id=v_line.id AND sf.tenant_id=v_tenant AND sf.status <> 'Cancelled' AND sf.deleted_at IS NULL AND sfl.deleted_at IS NULL;
    IF v_qty IS NULL OR v_qty <= 0 OR v_prev + v_qty > v_line.quantity THEN RAISE EXCEPTION 'Cannot fulfill %. Only % units remain', v_qty, GREATEST(0,v_line.quantity-v_prev); END IF;
    INSERT INTO public.sales_fulfillment_lines (tenant_id,fulfillment_id,sales_order_line_id,product_id,ordered_quantity,fulfillment_quantity,warehouse_id) VALUES (v_tenant,v_id,v_line.id,v_line.item_id,v_line.quantity,v_qty,_warehouse_id);
  END LOOP;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_sales_fulfillment(_fulfillment_id uuid, _new_status text, _reason text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_f public.sales_fulfillments; v_old text; v_required numeric; v_done numeric;
BEGIN
  IF NOT public.has_permission('sales.update') THEN RAISE EXCEPTION 'Not authorized: sales.update' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_f FROM public.sales_fulfillments WHERE id=_fulfillment_id AND tenant_id=public.current_tenant_id() AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fulfillment not found for current tenant'; END IF;
  v_old:=v_f.status; IF v_old=_new_status THEN RETURN v_old; END IF;
  IF _new_status='Picking' AND v_f.warehouse_id IS NULL THEN RAISE EXCEPTION 'Warehouse is required before picking'; END IF;
  SELECT SUM(fulfillment_quantity), SUM(CASE WHEN _new_status IN ('Picked','Packing','Packed','Ready to Ship','Shipped','In Transit','Delivered') THEN picked_quantity ELSE 0 END) INTO v_required,v_done FROM public.sales_fulfillment_lines WHERE fulfillment_id=_fulfillment_id AND deleted_at IS NULL;
  IF _new_status='Packed' AND v_done < v_required THEN RAISE EXCEPTION 'Cannot complete packing until all units are picked'; END IF;
  IF _new_status='Shipped' AND NOT EXISTS (SELECT 1 FROM public.shipments WHERE fulfillment_id=_fulfillment_id AND status IN ('Posted','Shipped') AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Cannot ship without a completed shipment'; END IF;
  UPDATE public.sales_fulfillments SET status=_new_status, started_at=CASE WHEN _new_status='Picking' THEN COALESCE(started_at,now()) ELSE started_at END, completed_at=CASE WHEN _new_status IN ('Delivered','Cancelled') THEN now() ELSE completed_at END, updated_at=now(), updated_by=auth.uid() WHERE id=_fulfillment_id;
  PERFORM public.record_business_event('status_changed','sales_fulfillment',_fulfillment_id,jsonb_build_object('status',v_old),jsonb_build_object('status',_new_status),jsonb_build_object('reason',_reason));
  RETURN _new_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_fulfillment_summary(_fulfillment_id uuid)
RETURNS TABLE (fulfillment_status text, order_id uuid, ordered_quantity numeric, fulfillment_quantity numeric, picked_quantity numeric, packed_quantity numeric, shipped_quantity numeric, delivered_quantity numeric, remaining_quantity numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
SELECT sf.status,sf.sales_order_id,COALESCE(SUM(sfl.ordered_quantity),0),COALESCE(SUM(sfl.fulfillment_quantity),0),COALESCE(SUM(sfl.picked_quantity),0),COALESCE(SUM(sfl.packed_quantity),0),COALESCE(SUM(sfl.shipped_quantity),0),COALESCE(SUM(sfl.delivered_quantity),0),COALESCE(SUM(sfl.fulfillment_quantity-sfl.delivered_quantity),0) FROM public.sales_fulfillments sf LEFT JOIN public.sales_fulfillment_lines sfl ON sfl.fulfillment_id=sf.id AND sfl.deleted_at IS NULL WHERE sf.id=_fulfillment_id AND sf.tenant_id=public.current_tenant_id() AND sf.deleted_at IS NULL GROUP BY sf.id;
$$;

GRANT EXECUTE ON FUNCTION public.create_sales_fulfillment(uuid,uuid,jsonb,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_sales_fulfillment(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_fulfillment_summary(uuid) TO authenticated;