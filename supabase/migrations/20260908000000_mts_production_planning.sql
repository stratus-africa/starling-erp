-- Manufacture-to-stock planning and explicit MTS order creation.

CREATE OR REPLACE FUNCTION public.get_mts_production_planning(_warehouse_id uuid DEFAULT NULL)
RETURNS TABLE (
  item_id uuid,
  item_name text,
  sku text,
  uom text,
  warehouse_id uuid,
  warehouse_name text,
  current_stock numeric,
  reserved numeric,
  available numeric,
  open_sales_orders numeric,
  open_manufacturing numeric,
  minimum_stock numeric,
  maximum_stock numeric,
  projected_available numeric,
  suggested_production numeric,
  active_bom_id uuid,
  active_bom_version text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
BEGIN
  IF NOT has_permission('manufacturing.read') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH warehouses AS (
    SELECT w.id, w.name
    FROM public.warehouses w
    WHERE w.tenant_id = v_tenant AND w.deleted_at IS NULL
      AND (_warehouse_id IS NULL OR w.id = _warehouse_id)
  ),
  items AS (
    SELECT i.id, i.name, i.sku, i.uom, i.min_stock, i.max_stock, i.reorder, i.reorder_qty
    FROM public.items i
    WHERE i.tenant_id = v_tenant AND i.deleted_at IS NULL AND i.status = 'Active'
      AND i.track_inventory = true
  ),
  stock AS (
    SELECT sm.item_id, sm.warehouse_id, SUM(sm.quantity) AS qty
    FROM public.stock_movements sm
    WHERE sm.tenant_id = v_tenant
      AND (_warehouse_id IS NULL OR sm.warehouse_id = _warehouse_id)
    GROUP BY sm.item_id, sm.warehouse_id
  ),
  reservations AS (
    SELECT sr.item_id, sr.warehouse_id, SUM(sr.quantity) AS qty
    FROM public.stock_reservations sr
    WHERE sr.tenant_id = v_tenant AND sr.status = 'Active' AND sr.deleted_at IS NULL
      AND (_warehouse_id IS NULL OR sr.warehouse_id = _warehouse_id)
    GROUP BY sr.item_id, sr.warehouse_id
  ),
  open_sales AS (
    SELECT sol.item_id,
           SUM(GREATEST(0, sol.quantity - COALESCE(fulfilled.qty, 0))) AS qty
    FROM public.sales_order_lines sol
    JOIN public.sales_orders so ON so.id = sol.document_id
      AND so.tenant_id = v_tenant AND so.deleted_at IS NULL
      AND so.status NOT IN ('Cancelled', 'Completed')
    LEFT JOIN LATERAL (
      SELECT SUM(pl.quantity) AS qty
      FROM public.packages p
      JOIN public.package_lines pl ON pl.document_id = p.id AND pl.item_id = sol.item_id
        AND pl.deleted_at IS NULL
      WHERE p.sales_order_id = so.id AND p.tenant_id = v_tenant
        AND p.deleted_at IS NULL AND p.voided_at IS NULL
    ) fulfilled ON true
    WHERE sol.tenant_id = v_tenant AND sol.deleted_at IS NULL
    GROUP BY sol.item_id
  ),
  open_mos AS (
    SELECT po.product_id, po.warehouse_id,
           SUM(GREATEST(0, po.quantity - COALESCE(po.qty_produced, 0))) AS qty
    FROM public.production_orders po
    WHERE po.tenant_id = v_tenant AND po.deleted_at IS NULL
      AND po.status NOT IN ('Cancelled', 'Completed', 'Closed')
      AND (_warehouse_id IS NULL OR po.warehouse_id = _warehouse_id)
    GROUP BY po.product_id, po.warehouse_id
  )
  SELECT i.id, i.name, i.sku, i.uom, w.id, w.name,
         COALESCE(st.qty, 0), COALESCE(rs.qty, 0),
         GREATEST(0, COALESCE(st.qty, 0) - COALESCE(rs.qty, 0)),
         COALESCE(os.qty, 0), COALESCE(om.qty, 0),
         COALESCE(i.min_stock, i.reorder, 0), COALESCE(i.max_stock, i.reorder_qty, i.min_stock, i.reorder, 0),
         GREATEST(0, COALESCE(st.qty, 0) - COALESCE(rs.qty, 0) - COALESCE(os.qty, 0) + COALESCE(om.qty, 0)),
         GREATEST(0,
           COALESCE(i.max_stock, i.reorder_qty, i.min_stock, i.reorder, 0)
           - GREATEST(0, COALESCE(st.qty, 0) - COALESCE(rs.qty, 0) - COALESCE(os.qty, 0) + COALESCE(om.qty, 0))
         ),
         bom.id, bom.version
  FROM items i
  CROSS JOIN warehouses w
  LEFT JOIN stock st ON st.item_id = i.id AND st.warehouse_id = w.id
  LEFT JOIN reservations rs ON rs.item_id = i.id AND rs.warehouse_id = w.id
  LEFT JOIN open_sales os ON os.item_id = i.id
  LEFT JOIN open_mos om ON om.product_id = i.id AND om.warehouse_id = w.id
  LEFT JOIN LATERAL (
    SELECT bh.id, bh.version
    FROM public.bom_headers bh
    WHERE bh.tenant_id = v_tenant AND bh.product_id = i.id
      AND bh.approval_status = 'Active' AND bh.deleted_at IS NULL
      AND (bh.effective_from IS NULL OR bh.effective_from <= CURRENT_DATE)
      AND (bh.effective_to IS NULL OR bh.effective_to >= CURRENT_DATE)
    ORDER BY bh.effective_from DESC NULLS LAST, bh.version DESC NULLS LAST, bh.created_at DESC
    LIMIT 1
  ) bom ON true
  ORDER BY i.name, w.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_mts_production_planning(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mts_manufacturing_order(
  _item_id uuid,
  _quantity numeric,
  _warehouse_id uuid,
  _bom_id uuid,
  _planned_start date DEFAULT NULL,
  _planned_end date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_item items;
  v_bom bom_headers;
  v_order_id uuid;
  v_number text;
BEGIN
  IF NOT has_permission('manufacturing.create') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;
  IF _quantity <= 0 THEN RAISE EXCEPTION 'MTS quantity must be greater than zero'; END IF;

  SELECT * INTO v_item FROM public.items
  WHERE id = _item_id AND tenant_id = v_tenant AND deleted_at IS NULL AND status = 'Active';
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Finished item not found or inactive'; END IF;

  SELECT * INTO v_bom FROM public.bom_headers
  WHERE id = _bom_id AND tenant_id = v_tenant AND product_id = _item_id
    AND approval_status = 'Active' AND deleted_at IS NULL
    AND (effective_from IS NULL OR effective_from <= CURRENT_DATE)
    AND (effective_to IS NULL OR effective_to >= CURRENT_DATE);
  IF v_bom.id IS NULL THEN RAISE EXCEPTION 'Selected BOM is not an active BOM for this item'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = _warehouse_id AND tenant_id = v_tenant AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Warehouse not found or access denied';
  END IF;

  v_number := 'MO-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('public.manufacturing_order_number_seq')::text, 6, '0');
  INSERT INTO public.production_orders (
    tenant_id, number, date, manufacturing_type, product_id, quantity, quantity_uom,
    warehouse_id, bom_id, planned_start, planned_end, status, qty_remaining, created_by
  ) VALUES (
    v_tenant, v_number, CURRENT_DATE, 'MTS', _item_id, _quantity, COALESCE(v_item.manufacturing_uom, v_item.uom),
    _warehouse_id, _bom_id, _planned_start, _planned_end, 'Draft', _quantity, auth.uid()
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (v_tenant, 'production_order', v_order_id, 'Draft', 'MTS manufacturing order created for stock replenishment',
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));
  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_mts_manufacturing_order(uuid, numeric, uuid, uuid, date, date) TO authenticated;
