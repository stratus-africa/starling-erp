-- Keep the warehouse stock view contract aligned with get_inventory_dashboard().
-- The dashboard needs display names, while the original view exposed ids only.
CREATE OR REPLACE VIEW public.inventory_warehouse_stock
WITH (security_invoker = on) AS
SELECT
  sm.tenant_id,
  sm.item_id,
  sm.warehouse_id,
  w.name AS warehouse_name,
  w.code AS warehouse_code,
  COALESCE(SUM(sm.quantity), 0)::numeric AS on_hand
FROM public.stock_movements sm
LEFT JOIN public.warehouses w ON w.id = sm.warehouse_id
GROUP BY sm.tenant_id, sm.item_id, sm.warehouse_id, w.name, w.code;

GRANT SELECT ON public.inventory_warehouse_stock TO authenticated;
GRANT ALL ON public.inventory_warehouse_stock TO service_role;
