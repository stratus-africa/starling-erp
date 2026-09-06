-- =========================================================
-- Inventory Dashboard RPC
--
-- get_inventory_dashboard()
--
-- Returns a single JSONB document with all data needed by the
-- Inventory Dashboard page.  All queries are tenant-scoped via
-- current_tenant_id() and respect RLS through SECURITY DEFINER
-- with an explicit tenant filter on every sub-query.
--
-- Sections returned:
--   kpis              – headline numbers (total value, SKUs, units, …)
--   movement_trend    – 30-day inbound vs outbound by day
--   top_items         – top 10 items by inventory value
--   warehouse_dist    – on-hand per warehouse (for distribution chart)
--   low_stock         – items at or below reorder point (on_hand ≤ reorder)
--   out_of_stock      – items with on_hand ≤ 0 that track_inventory
--   pending_transfers – inventory_transfers with status not in (Completed,Cancelled)
--   pending_adjustments – inventory_adjustments with status = 'Draft'
--   recent_movements  – last 20 stock_movements with item/warehouse names
--   slow_moving       – items with zero inbound movements in last 90 days
--                        but positive on-hand
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_inventory_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant    uuid  := public.current_tenant_id();
  v_today     date  := CURRENT_DATE;
  v_30d_start date  := CURRENT_DATE - 29;
  v_90d_start date  := CURRENT_DATE - 89;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No active tenant';
  END IF;

  RETURN jsonb_build_object(

    -- ─────────────────────────────────────────────────────────────────
    -- 1. KPIs
    -- ─────────────────────────────────────────────────────────────────
    'kpis', (
      SELECT jsonb_build_object(
        'total_skus',           COUNT(DISTINCT i.id),
        'total_value',          COALESCE(SUM(iis.on_hand * COALESCE(i.cost, 0)), 0),
        'total_units',          COALESCE(SUM(iis.on_hand), 0),
        'reserved_units',       COALESCE((
                                  SELECT SUM(sr.quantity)
                                  FROM   stock_reservations sr
                                  WHERE  sr.tenant_id = v_tenant
                                    AND  sr.deleted_at IS NULL
                                    AND  sr.status = 'Active'
                                ), 0),
        'available_units',      COALESCE(SUM(iis.on_hand), 0)
                                  - COALESCE((
                                      SELECT SUM(sr.quantity)
                                      FROM   stock_reservations sr
                                      WHERE  sr.tenant_id = v_tenant
                                        AND  sr.deleted_at IS NULL
                                        AND  sr.status = 'Active'
                                    ), 0),
        'low_stock_count',      COUNT(*) FILTER (
                                  WHERE iis.on_hand > 0
                                    AND i.reorder IS NOT NULL
                                    AND iis.on_hand <= i.reorder
                                ),
        'out_of_stock_count',   COUNT(*) FILTER (
                                  WHERE iis.on_hand <= 0
                                    AND i.track_inventory = true
                                    AND i.status = 'Active'
                                ),
        'pending_transfers',    COALESCE((
                                  SELECT COUNT(*)
                                  FROM   inventory_transfers it
                                  WHERE  it.tenant_id = v_tenant
                                    AND  it.deleted_at IS NULL
                                    AND  it.status NOT IN ('Completed','Cancelled')
                                ), 0),
        'pending_adjustments',  COALESCE((
                                  SELECT COUNT(*)
                                  FROM   inventory_adjustments ia
                                  WHERE  ia.tenant_id = v_tenant
                                    AND  ia.deleted_at IS NULL
                                    AND  ia.status = 'Draft'
                                ), 0),
        'items_on_order',       COALESCE((
                                  SELECT SUM(pol.quantity)
                                  FROM   purchase_order_lines pol
                                  JOIN   purchase_orders po ON po.id = pol.document_id
                                  WHERE  pol.tenant_id = v_tenant
                                    AND  pol.deleted_at IS NULL
                                    AND  po.deleted_at IS NULL
                                    AND  pol.item_id IS NOT NULL
                                    AND  COALESCE(po.status,'Draft') NOT IN ('Cancelled','Closed','Billed')
                                ), 0),
        'slow_moving_count',    COALESCE((
                                  SELECT COUNT(DISTINCT sm_all.item_id)
                                  FROM   (
                                           SELECT DISTINCT item_id
                                           FROM   stock_movements
                                           WHERE  tenant_id = v_tenant
                                         ) sm_all
                                  -- has positive on-hand
                                  JOIN   (
                                           SELECT item_id, SUM(quantity) AS total
                                           FROM   stock_movements
                                           WHERE  tenant_id = v_tenant
                                           GROUP  BY item_id
                                           HAVING SUM(quantity) > 0
                                         ) oh ON oh.item_id = sm_all.item_id
                                  -- but NO inbound in last 90 days
                                  WHERE  NOT EXISTS (
                                           SELECT 1
                                           FROM   stock_movements sm2
                                           WHERE  sm2.tenant_id = v_tenant
                                             AND  sm2.item_id   = sm_all.item_id
                                             AND  sm2.quantity  > 0
                                             AND  sm2.created_at >= v_90d_start
                                         )
                                ), 0),
        'expiry_tracked_count', COALESCE((
                                  SELECT COUNT(*)
                                  FROM   items
                                  WHERE  tenant_id   = v_tenant
                                    AND  deleted_at  IS NULL
                                    AND  track_expiry = true
                                    AND  status      = 'Active'
                                ), 0)
      )
      FROM  inventory_item_stock iis
      JOIN  items i ON i.id = iis.item_id
      WHERE iis.tenant_id = v_tenant
        AND i.deleted_at  IS NULL
    ),

    -- ─────────────────────────────────────────────────────────────────
    -- 2. 30-day inbound vs outbound movement trend (daily)
    -- ─────────────────────────────────────────────────────────────────
    'movement_trend', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'x',        to_char(d, 'DD Mon'),
                 'inbound',  COALESCE(inbound,  0),
                 'outbound', COALESCE(outbound, 0)
               )
               ORDER BY d
             )
      FROM (
        SELECT
          gs.d::date AS d,
          SUM(sm.quantity) FILTER (WHERE sm.quantity > 0) AS inbound,
          ABS(SUM(sm.quantity) FILTER (WHERE sm.quantity < 0)) AS outbound
        FROM generate_series(v_30d_start::timestamp, v_today::timestamp, '1 day') AS gs(d)
        LEFT JOIN stock_movements sm
               ON sm.tenant_id  = v_tenant
              AND sm.created_at >= gs.d
              AND sm.created_at <  gs.d + interval '1 day'
        GROUP BY gs.d
      ) series
    ), '[]'::jsonb),

    -- ─────────────────────────────────────────────────────────────────
    -- 3. Top 10 items by inventory value
    -- ─────────────────────────────────────────────────────────────────
    'top_items', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'item_id',  iis.item_id,
                 'name',     i.name,
                 'sku',      i.sku,
                 'on_hand',  iis.on_hand,
                 'cost',     COALESCE(i.cost, 0),
                 'value',    iis.on_hand * COALESCE(i.cost, 0),
                 'uom',      i.uom,
                 'type',     i.type
               )
               ORDER BY iis.on_hand * COALESCE(i.cost, 0) DESC
             )
      FROM  (
        SELECT item_id, on_hand FROM inventory_item_stock
        WHERE  tenant_id = v_tenant
        ORDER  BY on_hand * 1 DESC          -- approximate pre-sort
        LIMIT  10
      ) iis
      JOIN  items i ON i.id = iis.item_id
      WHERE i.deleted_at IS NULL
      ORDER BY iis.on_hand * COALESCE(i.cost, 0) DESC
      LIMIT 10
    ), '[]'::jsonb),

    -- ─────────────────────────────────────────────────────────────────
    -- 4. Warehouse distribution (on_hand per warehouse)
    -- ─────────────────────────────────────────────────────────────────
    'warehouse_dist', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'warehouse_id',   iws.warehouse_id,
                 'warehouse_name', iws.warehouse_name,
                 'warehouse_code', iws.warehouse_code,
                 'on_hand',        wh_on_hand,
                 'value',          wh_value
               )
               ORDER BY wh_value DESC
             )
      FROM (
        SELECT
          iws.warehouse_id,
          MAX(iws.warehouse_name) AS warehouse_name,
          MAX(iws.warehouse_code) AS warehouse_code,
          SUM(iws.on_hand)        AS wh_on_hand,
          SUM(iws.on_hand * COALESCE(i.cost, 0)) AS wh_value
        FROM inventory_warehouse_stock iws
        JOIN items i ON i.id = iws.item_id
        WHERE iws.tenant_id = v_tenant
          AND i.deleted_at  IS NULL
        GROUP BY iws.warehouse_id
      ) iws
    ), '[]'::jsonb),

    -- ─────────────────────────────────────────────────────────────────
    -- 5. Low stock items (on_hand > 0 but ≤ reorder point)
    -- ─────────────────────────────────────────────────────────────────
    'low_stock', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'item_id',  iis.item_id,
                 'name',     i.name,
                 'sku',      i.sku,
                 'on_hand',  iis.on_hand,
                 'reorder',  i.reorder,
                 'uom',      i.uom,
                 'pct',      CASE WHEN i.reorder > 0
                               THEN ROUND((iis.on_hand / i.reorder * 100)::numeric, 1)
                               ELSE 0 END
               )
               ORDER BY (iis.on_hand / NULLIF(i.reorder, 0)) ASC NULLS LAST
             )
      FROM  inventory_item_stock iis
      JOIN  items i ON i.id = iis.item_id
      WHERE iis.tenant_id = v_tenant
        AND i.deleted_at  IS NULL
        AND i.status      = 'Active'
        AND i.reorder     IS NOT NULL
        AND iis.on_hand   >  0
        AND iis.on_hand   <= i.reorder
      ORDER BY (iis.on_hand / NULLIF(i.reorder, 0)) ASC NULLS LAST
      LIMIT 20
    ), '[]'::jsonb),

    -- ─────────────────────────────────────────────────────────────────
    -- 6. Out-of-stock items
    -- ─────────────────────────────────────────────────────────────────
    'out_of_stock', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'item_id',   i.id,
                 'name',      i.name,
                 'sku',       i.sku,
                 'on_hand',   COALESCE(iis.on_hand, 0),
                 'reorder',   i.reorder,
                 'uom',       i.uom,
                 'last_sale', (
                   SELECT MAX(sm.created_at)
                   FROM   stock_movements sm
                   WHERE  sm.item_id   = i.id
                     AND  sm.tenant_id = v_tenant
                     AND  sm.quantity  < 0
                     AND  sm.ref_type  IN ('invoice','shipment','package')
                 )
               )
               ORDER BY i.name ASC
             )
      FROM  items i
      LEFT  JOIN inventory_item_stock iis
             ON iis.item_id  = i.id
            AND iis.tenant_id = v_tenant
      WHERE i.tenant_id     = v_tenant
        AND i.deleted_at    IS NULL
        AND i.status        = 'Active'
        AND i.track_inventory = true
        AND COALESCE(iis.on_hand, 0) <= 0
      LIMIT 20
    ), '[]'::jsonb),

    -- ─────────────────────────────────────────────────────────────────
    -- 7. Pending stock transfers
    -- ─────────────────────────────────────────────────────────────────
    'pending_transfers', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'id',         it.id,
                 'number',     it.number,
                 'date',       it.date,
                 'item_name',  i.name,
                 'item_sku',   i.sku,
                 'quantity',   it.quantity,
                 'uom',        it.uom,
                 'status',     it.status,
                 'from_wh',    wf.name,
                 'to_wh',      wt.name
               )
               ORDER BY it.date DESC, it.created_at DESC
             )
      FROM  inventory_transfers it
      LEFT  JOIN items       i  ON i.id  = it.item_id
      LEFT  JOIN warehouses  wf ON wf.id = it.from_warehouse_id
      LEFT  JOIN warehouses  wt ON wt.id = it.to_warehouse_id
      WHERE it.tenant_id  = v_tenant
        AND it.deleted_at IS NULL
        AND it.status NOT IN ('Completed','Cancelled')
      ORDER BY it.date DESC, it.created_at DESC
      LIMIT 20
    ), '[]'::jsonb),

    -- ─────────────────────────────────────────────────────────────────
    -- 8. Pending adjustments (Draft)
    -- ─────────────────────────────────────────────────────────────────
    'pending_adjustments', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'id',         ia.id,
                 'number',     ia.number,
                 'date',       ia.date,
                 'item_name',  i.name,
                 'item_sku',   i.sku,
                 'quantity',   ia.quantity,
                 'uom',        ia.uom,
                 'reason',     ia.reason,
                 'warehouse',  w.name
               )
               ORDER BY ia.date DESC, ia.created_at DESC
             )
      FROM  inventory_adjustments ia
      LEFT  JOIN items      i ON i.id  = ia.item_id
      LEFT  JOIN warehouses w ON w.id  = ia.warehouse_id
      WHERE ia.tenant_id  = v_tenant
        AND ia.deleted_at IS NULL
        AND ia.status     = 'Draft'
      ORDER BY ia.date DESC, ia.created_at DESC
      LIMIT 20
    ), '[]'::jsonb),

    -- ─────────────────────────────────────────────────────────────────
    -- 9. Recent stock movements (last 20)
    -- ─────────────────────────────────────────────────────────────────
    'recent_movements', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'id',           sm.id,
                 'created_at',   sm.created_at,
                 'item_name',    i.name,
                 'item_sku',     i.sku,
                 'quantity',     sm.quantity,
                 'unit_cost',    sm.unit_cost,
                 'ref_type',     sm.ref_type,
                 'note',         sm.note,
                 'warehouse',    w.name,
                 'location_code',wl.code
               )
               ORDER BY sm.created_at DESC
             )
      FROM  (
        SELECT * FROM stock_movements
        WHERE  tenant_id  = v_tenant
        ORDER  BY created_at DESC
        LIMIT  20
      ) sm
      LEFT  JOIN items              i  ON i.id  = sm.item_id
      LEFT  JOIN warehouses         w  ON w.id  = sm.warehouse_id
      LEFT  JOIN warehouse_locations wl ON wl.id = sm.location_id
    ), '[]'::jsonb),

    -- ─────────────────────────────────────────────────────────────────
    -- 10. Slow-moving items (positive on-hand, no inbound in 90 days)
    -- ─────────────────────────────────────────────────────────────────
    'slow_moving', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'item_id',      iis.item_id,
                 'name',         i.name,
                 'sku',          i.sku,
                 'on_hand',      iis.on_hand,
                 'cost',         COALESCE(i.cost, 0),
                 'value',        iis.on_hand * COALESCE(i.cost, 0),
                 'uom',          i.uom,
                 'last_movement',(
                   SELECT MAX(sm.created_at)
                   FROM   stock_movements sm
                   WHERE  sm.item_id   = iis.item_id
                     AND  sm.tenant_id = v_tenant
                 )
               )
               ORDER BY iis.on_hand * COALESCE(i.cost, 0) DESC
             )
      FROM  inventory_item_stock iis
      JOIN  items i ON i.id = iis.item_id
      WHERE iis.tenant_id   = v_tenant
        AND i.deleted_at    IS NULL
        AND i.status        = 'Active'
        AND iis.on_hand     > 0
        AND NOT EXISTS (
          SELECT 1
          FROM   stock_movements sm
          WHERE  sm.item_id   = iis.item_id
            AND  sm.tenant_id = v_tenant
            AND  sm.quantity  > 0
            AND  sm.created_at >= v_90d_start
        )
      ORDER BY iis.on_hand * COALESCE(i.cost, 0) DESC
      LIMIT 20
    ), '[]'::jsonb),

    -- ─────────────────────────────────────────────────────────────────
    -- 11. Inventory valuation by category
    -- ─────────────────────────────────────────────────────────────────
    'valuation_by_category', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'category',  COALESCE(ic.name, 'Uncategorised'),
                 'sku_count', COUNT(DISTINCT iis.item_id),
                 'units',     SUM(iis.on_hand),
                 'value',     SUM(iis.on_hand * COALESCE(i.cost, 0))
               )
               ORDER BY SUM(iis.on_hand * COALESCE(i.cost, 0)) DESC
             )
      FROM  inventory_item_stock iis
      JOIN  items          i  ON i.id  = iis.item_id
      LEFT  JOIN item_categories ic ON ic.id = i.category_id
      WHERE iis.tenant_id = v_tenant
        AND i.deleted_at  IS NULL
      GROUP BY COALESCE(ic.name, 'Uncategorised')
      LIMIT 10
    ), '[]'::jsonb)

  ); -- end RETURN jsonb_build_object
END;
$$;

REVOKE ALL ON FUNCTION public.get_inventory_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_inventory_dashboard() TO authenticated;
