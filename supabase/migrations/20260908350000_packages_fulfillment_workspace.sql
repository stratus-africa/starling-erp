-- Package workspace hardening. Existing packages/package_lines remain the
-- source of truth; the legacy status column is preserved for compatibility.

ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS packing_status text NOT NULL DEFAULT 'Draft',
  ADD COLUMN IF NOT EXISTS shipment_status text NOT NULL DEFAULT 'Not Shipped',
  ADD COLUMN IF NOT EXISTS length numeric,
  ADD COLUMN IF NOT EXISTS width numeric,
  ADD COLUMN IF NOT EXISTS height numeric,
  ADD COLUMN IF NOT EXISTS expected_delivery_date date,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_by text,
  ADD COLUMN IF NOT EXISTS delivery_notes text;

UPDATE public.packages
SET packing_status = CASE WHEN status IN ('Packed','Shipped','Delivered') THEN 'Packed' ELSE 'Draft' END,
    shipment_status = CASE status WHEN 'Shipped' THEN 'Shipped' WHEN 'Delivered' THEN 'Delivered' ELSE 'Not Shipped' END
WHERE packing_status = 'Draft' AND shipment_status = 'Not Shipped';

CREATE SEQUENCE IF NOT EXISTS public.package_number_seq START 1;
CREATE UNIQUE INDEX IF NOT EXISTS packages_tenant_number_idx
  ON public.packages (tenant_id, number) WHERE deleted_at IS NULL AND number IS NOT NULL;
CREATE INDEX IF NOT EXISTS packages_tenant_status_idx
  ON public.packages (tenant_id, status, packing_status, shipment_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS packages_tenant_tracking_idx
  ON public.packages (tenant_id, tracking) WHERE deleted_at IS NULL AND tracking IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_package_from_sales_order(
  _sales_order_id uuid,
  _warehouse_id uuid,
  _lines jsonb,
  _weight numeric DEFAULT 0,
  _length numeric DEFAULT NULL,
  _width numeric DEFAULT NULL,
  _height numeric DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_order sales_orders;
  v_pkg uuid;
  v_item jsonb;
  v_line sales_order_lines;
  v_qty numeric;
  v_prev numeric;
  v_number text;
BEGIN
  IF NOT has_permission('sales.create') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized to create packages' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_order FROM public.sales_orders
  WHERE id = _sales_order_id AND tenant_id = v_tenant AND deleted_at IS NULL
    AND status NOT IN ('Cancelled','Completed') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales order is not eligible for packing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = _warehouse_id AND tenant_id = v_tenant AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Warehouse not found or access denied';
  END IF;

  v_number := 'PKG-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('public.package_number_seq')::text, 6, '0');
  INSERT INTO public.packages (
    tenant_id, number, sales_order_id, customer_id, warehouse_id, date, weight,
    notes, status, packing_status, shipment_status, created_by
  ) VALUES (
    v_tenant, v_number, _sales_order_id, v_order.customer_id, _warehouse_id, CURRENT_DATE,
    COALESCE(_weight, 0), _notes, 'Draft', 'Draft', 'Not Shipped', auth.uid()
  ) RETURNING id INTO v_pkg;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(_lines, '[]'::jsonb)) LOOP
    SELECT * INTO v_line FROM public.sales_order_lines
    WHERE id = (v_item->>'sales_order_line_id')::uuid AND document_id = _sales_order_id
      AND tenant_id = v_tenant AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sales Order line does not belong to this order'; END IF;
    v_qty := (v_item->>'quantity')::numeric;
    SELECT COALESCE(SUM(pl.quantity), 0) INTO v_prev
    FROM public.package_lines pl JOIN public.packages p ON p.id = pl.document_id
    WHERE p.sales_order_id = _sales_order_id AND p.tenant_id = v_tenant
      AND p.status <> 'Cancelled' AND p.deleted_at IS NULL AND pl.item_id = v_line.item_id AND pl.deleted_at IS NULL;
    IF v_qty IS NULL OR v_qty <= 0 OR v_prev + v_qty > v_line.quantity THEN
      RAISE EXCEPTION 'Selected quantity exceeds the remaining Sales Order quantity for %', COALESCE(v_line.description, v_line.item_id::text);
    END IF;
    INSERT INTO public.package_lines (tenant_id, document_id, line_no, item_id, description, quantity)
    VALUES (v_tenant, v_pkg, COALESCE((v_item->>'line_no')::integer, 1), v_line.item_id, v_line.description, v_qty);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.package_lines WHERE document_id = v_pkg AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'At least one package line is required';
  END IF;
  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (v_tenant, 'package', v_pkg, 'Draft', 'Package created from Sales Order', auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));
  RETURN v_pkg;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_package_from_sales_order(uuid, uuid, jsonb, numeric, numeric, numeric, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_package(_package_id uuid, _new_status text, _reason text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_tenant uuid := current_tenant_id(); v_pkg packages; v_old text;
BEGIN
  IF NOT has_permission('sales.update') AND NOT is_super_admin() THEN RAISE EXCEPTION 'Not authorized to update packages' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_pkg FROM public.packages WHERE id = _package_id AND tenant_id = v_tenant AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Package not found'; END IF;
  v_old := COALESCE(v_pkg.status, 'Draft');
  IF _new_status = 'Packed' AND v_old NOT IN ('Draft','Packing') THEN RAISE EXCEPTION 'Package cannot be packed from status %', v_old; END IF;
  IF _new_status = 'Shipped' AND v_old NOT IN ('Packed','Ready to Ship') THEN RAISE EXCEPTION 'Package must be packed before shipping'; END IF;
  IF _new_status = 'Delivered' AND v_old NOT IN ('Shipped','Out for Delivery') THEN RAISE EXCEPTION 'Package must be shipped before delivery'; END IF;
  UPDATE public.packages SET status = _new_status,
    packing_status = CASE WHEN _new_status IN ('Packed','Ready to Ship','Shipped','Delivered') THEN 'Packed' ELSE packing_status END,
    shipment_status = CASE WHEN _new_status = 'Shipped' THEN 'Shipped' WHEN _new_status = 'Delivered' THEN 'Delivered' ELSE shipment_status END,
    delivered_at = CASE WHEN _new_status = 'Delivered' THEN now() ELSE delivered_at END,
    updated_at = now() WHERE id = _package_id;
  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (v_tenant, 'package', _package_id, _new_status, COALESCE(_reason, 'Package status changed'), auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));
  RETURN _new_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transition_package(uuid, text, text) TO authenticated;
