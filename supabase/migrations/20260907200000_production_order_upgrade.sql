-- =========================================================
-- Production Order — Full Manufacturing Workflow Upgrade
--
-- NOTE: Sections 0a/0b ensure item_lots and item_serials exist
-- before any FK references.  These tables are normally created by
-- 20260906200000_batch_lot_serial_traceability.sql; the IF NOT EXISTS
-- guards make this migration idempotent and self-contained.
-- =========================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0a.  Ensure item_lots table exists
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.item_lots (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  item_id            uuid        NOT NULL REFERENCES public.items(id)    ON DELETE CASCADE,
  lot_number         text        NOT NULL,
  supplier_lot_ref   text,
  status             text        NOT NULL DEFAULT 'Active',
  manufactured_date  date,
  expiry_date        date,
  received_date      date,
  source_ref_type    text,
  source_ref_id      uuid,
  warehouse_id       uuid        REFERENCES public.warehouses(id)           ON DELETE SET NULL,
  location_id        uuid        REFERENCES public.warehouse_locations(id)  ON DELETE SET NULL,
  initial_qty        numeric     NOT NULL DEFAULT 0,
  notes              text,
  certificate_ref    text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid,
  deleted_at         timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS item_lots_item_lot_number_key
  ON public.item_lots (tenant_id, item_id, lower(lot_number))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS item_lots_item_id_idx
  ON public.item_lots (item_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS item_lots_source_ref_idx
  ON public.item_lots (source_ref_id) WHERE source_ref_id IS NOT NULL;

ALTER TABLE public.item_lots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "item_lots tenant access" ON public.item_lots;
CREATE POLICY "item_lots tenant access" ON public.item_lots
  FOR ALL TO authenticated
  USING  (tenant_id = public.current_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_lots TO authenticated;
GRANT ALL ON public.item_lots TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_item_lots_updated'
      AND tgrelid = 'public.item_lots'::regclass
  ) THEN
    CREATE TRIGGER trg_item_lots_updated
      BEFORE UPDATE ON public.item_lots
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0b.  Ensure item_serials table exists
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.item_serials (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid        NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  item_id                 uuid        NOT NULL REFERENCES public.items(id)    ON DELETE CASCADE,
  serial_number           text        NOT NULL,
  lot_id                  uuid        REFERENCES public.item_lots(id)         ON DELETE SET NULL,
  status                  text        NOT NULL DEFAULT 'In Stock',
  warehouse_id            uuid        REFERENCES public.warehouses(id)           ON DELETE SET NULL,
  location_id             uuid        REFERENCES public.warehouse_locations(id)  ON DELETE SET NULL,
  received_from_ref_type  text,
  received_from_ref_id    uuid,
  production_order_id     uuid        REFERENCES public.production_orders(id)    ON DELETE SET NULL,
  issued_to_ref_type      text,
  issued_to_ref_id        uuid,
  customer_id             uuid        REFERENCES public.customers(id)  ON DELETE SET NULL,
  warranty_months         integer,
  warranty_start          date,
  warranty_end            date GENERATED ALWAYS AS (
                            CASE
                              WHEN warranty_start IS NOT NULL AND warranty_months IS NOT NULL
                              THEN (warranty_start + make_interval(months => warranty_months))::date
                              ELSE NULL
                            END
                          ) STORED,
  manufactured_date       date,
  received_date           date,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid,
  deleted_at              timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS item_serials_item_serial_key
  ON public.item_serials (tenant_id, item_id, lower(serial_number))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS item_serials_item_id_idx
  ON public.item_serials (item_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS item_serials_lot_id_idx
  ON public.item_serials (lot_id) WHERE lot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS item_serials_production_idx
  ON public.item_serials (production_order_id) WHERE production_order_id IS NOT NULL;

ALTER TABLE public.item_serials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "item_serials tenant access" ON public.item_serials;
CREATE POLICY "item_serials tenant access" ON public.item_serials
  FOR ALL TO authenticated
  USING  (tenant_id = public.current_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_serials TO authenticated;
GRANT ALL ON public.item_serials TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_item_serials_updated'
      AND tgrelid = 'public.item_serials'::regclass
  ) THEN
    CREATE TRIGGER trg_item_serials_updated
      BEFORE UPDATE ON public.item_serials
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $$;

-- Also ensure stock_movements has lot_id / serial_id columns
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS lot_id    uuid REFERENCES public.item_lots(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS serial_id uuid REFERENCES public.item_serials(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS stock_movements_lot_id_idx
  ON public.stock_movements (lot_id) WHERE lot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS stock_movements_serial_id_idx
  ON public.stock_movements (serial_id) WHERE serial_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
--
-- Adds to production_orders:
--   qty_produced, qty_remaining (computed), priority,
--   planned_start, planned_end, actual_start, actual_end,
--   location_id (production floor location),
--   approved_by, approved_at,
--   bom_version_snapshot (locks the BOM version used),
--   allow_overproduction (tenant-authorized override)
--
-- New table: production_entries
--   One row per partial production run.  Every time an operator
--   records output, a row is inserted here.  Inventory is consumed
--   and received immediately per run.  The production order
--   accumulates qty_produced across all entries.
--
-- New statuses:  Paused  (In Progress ↔ Paused)
--
-- New RPCs (all tenant-safe, SECURITY DEFINER):
--   record_production_run(...)   – partial run: consume materials,
--                                  receive output, update qty_produced
--   pause_production_order(...)  – In Progress → Paused
--   resume_production_order(...) – Paused → In Progress
--   get_production_summary(...)  – header + per-entry audit view
--   approve_production_order(...)– Draft/Planned → Planned with approved_by stamp
--
-- Updated RPCs:
--   create_production_reservations – uses full planned qty (unchanged)
--   complete_production_quality_check – accepts Paused orders too
--   post_production_order_unchecked  – no longer consumes materials
--     itself; instead only closes out any remaining open reservations
--     and receives any residual finished goods not yet recorded via
--     production_entries.  If all qty already produced via entries the
--     "receive" movement is 0.
--   cancel_production_order – also voids any open production_entries
-- =========================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  Extend production_orders
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.production_orders
  -- Quantity tracking
  ADD COLUMN IF NOT EXISTS qty_produced        numeric  NOT NULL DEFAULT 0,
  -- qty_remaining is derived (quantity - qty_produced) but stored for fast querying
  ADD COLUMN IF NOT EXISTS qty_remaining       numeric  NOT NULL DEFAULT 0,

  -- Scheduling
  ADD COLUMN IF NOT EXISTS planned_start       date,
  ADD COLUMN IF NOT EXISTS planned_end         date,
  ADD COLUMN IF NOT EXISTS actual_start        timestamptz,
  ADD COLUMN IF NOT EXISTS actual_end          timestamptz,

  -- Floor location (within the warehouse)
  ADD COLUMN IF NOT EXISTS location_id         uuid REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,

  -- Priority: 1 = Critical, 2 = High, 3 = Normal, 4 = Low
  ADD COLUMN IF NOT EXISTS priority            integer  NOT NULL DEFAULT 3
    CHECK (priority BETWEEN 1 AND 4),

  -- Approval
  ADD COLUMN IF NOT EXISTS approved_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at         timestamptz,

  -- BOM version snapshot: stores the bom_headers.version at the time of confirmation
  -- so future BOM revisions don't affect in-flight orders
  ADD COLUMN IF NOT EXISTS bom_version_snapshot text,

  -- Allow producing more than planned (requires explicit opt-in per order)
  ADD COLUMN IF NOT EXISTS allow_overproduction boolean NOT NULL DEFAULT false,

  -- Paused tracking
  ADD COLUMN IF NOT EXISTS paused_at           timestamptz,
  ADD COLUMN IF NOT EXISTS paused_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pause_reason        text;

-- Back-fill qty_remaining for existing rows where it is 0 and qty_produced = 0
UPDATE public.production_orders
SET    qty_remaining = quantity
WHERE  qty_remaining = 0
  AND  qty_produced  = 0
  AND  status NOT IN ('Completed', 'Closed', 'Cancelled')
  AND  deleted_at IS NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS production_orders_planned_start_idx
  ON public.production_orders (tenant_id, planned_start)
  WHERE deleted_at IS NULL AND planned_start IS NOT NULL;

CREATE INDEX IF NOT EXISTS production_orders_priority_idx
  ON public.production_orders (tenant_id, priority, status)
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  production_entries  — one row per partial production run
--
--     Immutable after creation (no UPDATE except soft-cancel).
--     Serves as the audit trail for all production activity.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.production_entries (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL REFERENCES public.tenants(id)            ON DELETE CASCADE,
  production_order_id  uuid        NOT NULL REFERENCES public.production_orders(id)  ON DELETE CASCADE,

  -- Run details
  entry_number         integer     NOT NULL DEFAULT 1,   -- sequential within the order
  entry_date           date        NOT NULL DEFAULT CURRENT_DATE,
  operator_id          uuid        REFERENCES public.profiles(id)  ON DELETE SET NULL,

  -- Quantities
  qty_produced         numeric     NOT NULL CHECK (qty_produced > 0),
  qty_scrap            numeric     NOT NULL DEFAULT 0 CHECK (qty_scrap >= 0),

  -- Location for this run (may differ from order default)
  warehouse_id         uuid        REFERENCES public.warehouses(id)          ON DELETE SET NULL,
  location_id          uuid        REFERENCES public.warehouse_locations(id)  ON DELETE SET NULL,

  -- Lot produced (if finished item is lot-tracked)
  lot_id               uuid        REFERENCES public.item_lots(id)            ON DELETE SET NULL,
  lot_number           text,       -- denormalised for display without join

  -- Cost capture (computed at run time)
  unit_cost            numeric     NOT NULL DEFAULT 0,
  total_cost           numeric     NOT NULL DEFAULT 0,

  -- Status: Active | Voided
  status               text        NOT NULL DEFAULT 'Active',

  -- Reference to the stock_movements rows created by this entry
  -- (for audit trail — stored as JSONB array of movement ids)
  movement_ids         jsonb,

  notes                text,

  -- Audit
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid,
  voided_at            timestamptz,
  voided_by            uuid        REFERENCES public.profiles(id)  ON DELETE SET NULL,
  void_reason          text
);

CREATE INDEX IF NOT EXISTS production_entries_order_idx
  ON public.production_entries (production_order_id, entry_number);

CREATE INDEX IF NOT EXISTS production_entries_tenant_date_idx
  ON public.production_entries (tenant_id, entry_date)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS production_entries_lot_idx
  ON public.production_entries (lot_id)
  WHERE lot_id IS NOT NULL;

ALTER TABLE public.production_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "production_entries_tenant_access" ON public.production_entries;
CREATE POLICY "production_entries_tenant_access"
  ON public.production_entries FOR ALL TO authenticated
  USING  (tenant_id = public.current_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_entries TO authenticated;
GRANT ALL ON public.production_entries TO service_role;

CREATE OR REPLACE TRIGGER trg_production_entries_updated
  BEFORE UPDATE ON public.production_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.  approve_production_order(_order_id)
--
--     Stamps approved_by + approved_at.  Draft/Planned only.
--     Does NOT change status (approval is separate from confirmation).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_production_order(_order_id uuid)
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

  IF mo.status NOT IN ('Draft', 'Planned') THEN
    RAISE EXCEPTION 'Only Draft or Planned orders can be approved (current: %)', mo.status;
  END IF;

  UPDATE public.production_orders
  SET    approved_by  = auth.uid(),
         approved_at  = now(),
         updated_at   = now()
  WHERE  id = _order_id;

  INSERT INTO public.document_events (
    tenant_id, entity_type, entity_id, status, note, actor_id, actor_email
  )
  SELECT v_tenant, 'production_order', _order_id, mo.status,
         'Production order approved',
         auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_production_order(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.  pause_production_order(_order_id, _reason)
--
--     In Progress → Paused.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.pause_production_order(
  _order_id uuid,
  _reason   text DEFAULT NULL
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
    RAISE EXCEPTION 'Only In Progress orders can be paused (current: %)', mo.status;
  END IF;

  UPDATE public.production_orders
  SET    status       = 'Paused',
         paused_at    = now(),
         paused_by    = auth.uid(),
         pause_reason = _reason,
         updated_at   = now()
  WHERE  id = _order_id;

  INSERT INTO public.document_events (
    tenant_id, entity_type, entity_id, status, note, actor_id, actor_email
  )
  SELECT v_tenant, 'production_order', _order_id, 'Paused',
         COALESCE('Paused: ' || _reason, 'Production paused'),
         auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.pause_production_order(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.  resume_production_order(_order_id)
--
--     Paused → In Progress.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resume_production_order(_order_id uuid)
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

  IF mo.status <> 'Paused' THEN
    RAISE EXCEPTION 'Only Paused orders can be resumed (current: %)', mo.status;
  END IF;

  UPDATE public.production_orders
  SET    status     = 'In Progress',
         updated_at = now()
  WHERE  id = _order_id;

  INSERT INTO public.document_events (
    tenant_id, entity_type, entity_id, status, note, actor_id, actor_email
  )
  SELECT v_tenant, 'production_order', _order_id, 'In Progress',
         'Production resumed',
         auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.resume_production_order(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6.  record_production_run(...)
--
--     Records a partial (or full) production run against an In Progress or
--     Paused order.  This is the core partial-production function.
--
--     For each run it:
--       a) Validates the order is In Progress or Paused
--       b) Checks qty_produced + _qty_produced does not exceed planned
--          quantity (unless allow_overproduction = true OR the
--          allow_production_shortage config is set)
--       c) Proportionally consumes leaf BOM components (scaled to this
--          run's qty, not the full order qty)
--       d) Optionally reduces remaining stock_reservations by the consumed
--          amount (soft-reservation drawdown)
--       e) Receives finished goods into inventory
--       f) Optionally creates/links an item_lots row for the finished item
--          if it is lot-tracked
--       g) Inserts a production_entries row as the immutable audit record
--       h) Updates production_orders.qty_produced and qty_remaining
--       i) Sets actual_start on the first run if not already set
--
--     Parameters:
--       _order_id        – production order
--       _qty_produced    – output qty this run
--       _qty_scrap       – scrap qty (informational; does not affect stock)
--       _warehouse_id    – where to receive the output (defaults to order warehouse)
--       _location_id     – specific floor location (optional)
--       _lot_number      – lot number for the finished item (optional)
--       _notes           – run notes
--
--     Returns: uuid of the new production_entries row
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_production_run(
  _order_id      uuid,
  _qty_produced  numeric,
  _qty_scrap     numeric  DEFAULT 0,
  _warehouse_id  uuid     DEFAULT NULL,
  _location_id   uuid     DEFAULT NULL,
  _lot_number    text     DEFAULT NULL,
  _notes         text     DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant          uuid := current_tenant_id();
  mo                production_orders;
  bm                bom_headers;
  wh                uuid;
  comp              record;
  run_cost          numeric := 0;
  comp_cost         numeric;
  v_lot_id          uuid;
  entry_id          uuid;
  entry_no          integer;
  movement_ids      jsonb := '[]'::jsonb;
  v_move_id         uuid;
  allow_over        boolean;
BEGIN
  -- Permission check
  IF NOT has_permission('manufacturing.update') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF _qty_produced <= 0 THEN
    RAISE EXCEPTION 'Quantity produced must be greater than zero';
  END IF;

  IF _qty_scrap < 0 THEN
    RAISE EXCEPTION 'Scrap quantity cannot be negative';
  END IF;

  -- Load order
  SELECT * INTO mo
  FROM   production_orders
  WHERE  id = _order_id AND tenant_id = v_tenant AND deleted_at IS NULL;

  IF mo.id IS NULL THEN RAISE EXCEPTION 'Production order not found'; END IF;

  IF mo.status NOT IN ('In Progress', 'Paused') THEN
    RAISE EXCEPTION
      'Production can only be recorded for In Progress or Paused orders (current: %)',
      mo.status;
  END IF;

  IF mo.bom_id IS NULL THEN
    RAISE EXCEPTION 'No BOM assigned to this production order';
  END IF;

  -- Overproduction guard
  -- allow_overproduction can be set per-order OR via inventory_config
  SELECT COALESCE(ic.value = 'true', false) INTO allow_over
  FROM   public.inventory_config ic
  WHERE  ic.tenant_id = v_tenant
    AND  ic.key       = 'allow_production_shortage'
  LIMIT  1;

  allow_over := allow_over OR mo.allow_overproduction;

  IF NOT allow_over
     AND (mo.qty_produced + _qty_produced) > mo.quantity THEN
    RAISE EXCEPTION
      'Quantity produced (% + %) would exceed planned quantity (%). '
      'Enable allow_overproduction on the order or allow_production_shortage in settings to override.',
      mo.qty_produced, _qty_produced, mo.quantity;
  END IF;

  -- Resolve warehouse
  wh := COALESCE(_warehouse_id, mo.warehouse_id);
  IF wh IS NULL THEN
    SELECT id INTO wh
    FROM   public.warehouses
    WHERE  tenant_id = v_tenant AND deleted_at IS NULL
    ORDER  BY created_at LIMIT 1;
  END IF;

  -- Load BOM
  SELECT * INTO bm FROM bom_headers WHERE id = mo.bom_id AND deleted_at IS NULL;
  IF bm.id IS NULL THEN RAISE EXCEPTION 'BOM not found'; END IF;

  -- ── Proportionally consume leaf BOM components ──────────────────────────
  -- Scale factor = this run's qty / planned qty
  -- Uses explode_bom scaled to this run's qty so scrap_pct is honoured
  FOR comp IN
    SELECT
      eb.item_id,
      SUM(eb.effective_qty) AS effective_qty,
      MAX(eb.unit_cost)     AS unit_cost
    FROM   public.explode_bom(mo.bom_id, _qty_produced) eb
    WHERE  eb.is_subassembly = false
    GROUP  BY eb.item_id
  LOOP
    comp_cost := comp.effective_qty * comp.unit_cost;
    run_cost  := run_cost + comp_cost;

    INSERT INTO public.stock_movements (
      tenant_id, item_id, warehouse_id, location_id,
      quantity, unit_cost,
      ref_type, ref_id, note, created_by
    ) VALUES (
      v_tenant, comp.item_id, wh, _location_id,
      -comp.effective_qty, comp.unit_cost,
      'production_consume', _order_id,
      format('Run consume – %s', COALESCE(mo.number, '')), auth.uid()
    )
    RETURNING id INTO v_move_id;

    movement_ids := movement_ids || jsonb_build_array(v_move_id::text);

    -- ── Drawdown reservation proportionally ──────────────────────────────
    -- Reduce the reservation by the amount consumed, down to 0.
    -- This keeps the "reserved" figure accurate without releasing entirely
    -- until the order is complete or cancelled.
    UPDATE public.stock_reservations sr
    SET    quantity   = GREATEST(0, sr.quantity - comp.effective_qty),
           updated_at = now()
    WHERE  sr.tenant_id  = v_tenant
      AND  sr.ref_type   = 'production_order'
      AND  sr.ref_id     = _order_id
      AND  sr.item_id    = comp.item_id
      AND  sr.status     = 'Active'
      AND  sr.deleted_at IS NULL;
  END LOOP;

  -- ── Create or link item_lot for the finished good ────────────────────────
  IF _lot_number IS NOT NULL THEN
    -- Upsert: if this lot already exists for this item+order, reuse it
    SELECT id INTO v_lot_id
    FROM   public.item_lots
    WHERE  tenant_id       = v_tenant
      AND  item_id         = bm.product_id
      AND  lower(lot_number) = lower(_lot_number)
      AND  deleted_at      IS NULL
    LIMIT  1;

    IF v_lot_id IS NULL THEN
      INSERT INTO public.item_lots (
        tenant_id, item_id, lot_number,
        source_ref_type, source_ref_id,
        warehouse_id, location_id,
        initial_qty, manufactured_date, status, created_by
      ) VALUES (
        v_tenant, bm.product_id, _lot_number,
        'production_order', _order_id,
        wh, _location_id,
        _qty_produced, CURRENT_DATE, 'Active', auth.uid()
      )
      RETURNING id INTO v_lot_id;
    ELSE
      -- Update initial_qty to accumulate (lot spans multiple runs)
      UPDATE public.item_lots
      SET    initial_qty = initial_qty + _qty_produced,
             updated_at  = now()
      WHERE  id = v_lot_id;
    END IF;
  END IF;

  -- ── Receive finished goods into inventory ──────────────────────────────────
  INSERT INTO public.stock_movements (
    tenant_id, item_id, warehouse_id, location_id,
    quantity, unit_cost,
    lot_id,
    ref_type, ref_id, note, created_by
  ) VALUES (
    v_tenant, bm.product_id, wh, _location_id,
    _qty_produced,
    CASE WHEN _qty_produced > 0 THEN run_cost / _qty_produced ELSE 0 END,
    v_lot_id,
    'production_receive', _order_id,
    format('Run receive – %s', COALESCE(mo.number, '')), auth.uid()
  )
  RETURNING id INTO v_move_id;

  movement_ids := movement_ids || jsonb_build_array(v_move_id::text);

  -- Update finished item rolling average cost
  IF _qty_produced > 0 AND run_cost > 0 THEN
    UPDATE public.items
    SET    cost       = run_cost / _qty_produced,
           updated_at = now()
    WHERE  id = bm.product_id;
  END IF;

  -- ── Next entry number ─────────────────────────────────────────────────────
  SELECT COALESCE(MAX(entry_number), 0) + 1 INTO entry_no
  FROM   public.production_entries
  WHERE  production_order_id = _order_id
    AND  voided_at IS NULL;

  -- ── Insert production_entries row ─────────────────────────────────────────
  INSERT INTO public.production_entries (
    tenant_id, production_order_id,
    entry_number, entry_date,
    operator_id, qty_produced, qty_scrap,
    warehouse_id, location_id,
    lot_id, lot_number,
    unit_cost, total_cost,
    status, movement_ids, notes, created_by
  ) VALUES (
    v_tenant, _order_id,
    entry_no, CURRENT_DATE,
    auth.uid(), _qty_produced, _qty_scrap,
    wh, _location_id,
    v_lot_id, _lot_number,
    CASE WHEN _qty_produced > 0 THEN run_cost / _qty_produced ELSE 0 END,
    run_cost,
    'Active', movement_ids, _notes, auth.uid()
  )
  RETURNING id INTO entry_id;

  -- ── Update order totals ───────────────────────────────────────────────────
  UPDATE public.production_orders
  SET    qty_produced  = qty_produced + _qty_produced,
         qty_remaining = GREATEST(0, quantity - (qty_produced + _qty_produced)),
         actual_start  = COALESCE(actual_start, now()),  -- set on first run
         updated_at    = now()
  WHERE  id = _order_id;

  -- ── Audit event ──────────────────────────────────────────────────────────
  INSERT INTO public.document_events (
    tenant_id, entity_type, entity_id, status, note, actor_id, actor_email
  )
  SELECT v_tenant, 'production_order', _order_id, mo.status,
         format('Run #%s: produced %s, scrap %s', entry_no, _qty_produced, _qty_scrap),
         auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid());

  RETURN entry_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_production_run(uuid, numeric, numeric, uuid, uuid, text, text)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7.  get_production_summary(_order_id)
--
--     Returns the order header merged with aggregated entry data.
--     Used by the detail page to show progress without a second query.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_production_summary(_order_id uuid)
RETURNS TABLE (
  order_id           uuid,
  number             text,
  status             text,
  quantity           numeric,
  qty_produced       numeric,
  qty_remaining      numeric,
  qty_scrap_total    numeric,
  run_count          integer,
  first_run_at       date,
  last_run_at        date,
  total_cost         numeric,
  completion_pct     numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    mo.id                                          AS order_id,
    mo.number,
    mo.status,
    mo.quantity,
    mo.qty_produced,
    mo.qty_remaining,
    COALESCE(SUM(pe.qty_scrap), 0)::numeric        AS qty_scrap_total,
    COUNT(pe.id)::integer                          AS run_count,
    MIN(pe.entry_date)                             AS first_run_at,
    MAX(pe.entry_date)                             AS last_run_at,
    COALESCE(SUM(pe.total_cost), 0)::numeric       AS total_cost,
    CASE
      WHEN mo.quantity > 0
      THEN ROUND((mo.qty_produced / mo.quantity) * 100, 2)
      ELSE 0
    END                                             AS completion_pct
  FROM   public.production_orders mo
  LEFT   JOIN public.production_entries pe
    ON   pe.production_order_id = mo.id
   AND   pe.voided_at IS NULL
   AND   pe.tenant_id = mo.tenant_id
  WHERE  mo.id        = _order_id
    AND  mo.tenant_id = current_tenant_id()
    AND  mo.deleted_at IS NULL
  GROUP  BY mo.id, mo.number, mo.status, mo.quantity, mo.qty_produced, mo.qty_remaining;
$$;

GRANT EXECUTE ON FUNCTION public.get_production_summary(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8.  Update complete_production_quality_check
--     Now accepts In Progress OR Paused orders (operator submits to QC
--     from either state).
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

  IF mo.status NOT IN ('In Progress', 'Paused') THEN
    RAISE EXCEPTION 'Only In Progress or Paused orders can enter Quality Check (current: %)', mo.status;
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
-- 9.  Update post_production_order_unchecked
--
--     With partial production entries, by the time the order reaches
--     Quality Check most (or all) inventory movements already happened
--     via record_production_run.  This function now:
--
--       a) Verifies status is Quality Check, In Progress, or Released
--       b) Computes the RESIDUAL qty not yet produced via entries
--       c) If residual > 0: consumes remaining components proportionally
--          and receives the residual finished good
--       d) Releases any remaining Active stock_reservations (marks Fulfilled)
--       e) Sets actual_end, status = Completed, posted_at
--       f) Marks BOM used_in_production = true
--       g) Creates WIP journal entries ONLY for the residual cost
--          (entry-based runs have already consumed materials; journals for
--          those are TODO — currently informational only at run level)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_production_order_unchecked(_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  mo                    production_orders;
  bm                    bom_headers;
  wh                    uuid;
  comp                  record;
  residual_qty          numeric;
  total_residual_cost   numeric(14,2) := 0;
  wip_acct              uuid;
  inv_acct              uuid;
  j_id                  uuid;
BEGIN
  SELECT * INTO mo FROM production_orders WHERE id = _order_id AND deleted_at IS NULL;
  IF mo.id IS NULL THEN RAISE EXCEPTION 'Production order not found'; END IF;
  IF mo.tenant_id <> current_tenant_id() AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF mo.posted_at IS NOT NULL THEN RAISE EXCEPTION 'Production order already posted'; END IF;

  IF mo.status NOT IN ('Quality Check', 'In Progress', 'Paused', 'Released') THEN
    RAISE EXCEPTION
      'Production order must be in Quality Check, In Progress, or Paused to post (current: %)',
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

  -- ── Residual qty not yet produced via production_entries ──────────────────
  residual_qty := GREATEST(0, mo.quantity - mo.qty_produced);

  -- ── Only consume components for the residual (if any) ────────────────────
  IF residual_qty > 0 THEN
    FOR comp IN
      SELECT
        eb.item_id,
        SUM(eb.effective_qty) AS effective_qty,
        MAX(eb.unit_cost)     AS unit_cost
      FROM   public.explode_bom(mo.bom_id, residual_qty) eb
      WHERE  eb.is_subassembly = false
      GROUP  BY eb.item_id
    LOOP
      total_residual_cost :=
        total_residual_cost + (comp.effective_qty * comp.unit_cost);

      INSERT INTO stock_movements (
        tenant_id, item_id, warehouse_id, quantity, unit_cost,
        ref_type, ref_id, note, created_by
      ) VALUES (
        mo.tenant_id, comp.item_id, wh,
        -comp.effective_qty, comp.unit_cost,
        'production_consume', mo.id,
        'Final consume – ' || COALESCE(mo.number, ''), auth.uid()
      );
    END LOOP;

    -- Receive residual finished goods
    INSERT INTO stock_movements (
      tenant_id, item_id, warehouse_id, quantity, unit_cost,
      ref_type, ref_id, note, created_by
    ) VALUES (
      mo.tenant_id, bm.product_id, wh, residual_qty,
      CASE WHEN residual_qty > 0 THEN total_residual_cost / residual_qty ELSE 0 END,
      'production_receive', mo.id,
      'Final receive – ' || COALESCE(mo.number, ''), auth.uid()
    );

    IF residual_qty > 0 THEN
      UPDATE items
      SET cost = total_residual_cost / residual_qty
      WHERE id = bm.product_id;
    END IF;
  END IF;

  -- ── Fulfil all remaining active reservations ──────────────────────────────
  UPDATE public.stock_reservations
  SET    status     = 'Fulfilled',
         deleted_at = now(),
         updated_at = now()
  WHERE  tenant_id  = mo.tenant_id
    AND  ref_type   = 'production_order'
    AND  ref_id     = _order_id
    AND  status     = 'Active'
    AND  deleted_at IS NULL;

  -- ── WIP journal for residual cost ──────────────────────────────────────────
  IF total_residual_cost > 0 AND wip_acct IS NOT NULL AND inv_acct IS NOT NULL THEN
    INSERT INTO journal_entries (
      tenant_id, entry_date, memo, source_ref_type, source_ref_id,
      total_debit, total_credit, created_by
    ) VALUES (
      mo.tenant_id, CURRENT_DATE,
      'Consume components (final) – ' || COALESCE(mo.number, ''),
      'production_order', mo.id,
      total_residual_cost, total_residual_cost, auth.uid()
    ) RETURNING id INTO j_id;

    INSERT INTO journal_lines (tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES
      (mo.tenant_id, j_id, wip_acct, total_residual_cost, 0, 'WIP'),
      (mo.tenant_id, j_id, inv_acct, 0, total_residual_cost, 'Inventory – components consumed');

    INSERT INTO journal_entries (
      tenant_id, entry_date, memo, source_ref_type, source_ref_id,
      total_debit, total_credit, created_by
    ) VALUES (
      mo.tenant_id, CURRENT_DATE,
      'Receive finished goods (final) – ' || COALESCE(mo.number, ''),
      'production_order', mo.id,
      total_residual_cost, total_residual_cost, auth.uid()
    ) RETURNING id INTO j_id;

    INSERT INTO journal_lines (tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES
      (mo.tenant_id, j_id, inv_acct, total_residual_cost, 0, 'Inventory – finished goods'),
      (mo.tenant_id, j_id, wip_acct, 0, total_residual_cost, 'WIP cleared');
  END IF;

  -- ── Mark order complete ───────────────────────────────────────────────────
  UPDATE production_orders
  SET    status       = 'Completed',
         qty_produced = quantity,   -- reconcile to planned (final)
         qty_remaining = 0,
         actual_end   = now(),
         posted_at    = now(),
         updated_at   = now()
  WHERE  id = _order_id;

  UPDATE bom_headers
  SET    used_in_production = true, updated_at = now()
  WHERE  id = mo.bom_id AND used_in_production = false;

  INSERT INTO document_events (
    tenant_id, entity_type, entity_id, status, note, actor_id, actor_email
  )
  VALUES (
    mo.tenant_id, 'production_order', mo.id, 'Completed',
    format('Production completed; %s via partial runs + final residual %s',
           mo.qty_produced, residual_qty),
    auth.uid(),
    (SELECT email FROM profiles WHERE id = auth.uid())
  );

  RETURN _order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_production_order_unchecked(uuid)
  FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10.  Update cancel_production_order
--      Also voids any active (non-voided) production_entries
--      and reverses their stock movements via compensating entries.
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
  entry_rec  record;
  mv         record;
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

  -- Release reservations atomically
  rel_count := public.release_production_reservations(_order_id);

  -- Void active production_entries and create compensating stock movements
  FOR entry_rec IN
    SELECT * FROM public.production_entries
    WHERE  production_order_id = _order_id
      AND  tenant_id           = v_tenant
      AND  voided_at           IS NULL
  LOOP
    -- Reverse each stock movement referenced by this entry
    FOR mv IN
      SELECT sm.*
      FROM   public.stock_movements sm
      WHERE  sm.ref_id    = _order_id
        AND  sm.ref_type  IN ('production_consume', 'production_receive')
        AND  sm.tenant_id = v_tenant
        AND  sm.created_at >= entry_rec.created_at - interval '1 second'
        AND  sm.created_at <= entry_rec.created_at + interval '5 minutes'
    LOOP
      -- Compensating movement reverses the sign
      INSERT INTO public.stock_movements (
        tenant_id, item_id, warehouse_id, location_id,
        quantity, unit_cost, ref_type, ref_id, note, created_by
      ) VALUES (
        v_tenant, mv.item_id, mv.warehouse_id, mv.location_id,
        -mv.quantity, mv.unit_cost,
        'production_cancel', _order_id,
        'Cancel reversal of entry #' || entry_rec.entry_number,
        auth.uid()
      );
    END LOOP;

    -- Void the entry
    UPDATE public.production_entries
    SET    status      = 'Voided',
           voided_at   = now(),
           voided_by   = auth.uid(),
           void_reason = 'Order cancelled',
           updated_at  = now()
    WHERE  id = entry_rec.id;
  END LOOP;

  -- Cancel the order
  UPDATE public.production_orders
  SET    status        = 'Cancelled',
         qty_produced  = 0,
         qty_remaining = quantity,
         cancelled_at  = now(),
         cancelled_by  = auth.uid(),
         updated_at    = now()
  WHERE  id = _order_id;

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
-- 11.  Update start_production_order
--      Sets actual_start if not already set.
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

  IF mo.status NOT IN ('Released', 'Material Reserved') THEN
    RAISE EXCEPTION 'Only Released orders can be started (current: %)', mo.status;
  END IF;

  UPDATE public.production_orders
  SET    status       = 'In Progress',
         actual_start = COALESCE(actual_start, now()),
         updated_at   = now()
  WHERE  id = _order_id;

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
-- 12.  Seed allow_overproduction_authorized config key (default false)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.inventory_config (tenant_id, key, value)
SELECT t.id, 'allow_overproduction', 'false'
FROM   public.tenants t
WHERE  t.deleted_at IS NULL
ON CONFLICT (tenant_id, key) DO NOTHING;
