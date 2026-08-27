-- =========================================================
-- Inventory stock ledger as the source of truth
-- items.stock is retained only as an explicitly controlled cache/projection.
-- =========================================================

-- 1. Remove the old one-way INSERT trigger. Stock movements are authoritative.
DROP TRIGGER IF EXISTS trg_sync_item_stock ON public.stock_movements;
DROP FUNCTION IF EXISTS public.sync_item_stock();

-- 1b. Convert legacy opening stock into explicit ledger movements where no
-- movement history exists. This prevents a one-time migration from losing
-- legitimate opening balances that were previously stored only on items.stock.
INSERT INTO public.stock_movements(
  tenant_id, item_id, warehouse_id, quantity, unit_cost,
  ref_type, ref_id, note, created_by
)
SELECT
  i.tenant_id, i.id, NULL, COALESCE(i.stock, 0), COALESCE(i.cost, 0),
  'opening_balance', i.id, 'Migrated legacy opening stock', NULL
FROM public.items i
WHERE i.deleted_at IS NULL
  AND COALESCE(i.stock, 0) <> 0
  AND NOT EXISTS (
    SELECT 1 FROM public.stock_movements sm WHERE sm.item_id = i.id AND sm.tenant_id = i.tenant_id
  );

-- 2. Canonical item stock view: current on-hand is derived from movements.
CREATE OR REPLACE VIEW public.inventory_item_stock AS
SELECT
  i.tenant_id,
  i.id AS item_id,
  i.sku,
  i.name,
  i.uom,
  i.reorder,
  COALESCE(SUM(sm.quantity), 0)::numeric AS on_hand
FROM public.items i
LEFT JOIN public.stock_movements sm
  ON sm.item_id = i.id
 AND sm.tenant_id = i.tenant_id
WHERE i.deleted_at IS NULL
GROUP BY i.tenant_id, i.id, i.sku, i.name, i.uom, i.reorder;

-- 3. Warehouse-level canonical stock, needed for multi-location integrity checks.
CREATE OR REPLACE VIEW public.inventory_warehouse_stock AS
SELECT
  sm.tenant_id,
  sm.item_id,
  sm.warehouse_id,
  COALESCE(SUM(sm.quantity), 0)::numeric AS on_hand
FROM public.stock_movements sm
GROUP BY sm.tenant_id, sm.item_id, sm.warehouse_id;

GRANT SELECT ON public.inventory_item_stock TO authenticated;
GRANT SELECT ON public.inventory_warehouse_stock TO authenticated;
GRANT ALL ON public.inventory_item_stock TO service_role;
GRANT ALL ON public.inventory_warehouse_stock TO service_role;

-- 4. Controlled projection refresh. This is NOT the source of truth.
CREATE OR REPLACE FUNCTION public.recalculate_item_stock_projection(_item_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_count integer := 0;
BEGIN
  IF v_tenant IS NULL AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'No active tenant';
  END IF;

  UPDATE public.items i
  SET stock = s.on_hand,
      updated_at = now()
  FROM public.inventory_item_stock s
  WHERE i.id = s.item_id
    AND i.tenant_id = s.tenant_id
    AND (_item_id IS NULL OR i.id = _item_id)
    AND (is_super_admin() OR i.tenant_id = v_tenant);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 5. Integrity check compares the controlled projection with the ledger.
CREATE OR REPLACE FUNCTION public.check_inventory_stock_integrity(_item_id uuid DEFAULT NULL)
RETURNS TABLE(
  item_id uuid,
  sku text,
  item_name text,
  ledger_on_hand numeric,
  projected_stock numeric,
  difference numeric,
  is_valid boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    s.item_id,
    s.sku,
    s.name AS item_name,
    s.on_hand AS ledger_on_hand,
    COALESCE(i.stock, 0)::numeric AS projected_stock,
    (s.on_hand - COALESCE(i.stock, 0))::numeric AS difference,
    ABS(s.on_hand - COALESCE(i.stock, 0)) < 0.000001 AS is_valid
  FROM public.inventory_item_stock s
  JOIN public.items i ON i.id = s.item_id AND i.tenant_id = s.tenant_id
  WHERE (_item_id IS NULL OR s.item_id = _item_id)
    AND (is_super_admin() OR s.tenant_id = current_tenant_id())
  ORDER BY ABS(s.on_hand - COALESCE(i.stock, 0)) DESC, s.name;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_item_stock_projection(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_inventory_stock_integrity(uuid) TO authenticated;

-- 6. Prevent ordinary clients from treating items.stock as an independent ledger.
-- Existing INSERT/UPDATE paths may still populate stock for backwards compatibility,
-- but stock should only be changed through the controlled projection RPC.
-- A future migration can make stock generated/immutable after all legacy opening-stock
-- data has been converted into explicit opening_balance stock movements.

-- 7. Add an explicit opening-balance movement for future item creation via RPC.
CREATE OR REPLACE FUNCTION public.set_item_opening_stock(
  _item_id uuid,
  _quantity numeric,
  _unit_cost numeric DEFAULT 0,
  _warehouse_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item public.items;
  v_movement uuid;
BEGIN
  SELECT * INTO v_item
  FROM public.items
  WHERE id = _item_id AND deleted_at IS NULL;

  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF v_item.tenant_id <> current_tenant_id() AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  INSERT INTO public.stock_movements(
    tenant_id, item_id, warehouse_id, quantity, unit_cost,
    ref_type, ref_id, note, created_by
  ) VALUES (
    v_item.tenant_id, v_item.id, _warehouse_id, COALESCE(_quantity, 0),
    COALESCE(_unit_cost, 0), 'opening_balance', v_item.id,
    'Opening stock balance', auth.uid()
  ) RETURNING id INTO v_movement;

  PERFORM public.recalculate_item_stock_projection(v_item.id);
  RETURN v_movement;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_item_opening_stock(uuid, numeric, numeric, uuid) TO authenticated;

-- 8. Audit the integrity tools themselves.
-- The underlying stock movement ledger remains immutable by business logic:
-- corrections should be represented as compensating movements, not UPDATE/DELETE.
