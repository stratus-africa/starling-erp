-- =========================================================
-- Item Master Enhancements
--
-- Adds professional item management fields to the existing
-- `items` table without breaking any existing columns,
-- policies, triggers, or downstream queries.
--
-- New tables:
--   item_categories      – hierarchical category tree
--   uom_conversions      – unit-of-measure conversion factors
--
-- New columns on `items`:
--   Identity      – barcode, image_url, brand, manufacturer, model, status
--   Categorisation– category_id FK → item_categories
--   UOM           – purchase_uom, sales_uom, manufacturing_uom
--   Stock levels  – min_stock, max_stock, safety_stock, reorder_qty
--   Lead time     – supplier_lead_time_days
--   Supplier      – preferred_supplier_id FK → suppliers
--   Tracking      – track_inventory, track_batches, track_serials, track_expiry
--   Inventory     – inventory_tracking (AVCO | FIFO | None)
--   Costing       – standard_cost (for manufacturing standard costing)
--   Sales         – sales_description
--   Purchase      – purchase_description
--   GL            – inventory_account_id, cogs_account_id, sales_account_id
--                   purchase_account_id  (FK → chart_of_accounts)
-- =========================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  item_categories
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.item_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  code        text,
  parent_id   uuid        REFERENCES public.item_categories(id) ON DELETE SET NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS item_categories_tenant_idx
  ON public.item_categories(tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS item_categories_parent_idx
  ON public.item_categories(parent_id)
  WHERE deleted_at IS NULL;

-- updated_at trigger
CREATE TRIGGER trg_item_categories_updated
  BEFORE UPDATE ON public.item_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Audit
CREATE TRIGGER trg_audit_item_categories
  AFTER INSERT OR UPDATE OR DELETE ON public.item_categories
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- RLS
ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY item_categories_tenant_read ON public.item_categories
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());

CREATE POLICY item_categories_tenant_insert ON public.item_categories
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission('inventory.create'));

CREATE POLICY item_categories_tenant_update ON public.item_categories
  FOR UPDATE TO authenticated
  USING  (tenant_id = public.current_tenant_id() AND public.has_permission('inventory.update'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission('inventory.update'));

CREATE POLICY item_categories_tenant_delete ON public.item_categories
  FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_permission('inventory.delete'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_categories TO authenticated;
GRANT ALL ON public.item_categories TO service_role;

-- Seed default categories for existing tenants
INSERT INTO public.item_categories (tenant_id, name, code)
SELECT t.id, cat.name, cat.code
FROM public.tenants t
CROSS JOIN (VALUES
  ('Finished Goods', 'FG'),
  ('Raw Materials',  'RM'),
  ('Packaging',      'PKG'),
  ('Consumables',    'CONS'),
  ('Spare Parts',    'SPARE'),
  ('Services',       'SVC')
) AS cat(name, code)
WHERE t.deleted_at IS NULL
ON CONFLICT (tenant_id, code) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  uom_conversions
--     Stores bidirectional conversion factors between units per item.
--     e.g.  item "Widget", from_uom="box", to_uom="pc", factor=12
--           means 1 box = 12 pcs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.uom_conversions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id     uuid        REFERENCES public.items(id) ON DELETE CASCADE,
  -- NULL item_id = global conversion (applies to all items)
  from_uom    text        NOT NULL,
  to_uom      text        NOT NULL,
  factor      numeric     NOT NULL CHECK (factor > 0),
  -- 1 from_uom = factor to_uom
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE NULLS NOT DISTINCT (tenant_id, item_id, from_uom, to_uom)
);

CREATE INDEX IF NOT EXISTS uom_conversions_tenant_item_idx
  ON public.uom_conversions(tenant_id, item_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_uom_conversions_updated
  BEFORE UPDATE ON public.uom_conversions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.uom_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY uom_conversions_tenant_read ON public.uom_conversions
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());

CREATE POLICY uom_conversions_tenant_write ON public.uom_conversions
  FOR ALL TO authenticated
  USING  (tenant_id = public.current_tenant_id() AND public.has_permission('inventory.update'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission('inventory.update'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.uom_conversions TO authenticated;
GRANT ALL ON public.uom_conversions TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3.  Extend items table
--     All columns are nullable and have sensible defaults so existing rows
--     and INSERT statements that omit them continue to work unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

-- 3a. Identity / presentation
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS barcode          text,
  ADD COLUMN IF NOT EXISTS image_url        text,
  ADD COLUMN IF NOT EXISTS brand            text,
  ADD COLUMN IF NOT EXISTS manufacturer     text,
  ADD COLUMN IF NOT EXISTS model            text,
  ADD COLUMN IF NOT EXISTS status           text NOT NULL DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS sales_description      text,
  ADD COLUMN IF NOT EXISTS purchase_description   text;

-- 3b. Categorisation
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS category_id      uuid REFERENCES public.item_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS items_category_idx ON public.items(category_id) WHERE deleted_at IS NULL;

-- 3c. Unit of measure (per transaction type)
--     uom already exists (stock uom). Add the others.
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS purchase_uom        text,
  ADD COLUMN IF NOT EXISTS sales_uom           text,
  ADD COLUMN IF NOT EXISTS manufacturing_uom   text;

-- 3d. Stock level controls
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS min_stock           numeric,
  ADD COLUMN IF NOT EXISTS max_stock           numeric,
  ADD COLUMN IF NOT EXISTS safety_stock        numeric,
  ADD COLUMN IF NOT EXISTS reorder_qty         numeric;

-- reorder already exists — keep it as the reorder point

-- 3e. Procurement / supplier
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS supplier_lead_time_days  integer,
  ADD COLUMN IF NOT EXISTS preferred_supplier_id    uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS items_preferred_supplier_idx
  ON public.items(preferred_supplier_id) WHERE deleted_at IS NULL;

-- 3f. Tracking flags
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS track_inventory    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS track_batches      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS track_serials      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS track_expiry       boolean NOT NULL DEFAULT false;

-- 3g. Inventory tracking method
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS inventory_tracking  text NOT NULL DEFAULT 'AVCO';
  -- values: 'AVCO' | 'FIFO' | 'None'

-- 3h. Standard cost (for manufacturing standard costing, separate from avg cost)
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS standard_cost   numeric;

-- 3i. GL account overrides (per-item, optional – falls back to tenant defaults)
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS inventory_account_id  uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cogs_account_id       uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sales_account_id      uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purchase_account_id   uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

-- Indexes on account overrides for GL audit queries
CREATE INDEX IF NOT EXISTS items_inventory_account_idx ON public.items(inventory_account_id) WHERE inventory_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS items_cogs_account_idx      ON public.items(cogs_account_id)      WHERE cogs_account_id      IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4.  Back-fill status for existing items
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.items
SET status = 'Active'
WHERE status IS NULL OR status = '';


-- ─────────────────────────────────────────────────────────────────────────────
-- 5.  Extend `inventory_item_stock` view to include new fields
--     PostgreSQL does not allow CREATE OR REPLACE VIEW to change existing
--     column names or positions.  We drop and recreate instead.
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.inventory_item_stock CASCADE;

CREATE VIEW public.inventory_item_stock AS
SELECT
  i.tenant_id,
  i.id           AS item_id,
  i.sku,
  i.name,
  i.type,
  i.uom,
  i.status,
  i.reorder,
  i.min_stock,
  i.max_stock,
  i.safety_stock,
  i.reorder_qty,
  i.cost,
  i.price,
  i.standard_cost,
  i.category_id,
  i.brand,
  i.manufacturer,
  COALESCE(SUM(sm.quantity), 0)::numeric AS on_hand
FROM public.items i
LEFT JOIN public.stock_movements sm
  ON sm.item_id = i.id
 AND sm.tenant_id = i.tenant_id
WHERE i.deleted_at IS NULL
GROUP BY i.tenant_id, i.id, i.sku, i.name, i.type, i.uom, i.status,
         i.reorder, i.min_stock, i.max_stock, i.safety_stock, i.reorder_qty,
         i.cost, i.price, i.standard_cost, i.category_id, i.brand, i.manufacturer;

-- Restore grants (CASCADE above would have dropped them)
GRANT SELECT ON public.inventory_item_stock TO authenticated;
GRANT ALL    ON public.inventory_item_stock TO service_role;

-- Also restore the warehouse-level view which may have been created in an
-- earlier migration and could be affected by CASCADE on the item stock view.
DROP VIEW IF EXISTS public.inventory_warehouse_stock CASCADE;

CREATE VIEW public.inventory_warehouse_stock AS
SELECT
  sm.tenant_id,
  sm.item_id,
  sm.warehouse_id,
  COALESCE(SUM(sm.quantity), 0)::numeric AS on_hand
FROM public.stock_movements sm
GROUP BY sm.tenant_id, sm.item_id, sm.warehouse_id;

GRANT SELECT ON public.inventory_warehouse_stock TO authenticated;
GRANT ALL    ON public.inventory_warehouse_stock TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6.  Permissions: ensure inventory.delete exists (needed for categories)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.permissions (code, module, action, description) VALUES
  ('inventory.delete','inventory','delete','Delete inventory records')
ON CONFLICT (code) DO NOTHING;

-- Grant to inventory role
INSERT INTO public.role_permissions (role, permission_code)
SELECT 'inventory', 'inventory.delete'
ON CONFLICT DO NOTHING;
