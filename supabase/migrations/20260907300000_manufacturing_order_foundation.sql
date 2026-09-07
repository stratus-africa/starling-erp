-- Manufacturing orders use the existing production-order, inventory, accounting,
-- document-event, and tenant-isolation architecture.

ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS manufacturing_type text NOT NULL DEFAULT 'MTS',
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual_manufacturing',
  ADD COLUMN IF NOT EXISTS source_id uuid;

UPDATE public.production_orders po
SET product_id = bh.product_id
FROM public.bom_headers bh
WHERE po.product_id IS NULL
  AND po.bom_id = bh.id;

ALTER TABLE public.production_orders
  DROP CONSTRAINT IF EXISTS production_orders_manufacturing_type_check,
  ADD CONSTRAINT production_orders_manufacturing_type_check
    CHECK (manufacturing_type IN ('MTO', 'MTS')),
  DROP CONSTRAINT IF EXISTS production_orders_source_type_check,
  ADD CONSTRAINT production_orders_source_type_check
    CHECK (source_type IN ('sales_order', 'production_plan', 'stock_replenishment', 'manual_manufacturing'));

CREATE INDEX IF NOT EXISTS production_orders_type_idx
  ON public.production_orders (tenant_id, manufacturing_type, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS production_orders_product_idx
  ON public.production_orders (tenant_id, product_id)
  WHERE deleted_at IS NULL AND product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS production_orders_source_idx
  ON public.production_orders (tenant_id, source_type, source_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS production_orders_warehouse_dates_idx
  ON public.production_orders (tenant_id, warehouse_id, planned_start, planned_end)
  WHERE deleted_at IS NULL;
