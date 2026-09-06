-- =========================================================
-- Production Material Reservation
--
-- Extends the production order workflow to the full 9-stage lifecycle:
--   Draft → Planned → Confirmed → Material Reserved → Released
--   → In Progress → Quality Check → Completed → Closed
--
-- Uses the EXISTING stock_reservations table (ref_type = 'production_order')
-- — the same architecture as sales order reservations.  No second system.
--
-- New columns on production_orders:
--   confirmed_at, reserved_at, released_at, quality_check_at, closed_at
--
-- New RPCs (all SECURITY DEFINER, tenant-safe, transactional):
--   check_material_availability(_order_id)
--   create_production_reservations(_order_id)
--   release_production_reservations(_order_id)
--   confirm_production_order(_order_id)
--   release_production_order(_order_id)
--   start_production_order(_order_id)
--   complete_production_quality_check(_order_id)
--   close_production_order(_order_id)
--   cancel_production_order(_order_id)
--
-- Updated:
--   post_production_order_unchecked — releases reservations on completion,
--   transitions through Quality Check before Completed is allowed.
-- =========================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  Ensure inventory_config table exists
--     This table may have been deployed directly to the live DB without a
--     tracked migration.  CREATE TABLE IF NOT EXISTS is safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inventory_config (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key         text        NOT NULL,
  value       text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One row per (tenant, key)
CREATE UNIQUE INDEX IF NOT EXISTS inventory_config_tenant_key_idx
  ON public.inventory_config (tenant_id, key);

ALTER TABLE public.inventory_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_config_tenant_access" ON public.inventory_config;
CREATE POLICY "inventory_config_tenant_access"
  ON public.inventory_config FOR ALL TO authenticated
  USING  (tenant_id = public.current_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_config TO authenticated;
GRANT ALL ON public.inventory_config TO service_role;

-- upsert_inventory_config RPC — may already exist, safe to replace
CREATE OR REPLACE FUNCTION public.upsert_inventory_config(_key text, _value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_permission('inventory.update') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.inventory_config (tenant_id, key, value)
  VALUES (current_tenant_id(), _key, _value)
  ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_inventory_config(text, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  Extend production_orders with lifecycle timestamps
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS confirmed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS reserved_at        timestamptz,
  ADD COLUMN IF NOT EXISTS released_at        timestamptz,
  ADD COLUMN IF NOT EXISTS quality_check_at   timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at          timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reserved_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS released_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quality_check_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at       timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quality_notes      text;

-- Index for fast open-order lookups
CREATE INDEX IF NOT EXISTS production_orders_status_tenant_idx
  ON public.production_orders (tenant_id, status)
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.  Index on stock_reservations for fast production-order lookups
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS stock_reservations_ref_idx
  ON public.stock_reservations (tenant_id, ref_type, ref_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS stock_reservations_item_warehouse_idx
  ON public.stock_reservations (tenant_id, item_id, warehouse_id, status)
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.  check_material_availability(_order_id)
--
--     READ-ONLY.  Explodes the BOM, computes on-hand and already-reserved
--     quantities, and returns one row per leaf component with availability
--     figures.  Does NOT write anything.
--
--     Returns:
--       item_id, item_name, sku, uom,
--       required_qty        — effective_qty from explode_bom (with scrap)
--       on_hand             — sum(stock_movements.quantity)
--       reserved            — sum(active stock_reservations) for OTHER orders
--       reserved_this_order — sum(active stock_reservations) for THIS order
--       available           — on_hand - reserved (excluding this order's own)
--       shortage            — max(0, required_qty - available)
--       warehouse_id, warehouse_name
--       is_subassembly
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_material_availability(_order_id uuid)
RETURNS TABLE (
  item_id             uuid,
  item_name           text,
  sku                 text,
  uom                 text,
  required_qty        numeric,
  on_hand             numeric,
  reserved            numeric,
  reserved_this_order numeric,
  available           numeric,
  shortage            numeric,
  warehouse_id        uuid,
  warehouse_name      text,
  is_subassembly      boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  mo       production_orders;
BEGIN
  -- Tenant safety
  SELECT * INTO mo
  FROM   production_orders
  WHERE  id = _order_id
    AND  tenant_id = v_tenant
    AND  deleted_at IS NULL;

  IF mo.id IS NULL THEN
    RAISE EXCEPTION 'Production order not found or access denied';
  END IF;

  IF mo.bom_id IS NULL THEN
    -- No BOM — return empty
    RETURN;
  END IF;

  RETURN QUERY
  WITH
  -- Explode BOM to get required quantities per component
  bom_components AS (
    SELECT
      eb.item_id,
      eb.item_name,
      eb.sku,
      eb.uom,
      SUM(eb.effective_qty) AS required_qty,
      eb.is_subassembly
    FROM public.explode_bom(mo.bom_id, mo.quantity) eb
    GROUP BY eb.item_id, eb.item_name, eb.sku, eb.uom, eb.is_subassembly
  ),
  -- On-hand stock from movements ledger (warehouse-specific if order has warehouse)
  stock_on_hand AS (
    SELECT
      sm.item_id,
      sm.warehouse_id,
      SUM(sm.quantity) AS on_hand
    FROM public.stock_movements sm
    WHERE sm.tenant_id = v_tenant
      AND sm.item_id IN (SELECT item_id FROM bom_components)
      AND (mo.warehouse_id IS NULL OR sm.warehouse_id = mo.warehouse_id)
    GROUP BY sm.item_id, sm.warehouse_id
  ),
  -- Active reservations by OTHER documents (not this production order)
  other_reservations AS (
    SELECT
      sr.item_id,
      sr.warehouse_id,
      SUM(sr.quantity) AS reserved
    FROM public.stock_reservations sr
    WHERE sr.tenant_id  = v_tenant
      AND sr.status     = 'Active'
      AND sr.deleted_at IS NULL
      AND NOT (sr.ref_type = 'production_order' AND sr.ref_id = _order_id)
      AND sr.item_id IN (SELECT item_id FROM bom_components)
      AND (mo.warehouse_id IS NULL OR sr.warehouse_id IS NOT DISTINCT FROM mo.warehouse_id)
    GROUP BY sr.item_id, sr.warehouse_id
  ),
  -- Reservations that belong to THIS production order
  this_reservations AS (
    SELECT
      sr.item_id,
      sr.warehouse_id,
      SUM(sr.quantity) AS reserved
    FROM public.stock_reservations sr
    WHERE sr.tenant_id  = v_tenant
      AND sr.ref_type   = 'production_order'
      AND sr.ref_id     = _order_id
      AND sr.status     = 'Active'
      AND sr.deleted_at IS NULL
    GROUP BY sr.item_id, sr.warehouse_id
  ),
  -- Best warehouse to source from (order's warehouse, or best stock warehouse)
  best_warehouse AS (
    SELECT DISTINCT ON (soh.item_id)
      soh.item_id,
      soh.warehouse_id,
      w.name AS warehouse_name
    FROM stock_on_hand soh
    LEFT JOIN public.warehouses w ON w.id = soh.warehouse_id
    ORDER BY soh.item_id, soh.on_hand DESC
  )
  SELECT
    bc.item_id,
    bc.item_name,
    bc.sku,
    bc.uom,
    ROUND(bc.required_qty,        6) AS required_qty,
    COALESCE(ROUND(soh.on_hand,   6), 0::numeric) AS on_hand,
    COALESCE(ROUND(ores.reserved, 6), 0::numeric) AS reserved,
    COALESCE(ROUND(tres.reserved, 6), 0::numeric) AS reserved_this_order,
    -- available = on_hand - reservations by other docs
    GREATEST(0,
      COALESCE(soh.on_hand, 0) - COALESCE(ores.reserved, 0)
    )::numeric                        AS available,
    -- shortage = how much more we need beyond available
    GREATEST(0,
      bc.required_qty - GREATEST(0, COALESCE(soh.on_hand, 0) - COALESCE(ores.reserved, 0))
    )::numeric                        AS shortage,
    COALESCE(bw.warehouse_id, mo.warehouse_id) AS warehouse_id,
    COALESCE(bw.warehouse_name,
      (SELECT name FROM public.warehouses WHERE id = mo.warehouse_id)) AS warehouse_name,
    bc.is_subassembly
  FROM      bom_components bc
  LEFT JOIN best_warehouse   bw   ON bw.item_id = bc.item_id
  LEFT JOIN stock_on_hand    soh  ON soh.item_id = bc.item_id
                                 AND soh.warehouse_id IS NOT DISTINCT FROM bw.warehouse_id
  LEFT JOIN other_reservations ores ON ores.item_id = bc.item_id
                                   AND ores.warehouse_id IS NOT DISTINCT FROM bw.warehouse_id
  LEFT JOIN this_reservations  tres ON tres.item_id = bc.item_id
                                   AND tres.warehouse_id IS NOT DISTINCT FROM bw.warehouse_id
  ORDER BY bc.item_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_material_availability(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.  create_production_reservations(_order_id)
--
--     Creates stock_reservations rows for all leaf BOM components.
--     Idempotent: if a reservation already exists for a component on this
--     order it is updated in-place (prevents double reservation).
--     Transitions order status: Confirmed → Material Reserved.
--     Returns the same availability rows as check_material_availability.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_production_reservations(_order_id uuid)
RETURNS TABLE (
  item_id             uuid,
  item_name           text,
  sku                 text,
  uom                 text,
  required_qty        numeric,
  on_hand             numeric,
  reserved            numeric,
  reserved_this_order numeric,
  available           numeric,
  shortage            numeric,
  warehouse_id        uuid,
  warehouse_name      text,
  is_subassembly      boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant  uuid := current_tenant_id();
  mo        production_orders;
  allow_short boolean;
  comp      record;
  wh        uuid;
BEGIN
  -- Permission check
  IF NOT has_permission('manufacturing.update') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO mo
  FROM   production_orders
  WHERE  id = _order_id AND tenant_id = v_tenant AND deleted_at IS NULL;

  IF mo.id IS NULL THEN
    RAISE EXCEPTION 'Production order not found';
  END IF;

  -- Only allowed from Confirmed status
  IF mo.status NOT IN ('Confirmed', 'Planned') THEN
    RAISE EXCEPTION 'Reservations can only be created for Confirmed production orders (current: %)', mo.status;
  END IF;

  IF mo.bom_id IS NULL THEN
    RAISE EXCEPTION 'Production order has no BOM assigned';
  END IF;

  -- Check allow_production_shortage config
  SELECT COALESCE(value = 'true', false) INTO allow_short
  FROM   public.inventory_config
  WHERE  tenant_id = v_tenant
    AND  key       = 'allow_production_shortage'
  LIMIT 1;

  -- Determine warehouse
  wh := mo.warehouse_id;
  IF wh IS NULL THEN
    SELECT id INTO wh
    FROM   public.warehouses
    WHERE  tenant_id = v_tenant AND deleted_at IS NULL
    ORDER  BY created_at
    LIMIT  1;
  END IF;

  -- ── Create / update reservations for each leaf component ──────────────────
  FOR comp IN
    SELECT
      eb.item_id,
      SUM(eb.effective_qty) AS req_qty
    FROM public.explode_bom(mo.bom_id, mo.quantity) eb
    WHERE eb.is_subassembly = false
    GROUP BY eb.item_id
  LOOP
    -- Availability check (unless shortages allowed)
    IF NOT allow_short THEN
      DECLARE
        avail numeric;
      BEGIN
        SELECT GREATEST(0,
                 COALESCE(SUM(sm.quantity), 0)
                 - COALESCE((
                     SELECT SUM(sr.quantity)
                     FROM   public.stock_reservations sr
                     WHERE  sr.tenant_id  = v_tenant
                       AND  sr.item_id    = comp.item_id
                       AND  sr.status     = 'Active'
                       AND  sr.deleted_at IS NULL
                       AND  NOT (sr.ref_type = 'production_order' AND sr.ref_id = _order_id)
                       AND  (sr.warehouse_id IS NOT DISTINCT FROM wh)
                   ), 0)
               )
        INTO  avail
        FROM  public.stock_movements sm
        WHERE sm.tenant_id   = v_tenant
          AND sm.item_id     = comp.item_id
          AND (sm.warehouse_id IS NOT DISTINCT FROM wh);

        IF avail < comp.req_qty THEN
          RAISE EXCEPTION
            'Insufficient stock for item % — required: %, available: %. Enable allow_production_shortage to override.',
            comp.item_id, comp.req_qty, avail;
        END IF;
      END;
    END IF;

    -- Upsert reservation — one row per component per order (idempotent)
    INSERT INTO public.stock_reservations (
      tenant_id, item_id, warehouse_id,
      quantity, ref_type, ref_id, status, created_by
    )
    VALUES (
      v_tenant, comp.item_id, wh,
      comp.req_qty, 'production_order', _order_id, 'Active', auth.uid()
    )
    ON CONFLICT DO NOTHING;

    -- If a reservation already existed (from a prior call), update its qty
    UPDATE public.stock_reservations
    SET    quantity   = comp.req_qty,
           updated_at = now()
    WHERE  tenant_id  = v_tenant
      AND  ref_type   = 'production_order'
      AND  ref_id     = _order_id
      AND  item_id    = comp.item_id
      AND  status     = 'Active'
      AND  deleted_at IS NULL
      AND  quantity  <> comp.req_qty;  -- only write if actually changed
  END LOOP;

  -- ── Advance order status ──────────────────────────────────────────────────
  UPDATE public.production_orders
  SET
    status      = 'Material Reserved',
    reserved_at = now(),
    reserved_by = auth.uid(),
    updated_at  = now()
  WHERE id = _order_id;

  INSERT INTO public.document_events (
    tenant_id, entity_type, entity_id, status, note, actor_id, actor_email
  )
  SELECT
    v_tenant, 'production_order', _order_id, 'Material Reserved',
    'Materials reserved for production order',
    auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid());

  -- Return updated availability snapshot
  RETURN QUERY SELECT * FROM public.check_material_availability(_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_production_reservations(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.  release_production_reservations(_order_id)
--
--     Soft-deletes (or marks Cancelled) all active reservations for the order.
--     Returns the count of reservations released.
--     Called on order cancellation or when re-planning.
--     Does NOT change order status — the caller decides the next status.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.release_production_reservations(_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_count  integer;
BEGIN
  -- Permission check
  IF NOT has_permission('manufacturing.update') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  -- Verify tenant ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.production_orders
    WHERE id = _order_id AND tenant_id = v_tenant AND deleted_at IS NULL
  ) AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Production order not found or access denied';
  END IF;

  -- Soft-cancel all active reservations for this order
  UPDATE public.stock_reservations
  SET    status     = 'Cancelled',
         deleted_at = now(),
         updated_at = now()
  WHERE  tenant_id  = v_tenant
    AND  ref_type   = 'production_order'
    AND  ref_id     = _order_id
    AND  status     = 'Active'
    AND  deleted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_production_reservations(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6.  confirm_production_order(_order_id)
--
--     Draft/Planned → Confirmed.
--     Validates that a BOM is assigned and approved/active.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.confirm_production_order(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  mo       production_orders;
  bm       bom_headers;
BEGIN
  IF NOT has_permission('manufacturing.update') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO mo
  FROM   production_orders
  WHERE  id = _order_id AND tenant_id = v_tenant AND deleted_at IS NULL;

  IF mo.id IS NULL THEN RAISE EXCEPTION 'Production order not found'; END IF;

  IF mo.status NOT IN ('Draft', 'Planned') THEN
    RAISE EXCEPTION 'Only Draft or Planned orders can be confirmed (current: %)', mo.status;
  END IF;

  IF mo.bom_id IS NULL THEN
    RAISE EXCEPTION 'A BOM must be assigned before confirming a production order';
  END IF;

  SELECT * INTO bm FROM public.bom_headers WHERE id = mo.bom_id AND deleted_at IS NULL;
  IF bm.id IS NULL THEN RAISE EXCEPTION 'Assigned BOM not found'; END IF;

  IF bm.approval_status NOT IN ('Active', 'Approved') THEN
    RAISE EXCEPTION 'BOM must be Active or Approved before order can be confirmed (current: %)', bm.approval_status;
  END IF;

  UPDATE public.production_orders
  SET
    status       = 'Confirmed',
    confirmed_at = now(),
    confirmed_by = auth.uid(),
    updated_at   = now()
  WHERE id = _order_id;

  INSERT INTO public.document_events (
    tenant_id, entity_type, entity_id, status, note, actor_id, actor_email
  )
  SELECT v_tenant, 'production_order', _order_id, 'Confirmed',
         'Production order confirmed; BOM validated',
         auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_production_order(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7.  release_production_order(_order_id)
--
--     Material Reserved → Released.
--     Verifies reservations exist before allowing release to shop floor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.release_production_order(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant   uuid := current_tenant_id();
  mo         production_orders;
  res_count  integer;
BEGIN
  IF NOT has_permission('manufacturing.update') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO mo
  FROM   production_orders
  WHERE  id = _order_id AND tenant_id = v_tenant AND deleted_at IS NULL;

  IF mo.id IS NULL THEN RAISE EXCEPTION 'Production order not found'; END IF;

  IF mo.status <> 'Material Reserved' THEN
    RAISE EXCEPTION 'Only Material Reserved orders can be released (current: %)', mo.status;
  END IF;

  -- Confirm reservations exist
  SELECT COUNT(*) INTO res_count
  FROM   public.stock_reservations
  WHERE  tenant_id  = v_tenant
    AND  ref_type   = 'production_order'
    AND  ref_id     = _order_id
    AND  status     = 'Active'
    AND  deleted_at IS NULL;

  IF res_count = 0 THEN
    RAISE EXCEPTION 'No active material reservations found. Reserve materials before releasing to shop floor.';
  END IF;

  UPDATE public.production_orders
  SET
    status      = 'Released',
    released_at = now(),
    released_by = auth.uid(),
    updated_at  = now()
  WHERE id = _order_id;

  INSERT INTO public.document_events (
    tenant_id, entity_type, entity_id, status, note, actor_id, actor_email
  )
  SELECT v_tenant, 'production_order', _order_id, 'Released',
         'Production order released to shop floor',
         auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_production_order(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8.  start_production_order(_order_id)
--
--     Released → In Progress.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.start_production_order(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  mo       production_orders;
BEGIN
  IF NOT has_permission('manufacturing.update') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO mo
  FROM   production_orders
  WHERE  id = _order_id AND tenant_id = v_tenant AND deleted_at IS NULL;

  IF mo.id IS NULL THEN RAISE EXCEPTION 'Production order not found'; END IF;

  -- Allow starting from Released OR (for backward compat) from legacy In Progress-eligible statuses
  IF mo.status NOT IN ('Released', 'Material Reserved') THEN
    RAISE EXCEPTION 'Only Released orders can be started (current: %)', mo.status;
  END IF;

  UPDATE public.production_orders
  SET
    status     = 'In Progress',
    updated_at = now()
  WHERE id = _order_id;

  INSERT INTO public.document_events (
    tenant_id, entity_type, entity_id, status, note, actor_id, actor_email
  )
  SELECT v_tenant, 'production_order', _order_id, 'In Progress',
         'Production started',
         auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_production_order(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9.  complete_production_quality_check(_order_id, _notes)
--
--     In Progress → Quality Check.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.complete_production_quality_check(
  _order_id uuid,
  _notes    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  mo       production_orders;
BEGIN
  IF NOT has_permission('manufacturing.update') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO mo
  FROM   production_orders
  WHERE  id = _order_id AND tenant_id = v_tenant AND deleted_at IS NULL;

  IF mo.id IS NULL THEN RAISE EXCEPTION 'Production order not found'; END IF;

  IF mo.status <> 'In Progress' THEN
    RAISE EXCEPTION 'Only In Progress orders can enter Quality Check (current: %)', mo.status;
  END IF;

  UPDATE public.production_orders
  SET
    status           = 'Quality Check',
    quality_check_at = now(),
    quality_check_by = auth.uid(),
    quality_notes    = COALESCE(_notes, quality_notes),
    updated_at       = now()
  WHERE id = _order_id;

  INSERT INTO public.document_events (
    tenant_id, entity_type, entity_id, status, note, actor_id, actor_email
  )
  SELECT v_tenant, 'production_order', _order_id, 'Quality Check',
         COALESCE('QC: ' || _notes, 'Production entered quality check'),
         auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_production_quality_check(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10.  close_production_order(_order_id)
--
--      Completed → Closed.  Purely administrative — locks the order for further
--      edits.  Inventory already consumed at Completed step.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.close_production_order(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  mo       production_orders;
BEGIN
  IF NOT has_permission('manufacturing.update') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO mo
  FROM   production_orders
  WHERE  id = _order_id AND tenant_id = v_tenant AND deleted_at IS NULL;

  IF mo.id IS NULL THEN RAISE EXCEPTION 'Production order not found'; END IF;

  IF mo.status <> 'Completed' THEN
    RAISE EXCEPTION 'Only Completed orders can be closed (current: %)', mo.status;
  END IF;

  UPDATE public.production_orders
  SET
    status    = 'Closed',
    closed_at = now(),
    closed_by = auth.uid(),
    updated_at = now()
  WHERE id = _order_id;

  INSERT INTO public.document_events (
    tenant_id, entity_type, entity_id, status, note, actor_id, actor_email
  )
  SELECT v_tenant, 'production_order', _order_id, 'Closed',
         'Production order closed',
         auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_production_order(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11.  cancel_production_order(_order_id)
--
--      Any open status → Cancelled.
--      Atomically releases all reservations and marks the order cancelled.
--      Replaces the two-step client-side cancel pattern.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cancel_production_order(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant   uuid := current_tenant_id();
  mo         production_orders;
  rel_count  integer;
BEGIN
  IF NOT has_permission('manufacturing.update') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO mo
  FROM   production_orders
  WHERE  id = _order_id AND tenant_id = v_tenant AND deleted_at IS NULL;

  IF mo.id IS NULL THEN RAISE EXCEPTION 'Production order not found'; END IF;

  IF mo.status IN ('Completed', 'Closed', 'Cancelled') THEN
    RAISE EXCEPTION 'Cannot cancel a % order', mo.status;
  END IF;

  -- Release reservations atomically (may be 0 if never reserved)
  rel_count := public.release_production_reservations(_order_id);

  UPDATE public.production_orders
  SET
    status       = 'Cancelled',
    cancelled_at = now(),
    cancelled_by = auth.uid(),
    updated_at   = now()
  WHERE id = _order_id;

  INSERT INTO public.document_events (
    tenant_id, entity_type, entity_id, status, note, actor_id, actor_email
  )
  SELECT v_tenant, 'production_order', _order_id, 'Cancelled',
         format('Order cancelled; %s reservation(s) released', rel_count),
         auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_production_order(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12.  Update post_production_order_unchecked
--
--      Extended to:
--      a) Require Quality Check status before posting (unless allow_production_shortage)
--      b) Convert active reservations → consumed movements
--         (the reservation quantities become the actual stock movements,
--          with any delta consumed directly — handles partial shortages)
--      c) Release (soft-delete) all reservations after stock movements are created
--      d) Transition: Quality Check → Completed
--
--      Multi-level BOM explosion is retained from the prior migration.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_production_order_unchecked(_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  mo                   production_orders;
  bm                   bom_headers;
  wh                   uuid;
  comp                 record;
  total_component_cost numeric(14,2) := 0;
  wip_acct             uuid;
  inv_acct             uuid;
  j_id                 uuid;
BEGIN
  SELECT * INTO mo FROM production_orders WHERE id = _order_id AND deleted_at IS NULL;
  IF mo.id IS NULL THEN RAISE EXCEPTION 'Production order not found'; END IF;
  IF mo.tenant_id <> current_tenant_id() AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF mo.posted_at IS NOT NULL THEN RAISE EXCEPTION 'Production order already posted'; END IF;

  -- Require Quality Check status (or In Progress for legacy/bypass path)
  IF mo.status NOT IN ('Quality Check', 'In Progress', 'Released') THEN
    RAISE EXCEPTION
      'Production order must be in Quality Check or In Progress to post (current: %)',
      mo.status;
  END IF;

  SELECT * INTO bm FROM bom_headers WHERE id = mo.bom_id AND deleted_at IS NULL;
  IF bm.id IS NULL THEN RAISE EXCEPTION 'BOM not found'; END IF;

  wh := mo.warehouse_id;
  IF wh IS NULL THEN
    SELECT id INTO wh FROM warehouses
    WHERE tenant_id = mo.tenant_id AND deleted_at IS NULL
    ORDER BY created_at LIMIT 1;
  END IF;

  wip_acct := _account_id(mo.tenant_id, '1300');
  inv_acct := _account_id(mo.tenant_id, '1200');

  -- ── Consume components via full multi-level explosion ──────────────────────
  -- Only consume LEAF components (is_subassembly = false).
  FOR comp IN
    SELECT
      eb.item_id,
      SUM(eb.effective_qty) AS effective_qty,
      MAX(eb.unit_cost)     AS unit_cost,
      MAX(eb.item_name)     AS item_name
    FROM   public.explode_bom(mo.bom_id, mo.quantity) eb
    WHERE  eb.is_subassembly = false
    GROUP  BY eb.item_id
  LOOP
    total_component_cost :=
      total_component_cost + (comp.effective_qty * comp.unit_cost);

    INSERT INTO stock_movements (
      tenant_id, item_id, warehouse_id, quantity, unit_cost,
      ref_type, ref_id, note, created_by
    ) VALUES (
      mo.tenant_id, comp.item_id, wh,
      -comp.effective_qty, comp.unit_cost,
      'production_consume', mo.id,
      'Consume for ' || COALESCE(mo.number, ''), auth.uid()
    );
  END LOOP;

  -- ── Release material reservations (convert to actual movements above) ──────
  UPDATE public.stock_reservations
  SET    status     = 'Fulfilled',
         deleted_at = now(),
         updated_at = now()
  WHERE  tenant_id  = mo.tenant_id
    AND  ref_type   = 'production_order'
    AND  ref_id     = _order_id
    AND  status     = 'Active'
    AND  deleted_at IS NULL;

  -- ── Receive finished good ──────────────────────────────────────────────────
  INSERT INTO stock_movements (
    tenant_id, item_id, warehouse_id, quantity, unit_cost,
    ref_type, ref_id, note, created_by
  ) VALUES (
    mo.tenant_id, bm.product_id, wh, mo.quantity,
    CASE WHEN mo.quantity > 0 THEN total_component_cost / mo.quantity ELSE 0 END,
    'production_receive', mo.id,
    'Produce ' || COALESCE(mo.number, ''), auth.uid()
  );

  -- ── Update finished item average cost ──────────────────────────────────────
  IF mo.quantity > 0 THEN
    UPDATE items
    SET cost = total_component_cost / mo.quantity
    WHERE id = bm.product_id;
  END IF;

  -- ── WIP journal entries ────────────────────────────────────────────────────
  IF total_component_cost > 0 AND wip_acct IS NOT NULL AND inv_acct IS NOT NULL THEN
    -- Entry 1: consume components → WIP
    INSERT INTO journal_entries (
      tenant_id, entry_date, memo, source_ref_type, source_ref_id,
      total_debit, total_credit, created_by
    ) VALUES (
      mo.tenant_id, CURRENT_DATE,
      'Consume components – ' || COALESCE(mo.number, ''),
      'production_order', mo.id,
      total_component_cost, total_component_cost, auth.uid()
    ) RETURNING id INTO j_id;

    INSERT INTO journal_lines (tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES
      (mo.tenant_id, j_id, wip_acct, total_component_cost, 0, 'WIP'),
      (mo.tenant_id, j_id, inv_acct, 0, total_component_cost, 'Inventory – components consumed');

    -- Entry 2: receive finished goods ← WIP
    INSERT INTO journal_entries (
      tenant_id, entry_date, memo, source_ref_type, source_ref_id,
      total_debit, total_credit, created_by
    ) VALUES (
      mo.tenant_id, CURRENT_DATE,
      'Receive finished goods – ' || COALESCE(mo.number, ''),
      'production_order', mo.id,
      total_component_cost, total_component_cost, auth.uid()
    ) RETURNING id INTO j_id;

    INSERT INTO journal_lines (tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES
      (mo.tenant_id, j_id, inv_acct, total_component_cost, 0, 'Inventory – finished goods'),
      (mo.tenant_id, j_id, wip_acct, 0, total_component_cost, 'WIP cleared');
  END IF;

  -- ── Mark production order complete ────────────────────────────────────────
  UPDATE production_orders
  SET    status    = 'Completed',
         posted_at = now(),
         updated_at = now()
  WHERE  id = _order_id;

  -- ── Mark BOM as used_in_production ────────────────────────────────────────
  UPDATE bom_headers
  SET    used_in_production = true, updated_at = now()
  WHERE  id = mo.bom_id AND used_in_production = false;

  INSERT INTO document_events (
    tenant_id, entity_type, entity_id, status, note, actor_id, actor_email
  )
  VALUES (
    mo.tenant_id, 'production_order', mo.id, 'Completed',
    'Production completed; materials consumed, finished goods received, reservations released',
    auth.uid(),
    (SELECT email FROM profiles WHERE id = auth.uid())
  );

  RETURN _order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_production_order_unchecked(uuid)
  FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13.  Update post_production_order (the permission-gated wrapper)
--      to accept Quality Check and In Progress statuses.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_production_order(_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.validate_posting_target('production_orders', _order_id, 'manufacturing.post') THEN
    RETURN _order_id;
  END IF;
  RETURN public.post_production_order_unchecked(_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_production_order(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 15.  Seed allow_production_shortage = false for all tenants (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.inventory_config (tenant_id, key, value)
SELECT t.id, 'allow_production_shortage', 'false'
FROM   public.tenants t
WHERE  t.deleted_at IS NULL
ON CONFLICT (tenant_id, key) DO NOTHING;
