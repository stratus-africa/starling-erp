-- Production performance tracking: scrap, waste, rework, yield, and variance.

ALTER TABLE public.production_entries
  ADD COLUMN IF NOT EXISTS qty_waste numeric NOT NULL DEFAULT 0 CHECK (qty_waste >= 0),
  ADD COLUMN IF NOT EXISTS qty_rework numeric NOT NULL DEFAULT 0 CHECK (qty_rework >= 0);

CREATE INDEX IF NOT EXISTS production_entries_performance_idx
  ON public.production_entries (tenant_id, entry_date, status)
  WHERE voided_at IS NULL;

-- Extended run API. The existing seven-argument API remains compatible. Waste
-- consumes material like scrap, while rework is tracked as output disposition
-- and does not become good finished-goods inventory.
CREATE OR REPLACE FUNCTION public.record_production_run(
  _order_id uuid,
  _qty_produced numeric,
  _qty_scrap numeric DEFAULT 0,
  _qty_waste numeric DEFAULT 0,
  _qty_rework numeric DEFAULT 0,
  _warehouse_id uuid DEFAULT NULL,
  _location_id uuid DEFAULT NULL,
  _lot_number text DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry uuid;
BEGIN
  IF _qty_waste < 0 OR _qty_rework < 0 THEN
    RAISE EXCEPTION 'Waste and rework quantities cannot be negative';
  END IF;

  v_entry := public.record_production_run(
    _order_id, _qty_produced, COALESCE(_qty_scrap, 0) + COALESCE(_qty_waste, 0),
    _warehouse_id, _location_id, _lot_number, _notes
  );

  UPDATE public.production_entries
  SET qty_scrap = COALESCE(_qty_scrap, 0),
      qty_waste = COALESCE(_qty_waste, 0),
      qty_rework = COALESCE(_qty_rework, 0),
      updated_at = now()
  WHERE id = v_entry;
  RETURN v_entry;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_production_run(uuid, numeric, numeric, numeric, numeric, uuid, uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_manufacturing_performance_report(
  _report text,
  _date_from date DEFAULT NULL,
  _date_to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_from date := COALESCE(_date_from, date_trunc('year', CURRENT_DATE)::date);
  v_to date := COALESCE(_date_to, CURRENT_DATE);
  v_result jsonb;
BEGIN
  IF NOT has_permission('manufacturing.read') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF _report = 'material_consumption' OR _report = 'material_variance' THEN
    WITH planned AS (
      SELECT po.id AS production_order_id, po.number, eb.item_id, eb.item_name,
             SUM(eb.effective_qty) AS planned_qty
      FROM public.production_orders po
      JOIN LATERAL public.explode_bom(po.bom_id, po.quantity) eb ON true
      WHERE po.tenant_id = v_tenant AND po.deleted_at IS NULL
        AND po.date BETWEEN v_from AND v_to AND eb.is_subassembly = false
      GROUP BY po.id, po.number, eb.item_id, eb.item_name
    ), actual AS (
      SELECT sm.ref_id AS production_order_id, sm.item_id,
             SUM(ABS(sm.quantity)) AS actual_qty,
             SUM(ABS(sm.quantity) * sm.unit_cost) AS actual_cost
      FROM public.stock_movements sm
      WHERE sm.tenant_id = v_tenant AND sm.ref_type = 'production_consume'
        AND sm.created_at::date BETWEEN v_from AND v_to
      GROUP BY sm.ref_id, sm.item_id
    ), rows AS (
      SELECT p.production_order_id, p.number, p.item_id, p.item_name,
             p.planned_qty, COALESCE(a.actual_qty, 0) AS actual_qty,
             COALESCE(a.actual_qty, 0) - p.planned_qty AS variance_qty,
             COALESCE(a.actual_cost, 0) AS actual_cost
      FROM planned p LEFT JOIN actual a ON a.production_order_id = p.production_order_id AND a.item_id = p.item_id
    )
    SELECT jsonb_build_object(
      'summary', jsonb_build_object('planned_quantity', COALESCE(SUM(planned_qty), 0), 'actual_quantity', COALESCE(SUM(actual_qty), 0), 'variance_quantity', COALESCE(SUM(variance_qty), 0), 'actual_cost', COALESCE(SUM(actual_cost), 0)),
      'rows', COALESCE(jsonb_agg(to_jsonb(rows) ORDER BY number, item_name), '[]'::jsonb)
    ) INTO v_result FROM rows;
  ELSE
    WITH entries AS (
      SELECT pe.production_order_id,
             SUM(pe.qty_produced) FILTER (WHERE pe.status <> 'Voided') AS good_output,
             SUM(pe.qty_scrap) FILTER (WHERE pe.status <> 'Voided') AS scrap,
             SUM(pe.qty_waste) FILTER (WHERE pe.status <> 'Voided') AS waste,
             SUM(pe.qty_rework) FILTER (WHERE pe.status <> 'Voided') AS rework
      FROM public.production_entries pe
      WHERE pe.tenant_id = v_tenant AND pe.entry_date BETWEEN v_from AND v_to
      GROUP BY pe.production_order_id
    ), rows AS (
      SELECT po.id, po.number, po.manufacturing_type, i.name AS product_name,
             po.quantity AS planned_output, COALESCE(e.good_output, 0) AS good_output,
             COALESCE(e.scrap, 0) AS scrap, COALESCE(e.waste, 0) AS waste,
             COALESCE(e.rework, 0) AS rework,
             COALESCE(e.good_output, 0) - po.quantity AS production_variance,
             ROUND(COALESCE(e.good_output, 0) / NULLIF(po.quantity, 0) * 100, 2) AS yield_pct
      FROM public.production_orders po
      LEFT JOIN entries e ON e.production_order_id = po.id
      LEFT JOIN public.items i ON i.id = po.product_id
      WHERE po.tenant_id = v_tenant AND po.deleted_at IS NULL AND po.date BETWEEN v_from AND v_to
    )
    SELECT jsonb_build_object(
      'summary', jsonb_build_object('planned_output', COALESCE(SUM(planned_output), 0), 'good_output', COALESCE(SUM(good_output), 0), 'scrap', COALESCE(SUM(scrap), 0), 'waste', COALESCE(SUM(waste), 0), 'rework', COALESCE(SUM(rework), 0), 'yield_pct', ROUND(COALESCE(SUM(good_output), 0) / NULLIF(SUM(planned_output), 0) * 100, 2), 'production_variance', COALESCE(SUM(production_variance), 0)),
      'rows', COALESCE(jsonb_agg(to_jsonb(rows) ORDER BY number), '[]'::jsonb)
    ) INTO v_result FROM rows;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_manufacturing_performance_report(text, date, date) TO authenticated;
