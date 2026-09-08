-- Manufacturing dashboard aggregates. All values are derived from tenant-scoped
-- production orders, BOM requirements, the stock ledger, and reservations.

CREATE OR REPLACE FUNCTION public.get_manufacturing_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_today date := CURRENT_DATE;
  v_result jsonb;
BEGIN
  IF NOT has_permission('manufacturing.read') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  WITH order_rows AS (
    SELECT po.id, po.number, po.manufacturing_type, po.product_id, i.name AS product_name,
           po.quantity, po.qty_produced, po.qty_remaining, po.status, po.source_type,
           po.bom_id, po.warehouse_id,
           po.source_id, so.number AS source_number, po.planned_end, po.planned_start,
           po.created_at, COALESCE(po.qty_produced / NULLIF(po.quantity, 0) * 100, 0) AS progress
    FROM public.production_orders po
    LEFT JOIN public.items i ON i.id = po.product_id
    LEFT JOIN public.sales_orders so ON so.id = po.source_id
      AND po.source_type = 'sales_order' AND so.tenant_id = v_tenant
    WHERE po.tenant_id = v_tenant AND po.deleted_at IS NULL
  ),
  active_orders AS (
    SELECT * FROM order_rows WHERE status NOT IN ('Completed', 'Closed', 'Cancelled') AND bom_id IS NOT NULL
  ),
  requirements AS (
    SELECT ao.id AS order_id, eb.item_id, ao.warehouse_id,
           SUM(eb.effective_qty) AS required_qty
    FROM active_orders ao
    JOIN LATERAL public.explode_bom(ao.bom_id, ao.quantity) eb ON true
    WHERE eb.is_subassembly = false
    GROUP BY ao.id, eb.item_id, ao.warehouse_id
  ),
  stock AS (
    SELECT sm.item_id, sm.warehouse_id, SUM(sm.quantity) AS qty
    FROM public.stock_movements sm
    WHERE sm.tenant_id = v_tenant
    GROUP BY sm.item_id, sm.warehouse_id
  ),
  reserved AS (
    SELECT sr.item_id, sr.warehouse_id, SUM(sr.quantity) AS qty
    FROM public.stock_reservations sr
    WHERE sr.tenant_id = v_tenant AND sr.status = 'Active' AND sr.deleted_at IS NULL
    GROUP BY sr.item_id, sr.warehouse_id
  ),
  material_rows AS (
    SELECT r.order_id, r.item_id, r.required_qty,
           GREATEST(0,
             COALESCE((SELECT SUM(s.qty) FROM stock s WHERE s.item_id = r.item_id AND (r.warehouse_id IS NULL OR s.warehouse_id = r.warehouse_id)), 0)
             - COALESCE((SELECT SUM(rs.qty) FROM reserved rs WHERE rs.item_id = r.item_id AND (r.warehouse_id IS NULL OR rs.warehouse_id = r.warehouse_id)), 0)
           ) AS available_qty
    FROM requirements r
  ),
  material_summary AS (
    SELECT COUNT(*) FILTER (WHERE available_qty >= required_qty) AS available_count,
           COUNT(*) FILTER (WHERE available_qty < required_qty) AS shortage_count,
           COUNT(DISTINCT order_id) FILTER (WHERE available_qty < required_qty) AS blocked_orders
    FROM material_rows
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'orders', (SELECT COUNT(*) FROM order_rows),
      'draft', (SELECT COUNT(*) FROM order_rows WHERE status = 'Draft'),
      'planned', (SELECT COUNT(*) FROM order_rows WHERE status IN ('Planned', 'Confirmed', 'Material Reserved', 'Released')),
      'in_production', (SELECT COUNT(*) FROM order_rows WHERE status IN ('In Progress', 'Partially Completed', 'Paused', 'Quality Check')),
      'completed', (SELECT COUNT(*) FROM order_rows WHERE status IN ('Completed', 'Closed')),
      'units_planned', COALESCE((SELECT SUM(quantity) FROM order_rows WHERE status NOT IN ('Cancelled')), 0),
      'units_in_production', COALESCE((SELECT SUM(GREATEST(0, qty_remaining)) FROM order_rows WHERE status IN ('In Progress', 'Partially Completed', 'Paused', 'Quality Check')), 0),
      'units_completed', COALESCE((SELECT SUM(qty_produced) FROM order_rows WHERE status IN ('Completed', 'Closed')), 0),
      'mto_orders', (SELECT COUNT(*) FROM order_rows WHERE manufacturing_type = 'MTO'),
      'mts_orders', (SELECT COUNT(*) FROM order_rows WHERE manufacturing_type = 'MTS'),
      'materials_available', (SELECT available_count FROM material_summary),
      'material_shortages', (SELECT shortage_count FROM material_summary),
      'orders_awaiting_materials', (SELECT blocked_orders FROM material_summary)
    ),
    'production_dates', jsonb_build_object(
      'today', (SELECT COUNT(*) FROM order_rows WHERE status NOT IN ('Completed', 'Closed', 'Cancelled') AND planned_start <= v_today AND (planned_end IS NULL OR planned_end >= v_today)),
      'upcoming', (SELECT COUNT(*) FROM order_rows WHERE status NOT IN ('Completed', 'Closed', 'Cancelled') AND planned_start > v_today),
      'overdue', (SELECT COUNT(*) FROM order_rows WHERE status NOT IN ('Completed', 'Closed', 'Cancelled') AND planned_end < v_today)
    ),
    'recent_orders', COALESCE((SELECT jsonb_agg(to_jsonb(recent) ORDER BY recent.created_at DESC) FROM (SELECT * FROM order_rows ORDER BY created_at DESC LIMIT 8) recent), '[]'::jsonb),
    'shortage_orders', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', o.id, 'number', o.number, 'product_name', o.product_name, 'status', 'Material Short'))
      FROM order_rows o
      WHERE EXISTS (SELECT 1 FROM material_rows mr WHERE mr.order_id = o.id AND mr.available_qty < mr.required_qty)
        AND o.status NOT IN ('Completed', 'Closed', 'Cancelled')
    ), '[]'::jsonb)
  ) INTO v_result
  FROM material_summary;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_manufacturing_dashboard() TO authenticated;
