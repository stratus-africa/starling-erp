-- Sales Order -> Manufacturing to Order integration.
-- Requirements are derived from the existing sales fulfillment, stock ledger,
-- reservations, BOM, and production-order tables.

ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS manufacturing_type text NOT NULL DEFAULT 'MTO',
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual_manufacturing',
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE SEQUENCE IF NOT EXISTS public.manufacturing_order_number_seq START 1;

CREATE INDEX IF NOT EXISTS production_orders_sales_source_idx
  ON public.production_orders (tenant_id, source_id, product_id, status)
  WHERE deleted_at IS NULL AND source_type = 'sales_order';

CREATE OR REPLACE FUNCTION public.get_sales_order_manufacturing_requirements(_sales_order_id uuid)
RETURNS TABLE (
  sales_order_line_id uuid,
  item_id uuid,
  item_name text,
  sku text,
  uom text,
  ordered_qty numeric,
  fulfilled_qty numeric,
  available_qty numeric,
  in_production_qty numeric,
  manufacturing_required numeric,
  active_bom_id uuid,
  active_bom_version text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_order sales_orders;
BEGIN
  SELECT * INTO v_order FROM public.sales_orders
  WHERE id = _sales_order_id AND tenant_id = v_tenant AND deleted_at IS NULL;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Sales order not found or access denied'; END IF;

  IF NOT has_permission('sales.read') AND NOT has_permission('manufacturing.read') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH legacy_fulfilled AS (
    SELECT sol.id AS sales_order_line_id, COALESCE(SUM(pl.quantity), 0) AS qty
    FROM public.sales_order_lines sol
    LEFT JOIN public.packages p ON p.sales_order_id = _sales_order_id
      AND p.tenant_id = v_tenant AND p.deleted_at IS NULL AND p.voided_at IS NULL
    LEFT JOIN public.package_lines pl ON pl.document_id = p.id
      AND pl.item_id = sol.item_id AND pl.deleted_at IS NULL
    WHERE sol.document_id = _sales_order_id AND sol.tenant_id = v_tenant AND sol.deleted_at IS NULL
    GROUP BY sol.id
  ),
  stock AS (
    SELECT sm.item_id, SUM(sm.quantity) AS qty
    FROM public.stock_movements sm
    WHERE sm.tenant_id = v_tenant
      AND sm.item_id IN (SELECT item_id FROM public.sales_order_lines WHERE document_id = _sales_order_id AND deleted_at IS NULL)
    GROUP BY sm.item_id
  ),
  reserved AS (
    SELECT sr.item_id, SUM(sr.quantity) AS qty
    FROM public.stock_reservations sr
    WHERE sr.tenant_id = v_tenant
      AND sr.status = 'Active'
      AND sr.deleted_at IS NULL
      AND sr.item_id IN (SELECT item_id FROM public.sales_order_lines WHERE document_id = _sales_order_id AND deleted_at IS NULL)
    GROUP BY sr.item_id
  ),
  open_mos AS (
    SELECT po.product_id, SUM(GREATEST(0, po.quantity - COALESCE(po.qty_produced, 0))) AS qty
    FROM public.production_orders po
    WHERE po.tenant_id = v_tenant
      AND po.source_type = 'sales_order'
      AND po.source_id = _sales_order_id
      AND po.deleted_at IS NULL
      AND po.status NOT IN ('Cancelled', 'Closed', 'Completed')
    GROUP BY po.product_id
  ),
  lines AS (
    SELECT sol.id, sol.item_id, sol.quantity,
           i.name, i.sku, i.uom,
           COALESCE(lf.qty, 0) AS fulfilled_qty,
           GREATEST(0, COALESCE(s.qty, 0) - COALESCE(r.qty, 0)) AS available_qty,
           COALESCE(m.qty, 0) AS in_production_qty
    FROM public.sales_order_lines sol
    JOIN public.items i ON i.id = sol.item_id AND i.deleted_at IS NULL
    LEFT JOIN legacy_fulfilled lf ON lf.sales_order_line_id = sol.id
    LEFT JOIN stock s ON s.item_id = sol.item_id
    LEFT JOIN reserved r ON r.item_id = sol.item_id
    LEFT JOIN open_mos m ON m.product_id = sol.item_id
    WHERE sol.document_id = _sales_order_id AND sol.tenant_id = v_tenant AND sol.deleted_at IS NULL
  )
  SELECT l.id, l.item_id, l.name, l.sku, l.uom,
         l.quantity, l.fulfilled_qty, l.available_qty, l.in_production_qty,
         GREATEST(0, l.quantity - l.fulfilled_qty - l.available_qty - l.in_production_qty),
         bh.id, bh.version
  FROM lines l
  LEFT JOIN LATERAL (
    SELECT b.id, b.version
    FROM public.bom_headers b
    WHERE b.tenant_id = v_tenant AND b.product_id = l.item_id
      AND b.approval_status = 'Active' AND b.deleted_at IS NULL
      AND (b.effective_from IS NULL OR b.effective_from <= CURRENT_DATE)
      AND (b.effective_to IS NULL OR b.effective_to >= CURRENT_DATE)
    ORDER BY b.effective_from DESC NULLS LAST, b.version DESC NULLS LAST, b.created_at DESC
    LIMIT 1
  ) bh ON true
  ORDER BY l.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_order_manufacturing_requirements(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_sales_order_mto_orders(
  _sales_order_id uuid,
  _lines jsonb
)
RETURNS TABLE (production_order_id uuid, sales_order_line_id uuid, quantity numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_order sales_orders;
  selected jsonb;
  req record;
  mo_id uuid;
  mo_number text;
  requested numeric;
  remaining numeric;
BEGIN
  IF NOT has_permission('sales.read') OR NOT has_permission('manufacturing.create') THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order FROM public.sales_orders
  WHERE id = _sales_order_id AND tenant_id = v_tenant AND deleted_at IS NULL
  FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Sales order not found or access denied'; END IF;
  IF v_order.status IN ('Cancelled', 'Completed') THEN RAISE EXCEPTION 'Sales order is not eligible for manufacturing'; END IF;

  FOR selected IN SELECT * FROM jsonb_array_elements(COALESCE(_lines, '[]'::jsonb)) LOOP
    SELECT * INTO req FROM public.get_sales_order_manufacturing_requirements(_sales_order_id)
    WHERE sales_order_line_id = (selected->>'sales_order_line_id')::uuid;
    IF req.sales_order_line_id IS NULL THEN RAISE EXCEPTION 'Sales order line is not accessible'; END IF;

    requested := (selected->>'quantity')::numeric;
    IF requested IS NULL OR requested <= 0 THEN RAISE EXCEPTION 'Manufacturing quantity must be greater than zero'; END IF;
    IF req.active_bom_id IS NULL THEN RAISE EXCEPTION 'No Active BOM exists for %', req.item_name; END IF;
    IF requested > req.manufacturing_required THEN
      RAISE EXCEPTION 'Manufacturing quantity for % exceeds the current requirement', req.item_name;
    END IF;

    -- Re-read under the order lock so repeated submissions cannot duplicate demand.
    SELECT GREATEST(0, req.ordered_qty - req.fulfilled_qty - req.available_qty - req.in_production_qty)
    INTO remaining;
    IF requested > remaining THEN RAISE EXCEPTION 'Manufacturing requirement changed for %; refresh and retry', req.item_name; END IF;

    mo_number := 'MO-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('public.manufacturing_order_number_seq')::text, 6, '0');
    INSERT INTO public.production_orders (
      tenant_id, number, date, manufacturing_type, product_id, quantity, quantity_uom,
      bom_id, source_type, source_id, customer_id, status, qty_remaining, created_by
    ) VALUES (
      v_tenant, mo_number, CURRENT_DATE, 'MTO', req.item_id, requested, req.uom,
      req.active_bom_id, 'sales_order', _sales_order_id, v_order.customer_id,
      'Draft', requested, auth.uid()
    ) RETURNING id INTO mo_id;

    INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
    VALUES (v_tenant, 'production_order', mo_id, 'Draft',
            format('Created from Sales Order %s, line %s', v_order.number, req.sales_order_line_id),
            auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));

    production_order_id := mo_id;
    sales_order_line_id := req.sales_order_line_id;
    quantity := requested;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_sales_order_mto_orders(uuid, jsonb) TO authenticated;
