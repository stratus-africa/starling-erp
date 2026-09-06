-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Requisition Types & Warehouse Source
-- Purpose:
--   1. Add `requisition_type` column to differentiate Stock vs Purchase Requisitions.
--   2. Add `from_warehouse_id` to support Stock Requisitions that draw from a warehouse.
--   3. The existing `supplier_id` column is KEPT for backwards compatibility but is
--      semantically deprecated on requisitions — supplier selection now happens at
--      the "Convert to PO" stage, not on the requisition itself.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Add requisition_type column ──────────────────────────────────────────
ALTER TABLE public.purchase_requisitions
  ADD COLUMN IF NOT EXISTS requisition_type TEXT NOT NULL DEFAULT 'purchase'
    CHECK (requisition_type IN ('stock', 'purchase'));

COMMENT ON COLUMN public.purchase_requisitions.requisition_type IS
  'stock = internal stock draw from a warehouse; purchase = external buy requisition';

-- ── 2. Add from_warehouse_id column ─────────────────────────────────────────
ALTER TABLE public.purchase_requisitions
  ADD COLUMN IF NOT EXISTS from_warehouse_id UUID REFERENCES public.warehouses(id);

COMMENT ON COLUMN public.purchase_requisitions.from_warehouse_id IS
  'For stock requisitions: the warehouse from which stock is being requested';

-- ── 3. Index for warehouse FK lookups ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_warehouse
  ON public.purchase_requisitions (from_warehouse_id)
  WHERE from_warehouse_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_type_tenant
  ON public.purchase_requisitions (tenant_id, requisition_type);

-- ── 4. Deprecate supplier_id semantically (keep column, nullify on new rows) ─
COMMENT ON COLUMN public.purchase_requisitions.supplier_id IS
  '[DEPRECATED] Do not populate on new requisitions. Supplier is selected at PO conversion time.';
