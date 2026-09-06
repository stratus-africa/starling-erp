-- =========================================================
-- Batch / Lot & Serial Number Traceability
--
-- Three tracking modes (per item.inventory_tracking flags):
--   track_batches = true  → use item_lots
--   track_serials = true  → use item_serials
--   both false            → no lot/serial capture required
--
-- Architecture:
--   item_lots    – lot/batch master record with expiry, qty, status
--   item_serials – individual serial number records
--
-- Additive-only changes to existing tables:
--   stock_movements.lot_id       → which lot this movement belongs to
--   stock_movements.serial_id    → which serial this movement belongs to
--   inventory_adjustments.lot_id
--   inventory_adjustments.serial_id
--   inventory_transfers.lot_id
--   inventory_transfers.serial_id
--
-- Enforcement:
--   Serial uniqueness per item (DB unique index)
--   Serial status gate: only 'In Stock' serials can be issued
--   FEFO enforcement: optional via RPC; client respects expiry order
--   No duplicate lot numbers per item (unique index)
--
-- RLS:
--   All new tables use current_tenant_id() pattern
-- =========================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  item_lots  — Lot / Batch master
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.item_lots (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id            uuid        NOT NULL REFERENCES public.items(id)   ON DELETE CASCADE,

  -- Lot identity
  lot_number         text        NOT NULL,
  supplier_lot_ref   text,                       -- external / supplier-assigned lot ref
  status             text        NOT NULL DEFAULT 'Active',
  -- status: Active | Quarantine | Released | Expired | Consumed | Recalled

  -- Dates
  manufactured_date  date,
  expiry_date        date,
  received_date      date,

  -- Source traceability
  source_ref_type    text,                       -- 'bill' | 'production_order' | 'adjustment' | 'opening'
  source_ref_id      uuid,                       -- FK to the source document

  -- Location at receipt
  warehouse_id       uuid        REFERENCES public.warehouses(id)          ON DELETE SET NULL,
  location_id        uuid        REFERENCES public.warehouse_locations(id)  ON DELETE SET NULL,

  -- Quantity tracking
  initial_qty        numeric     NOT NULL DEFAULT 0,
  -- on-hand quantity derived from stock_movements filtered by lot_id — do NOT store here as a cache

  -- Notes
  notes              text,
  certificate_ref    text,                       -- CoA / CoC reference number

  -- Audit
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid,
  deleted_at         timestamptz
);

-- Unique lot number per item (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS item_lots_item_lot_number_key
  ON public.item_lots (tenant_id, item_id, lower(lot_number))
  WHERE deleted_at IS NULL;

-- Fast lookups
CREATE INDEX IF NOT EXISTS item_lots_item_id_idx    ON public.item_lots (item_id)    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS item_lots_expiry_idx     ON public.item_lots (expiry_date) WHERE deleted_at IS NULL AND expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS item_lots_status_idx     ON public.item_lots (tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS item_lots_source_ref_idx ON public.item_lots (source_ref_id)     WHERE source_ref_id IS NOT NULL;

ALTER TABLE public.item_lots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "item_lots tenant access" ON public.item_lots;
CREATE POLICY "item_lots tenant access" ON public.item_lots
  FOR ALL TO authenticated
  USING  (tenant_id = public.current_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_lots TO authenticated;
GRANT ALL ON public.item_lots TO service_role;

CREATE OR REPLACE TRIGGER trg_item_lots_updated
  BEFORE UPDATE ON public.item_lots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  item_serials  — Individual serial number records
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.item_serials (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id            uuid        NOT NULL REFERENCES public.items(id)   ON DELETE CASCADE,

  -- Serial identity
  serial_number      text        NOT NULL,
  lot_id             uuid        REFERENCES public.item_lots(id)  ON DELETE SET NULL,
  -- A serial can optionally belong to a lot (e.g. serialised items from a batch)

  -- Status lifecycle:
  -- Pending → In Stock → Reserved → Sold / Consumed / Transferred → Returned / Scrapped
  status             text        NOT NULL DEFAULT 'In Stock',

  -- Location (current)
  warehouse_id       uuid        REFERENCES public.warehouses(id)          ON DELETE SET NULL,
  location_id        uuid        REFERENCES public.warehouse_locations(id)  ON DELETE SET NULL,

  -- Source traceability
  received_from_ref_type  text,          -- 'bill' | 'production_order' | 'adjustment' | 'opening'
  received_from_ref_id    uuid,
  production_order_id     uuid        REFERENCES public.production_orders(id) ON DELETE SET NULL,

  -- Sold/issued traceability
  issued_to_ref_type      text,          -- 'invoice' | 'shipment' | 'transfer'
  issued_to_ref_id        uuid,
  customer_id             uuid        REFERENCES public.customers(id)  ON DELETE SET NULL,

  -- Warranty
  warranty_months    integer,
  warranty_start     date,
  warranty_end       date       GENERATED ALWAYS AS (
                                  CASE
                                    WHEN warranty_start IS NOT NULL AND warranty_months IS NOT NULL
                                    THEN (warranty_start + (warranty_months || ' months')::interval)::date
                                    ELSE NULL
                                  END
                                ) STORED,

  -- Dates
  manufactured_date  date,
  received_date      date,

  notes              text,

  -- Audit
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid,
  deleted_at         timestamptz
);

-- Unique serial per item (prevents duplicate serials for the same item)
CREATE UNIQUE INDEX IF NOT EXISTS item_serials_item_serial_key
  ON public.item_serials (tenant_id, item_id, lower(serial_number))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS item_serials_item_id_idx     ON public.item_serials (item_id)          WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS item_serials_lot_id_idx      ON public.item_serials (lot_id)           WHERE lot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS item_serials_status_idx      ON public.item_serials (tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS item_serials_warehouse_idx   ON public.item_serials (warehouse_id)     WHERE warehouse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS item_serials_customer_idx    ON public.item_serials (customer_id)      WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS item_serials_production_idx  ON public.item_serials (production_order_id) WHERE production_order_id IS NOT NULL;

ALTER TABLE public.item_serials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "item_serials tenant access" ON public.item_serials;
CREATE POLICY "item_serials tenant access" ON public.item_serials
  FOR ALL TO authenticated
  USING  (tenant_id = public.current_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_serials TO authenticated;
GRANT ALL ON public.item_serials TO service_role;

CREATE OR REPLACE TRIGGER trg_item_serials_updated
  BEFORE UPDATE ON public.item_serials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.  Extend stock_movements with lot / serial references
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS lot_id    uuid REFERENCES public.item_lots(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS serial_id uuid REFERENCES public.item_serials(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS stock_movements_lot_id_idx    ON public.stock_movements (lot_id)    WHERE lot_id    IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movements_serial_id_idx ON public.stock_movements (serial_id) WHERE serial_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.  Extend inventory_adjustments & inventory_transfers
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.inventory_adjustments
  ADD COLUMN IF NOT EXISTS lot_id    uuid REFERENCES public.item_lots(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS serial_id uuid REFERENCES public.item_serials(id) ON DELETE SET NULL;

ALTER TABLE public.inventory_transfers
  ADD COLUMN IF NOT EXISTS lot_id    uuid REFERENCES public.item_lots(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS serial_id uuid REFERENCES public.item_serials(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.  Rebuild inventory_location_stock with lot dimension
--     GROUP BY now includes lot_id so per-lot on-hand is visible
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.inventory_location_stock;

CREATE OR REPLACE VIEW public.inventory_location_stock
WITH (security_invoker = on) AS
SELECT
  sm.tenant_id,
  sm.item_id,
  i.sku,
  i.name      AS item_name,
  i.uom,
  sm.warehouse_id,
  w.code      AS warehouse_code,
  w.name      AS warehouse_name,
  sm.location_id,
  wl.code     AS location_code,
  wl.name     AS location_name,
  wl.aisle,
  wl.rack,
  wl.level,
  wl.bin,
  wl.location_type,
  wl.zone_id,
  wz.code     AS zone_code,
  wz.name     AS zone_name,
  wz.zone_type,
  -- Lot dimension
  sm.lot_id,
  il.lot_number,
  il.expiry_date,
  il.status   AS lot_status,
  SUM(sm.quantity)::numeric AS on_hand
FROM public.stock_movements sm
JOIN  public.items              i   ON i.id   = sm.item_id
JOIN  public.warehouses         w   ON w.id   = sm.warehouse_id
LEFT JOIN public.warehouse_locations  wl  ON wl.id  = sm.location_id
LEFT JOIN public.warehouse_zones      wz  ON wz.id  = wl.zone_id
LEFT JOIN public.item_lots            il  ON il.id   = sm.lot_id
WHERE i.deleted_at IS NULL
  AND w.deleted_at IS NULL
GROUP BY
  sm.tenant_id, sm.item_id, i.sku, i.name, i.uom,
  sm.warehouse_id, w.code, w.name,
  sm.location_id, wl.code, wl.name, wl.aisle, wl.rack, wl.level, wl.bin,
  wl.location_type, wl.zone_id, wz.code, wz.name, wz.zone_type,
  sm.lot_id, il.lot_number, il.expiry_date, il.status;

GRANT SELECT ON public.inventory_location_stock TO authenticated;
GRANT ALL    ON public.inventory_location_stock TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6.  Per-lot stock view (convenient for lot availability checks)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.inventory_lot_stock
WITH (security_invoker = on) AS
SELECT
  sm.tenant_id,
  sm.item_id,
  i.sku,
  i.name      AS item_name,
  i.uom,
  sm.lot_id,
  il.lot_number,
  il.expiry_date,
  il.manufactured_date,
  il.supplier_lot_ref,
  il.status   AS lot_status,
  il.certificate_ref,
  sm.warehouse_id,
  w.name      AS warehouse_name,
  SUM(sm.quantity)::numeric AS on_hand
FROM public.stock_movements sm
JOIN  public.items      i  ON i.id = sm.item_id
JOIN  public.warehouses w  ON w.id = sm.warehouse_id
JOIN  public.item_lots  il ON il.id = sm.lot_id
WHERE i.deleted_at IS NULL
  AND w.deleted_at IS NULL
  AND il.deleted_at IS NULL
GROUP BY
  sm.tenant_id, sm.item_id, i.sku, i.name, i.uom,
  sm.lot_id, il.lot_number, il.expiry_date, il.manufactured_date,
  il.supplier_lot_ref, il.status, il.certificate_ref,
  sm.warehouse_id, w.name;

GRANT SELECT ON public.inventory_lot_stock TO authenticated;
GRANT ALL    ON public.inventory_lot_stock TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7.  Enforcement trigger: serial status gate
--     Prevents issuing a serial that is not 'In Stock'
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_serial_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_serial  item_serials;
  v_item    items;
BEGIN
  -- Only enforce on outbound movements (quantity < 0) with a serial
  IF NEW.serial_id IS NULL OR NEW.quantity >= 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_serial FROM item_serials WHERE id = NEW.serial_id;
  SELECT * INTO v_item   FROM items          WHERE id = NEW.item_id;

  IF v_serial.id IS NULL THEN
    RAISE EXCEPTION 'Serial not found: %', NEW.serial_id;
  END IF;

  IF v_item.track_serials = false THEN
    RETURN NEW;  -- item doesn't enforce serial tracking
  END IF;

  IF v_serial.status NOT IN ('In Stock', 'Reserved') THEN
    RAISE EXCEPTION 'Serial % is % and cannot be issued (must be In Stock or Reserved)',
      v_serial.serial_number, v_serial.status
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_serial_availability ON public.stock_movements;
CREATE TRIGGER trg_enforce_serial_availability
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_serial_availability();

-- ─────────────────────────────────────────────────────────────────────────────
-- 8.  Enforcement trigger: lot availability & FEFO guard
--     Prevents issuing from an expired lot when enforce_fefo is set
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_lot_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lot     item_lots;
  v_item    items;
  v_fefo    boolean := false;
  v_config  text;
BEGIN
  IF NEW.lot_id IS NULL OR NEW.quantity >= 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_lot  FROM item_lots WHERE id = NEW.lot_id;
  SELECT * INTO v_item FROM items     WHERE id = NEW.item_id;

  IF v_lot.id IS NULL THEN
    RAISE EXCEPTION 'Lot not found: %', NEW.lot_id;
  END IF;

  IF v_item.track_batches = false THEN
    RETURN NEW;
  END IF;

  -- Block issue from Quarantine or Recalled lots
  IF v_lot.status IN ('Quarantine', 'Recalled') THEN
    RAISE EXCEPTION 'Lot % has status % and cannot be issued',
      v_lot.lot_number, v_lot.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Check per-tenant FEFO enforcement config
  SELECT ic.value INTO v_config
  FROM inventory_config ic
  WHERE ic.tenant_id = NEW.tenant_id AND ic.key = 'enforce_fefo';

  v_fefo := COALESCE(v_config, 'false') = 'true';

  IF v_fefo
     AND v_lot.expiry_date IS NOT NULL
     AND v_lot.expiry_date < CURRENT_DATE
  THEN
    RAISE EXCEPTION 'FEFO violation: lot % (expiry %) is past its expiry date',
      v_lot.lot_number, v_lot.expiry_date
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_lot_availability ON public.stock_movements;
CREATE TRIGGER trg_enforce_lot_availability
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_lot_availability();

-- ─────────────────────────────────────────────────────────────────────────────
-- 9.  Update post_adjustment_unchecked to propagate lot/serial
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_adjustment_unchecked(_adjustment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  adj       record;
  inv_acct  uuid;
  var_acct  uuid;
  val       numeric(14,2);
BEGIN
  SELECT * INTO adj FROM public.inventory_adjustments
  WHERE id = _adjustment_id AND deleted_at IS NULL;
  IF adj.id IS NULL THEN RAISE EXCEPTION 'Adjustment not found'; END IF;

  inv_acct := public._account_id(adj.tenant_id, '1200');
  var_acct := public._account_id(adj.tenant_id, '6000');

  val := ROUND(
    COALESCE(adj.quantity, 0) *
    COALESCE((SELECT cost FROM public.items WHERE id = adj.item_id), 0),
    2
  );

  -- Stock movement — now carries lot_id and serial_id from the adjustment
  INSERT INTO public.stock_movements (
    tenant_id, item_id, warehouse_id, location_id,
    lot_id, serial_id,
    quantity, unit_cost,
    ref_type, ref_id, note, created_by
  )
  SELECT adj.tenant_id, adj.item_id, adj.warehouse_id, adj.location_id,
         adj.lot_id, adj.serial_id,
         adj.quantity, COALESCE(i.cost, 0),
         'adjustment', adj.id,
         'Adjustment ' || COALESCE(adj.number, ''), auth.uid()
  FROM public.items i WHERE i.id = adj.item_id;

  -- Update serial status when an adjustment issues a serial OUT
  IF adj.serial_id IS NOT NULL AND adj.quantity < 0 THEN
    UPDATE public.item_serials
    SET status = 'Sold',
        issued_to_ref_type = 'adjustment',
        issued_to_ref_id   = adj.id,
        updated_at         = now()
    WHERE id = adj.serial_id;
  END IF;

  -- Update serial location and status when an adjustment brings IN a serial
  IF adj.serial_id IS NOT NULL AND adj.quantity > 0 THEN
    UPDATE public.item_serials
    SET status       = 'In Stock',
        warehouse_id = adj.warehouse_id,
        location_id  = adj.location_id,
        updated_at   = now()
    WHERE id = adj.serial_id;
  END IF;

  -- Journal
  IF val <> 0 AND inv_acct IS NOT NULL AND var_acct IS NOT NULL THEN
    IF val > 0 THEN
      PERFORM public._emit_journal(
        adj.tenant_id, adj.date::date,
        'Adjustment ' || COALESCE(adj.number, ''), 'adjustment', adj.id,
        jsonb_build_array(
          jsonb_build_object('account_id', inv_acct, 'debit',  val, 'credit', 0,   'memo', 'Inventory IN'),
          jsonb_build_object('account_id', var_acct, 'debit',  0,   'credit', val, 'memo', 'Inventory variance CR')
        )
      );
    ELSE
      PERFORM public._emit_journal(
        adj.tenant_id, adj.date::date,
        'Adjustment ' || COALESCE(adj.number, ''), 'adjustment', adj.id,
        jsonb_build_array(
          jsonb_build_object('account_id', var_acct, 'debit',  ABS(val), 'credit', 0,        'memo', 'Inventory variance DR'),
          jsonb_build_object('account_id', inv_acct, 'debit',  0,        'credit', ABS(val), 'memo', 'Inventory OUT')
        )
      );
    END IF;
  END IF;

  UPDATE public.inventory_adjustments
  SET status = 'Posted', posted_at = now()
  WHERE id = _adjustment_id;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (adj.tenant_id, 'adjustment', adj.id, 'Posted',
          'Inventory adjustment posted', auth.uid(),
          (SELECT email FROM public.profiles WHERE id = auth.uid()));

  RETURN _adjustment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_adjustment_unchecked(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Update post_transfer_unchecked to propagate lot/serial
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_transfer_unchecked(_transfer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  tr        record;
  unit_cost numeric(14,2);
BEGIN
  SELECT * INTO tr FROM public.inventory_transfers
  WHERE id = _transfer_id AND deleted_at IS NULL;
  IF tr.id IS NULL THEN RAISE EXCEPTION 'Transfer not found'; END IF;

  unit_cost := COALESCE((SELECT cost FROM public.items WHERE id = tr.item_id), 0);

  -- Stock OUT from source warehouse/location
  INSERT INTO public.stock_movements (
    tenant_id, item_id,
    warehouse_id, location_id,
    lot_id, serial_id,
    quantity, unit_cost,
    ref_type, ref_id, note, created_by
  ) VALUES (
    tr.tenant_id, tr.item_id,
    tr.from_warehouse_id, tr.from_location_id,
    tr.lot_id, tr.serial_id,
    -tr.quantity, unit_cost,
    'transfer_out', tr.id,
    'Transfer OUT ' || COALESCE(tr.number, ''),
    auth.uid()
  );

  -- Stock IN to destination warehouse/location
  INSERT INTO public.stock_movements (
    tenant_id, item_id,
    warehouse_id, location_id,
    lot_id, serial_id,
    quantity, unit_cost,
    ref_type, ref_id, note, created_by
  ) VALUES (
    tr.tenant_id, tr.item_id,
    tr.to_warehouse_id, tr.to_location_id,
    tr.lot_id, tr.serial_id,
    tr.quantity, unit_cost,
    'transfer_in', tr.id,
    'Transfer IN ' || COALESCE(tr.number, ''),
    auth.uid()
  );

  -- Update serial location when transferred
  IF tr.serial_id IS NOT NULL THEN
    UPDATE public.item_serials
    SET warehouse_id = tr.to_warehouse_id,
        location_id  = tr.to_location_id,
        status       = 'In Stock',
        updated_at   = now()
    WHERE id = tr.serial_id;
  END IF;

  UPDATE public.inventory_transfers
  SET status = 'Completed', posted_at = now()
  WHERE id = _transfer_id;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (tr.tenant_id, 'transfer', tr.id, 'Completed',
          'Stock transferred between warehouses', auth.uid(),
          (SELECT email FROM public.profiles WHERE id = auth.uid()));

  RETURN _transfer_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_transfer_unchecked(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. get_lot_traceability(_lot_id) — full forward/backward traceability chain
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_lot_traceability(_lot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := public.current_tenant_id();
  v_lot    item_lots;
BEGIN
  SELECT * INTO v_lot FROM item_lots
  WHERE id = _lot_id AND tenant_id = v_tenant AND deleted_at IS NULL;

  IF v_lot.id IS NULL THEN
    RAISE EXCEPTION 'Lot not found or access denied';
  END IF;

  RETURN jsonb_build_object(
    'lot', row_to_json(v_lot),

    -- On-hand by warehouse for this lot
    'stock', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'warehouse_id',   sm.warehouse_id,
          'warehouse_name', w.name,
          'location_id',    sm.location_id,
          'location_code',  wl.code,
          'on_hand',        SUM(sm.quantity)
        )
        ORDER BY w.name
      ), '[]'::jsonb)
      FROM stock_movements sm
      LEFT JOIN warehouses          w   ON w.id  = sm.warehouse_id
      LEFT JOIN warehouse_locations wl  ON wl.id = sm.location_id
      WHERE sm.lot_id    = _lot_id
        AND sm.tenant_id = v_tenant
      GROUP BY sm.warehouse_id, w.name, sm.location_id, wl.code
    ),

    -- All movements touching this lot
    'movements', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',           sm.id,
          'created_at',   sm.created_at,
          'ref_type',     sm.ref_type,
          'ref_id',       sm.ref_id,
          'quantity',     sm.quantity,
          'unit_cost',    sm.unit_cost,
          'warehouse',    w.name,
          'location',     wl.code,
          'note',         sm.note
        )
        ORDER BY sm.created_at
      ), '[]'::jsonb)
      FROM stock_movements sm
      LEFT JOIN warehouses          w   ON w.id  = sm.warehouse_id
      LEFT JOIN warehouse_locations wl  ON wl.id = sm.location_id
      WHERE sm.lot_id    = _lot_id
        AND sm.tenant_id = v_tenant
    ),

    -- Serials in this lot
    'serials', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',            s.id,
          'serial_number', s.serial_number,
          'status',        s.status,
          'warehouse',     w.name,
          'location',      wl.code,
          'customer_id',   s.customer_id,
          'warranty_end',  s.warranty_end
        )
        ORDER BY s.serial_number
      ), '[]'::jsonb)
      FROM item_serials s
      LEFT JOIN warehouses          w   ON w.id  = s.warehouse_id
      LEFT JOIN warehouse_locations wl  ON wl.id = s.location_id
      WHERE s.lot_id    = _lot_id
        AND s.tenant_id = v_tenant
        AND s.deleted_at IS NULL
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_lot_traceability(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. get_serial_traceability(_serial_id) — full serial chain
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_serial_traceability(_serial_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := public.current_tenant_id();
  v_serial item_serials;
BEGIN
  SELECT * INTO v_serial FROM item_serials
  WHERE id = _serial_id AND tenant_id = v_tenant AND deleted_at IS NULL;

  IF v_serial.id IS NULL THEN
    RAISE EXCEPTION 'Serial not found or access denied';
  END IF;

  RETURN jsonb_build_object(
    'serial', row_to_json(v_serial),

    -- Item info
    'item', (
      SELECT jsonb_build_object(
        'id', i.id, 'name', i.name, 'sku', i.sku, 'uom', i.uom
      )
      FROM items i WHERE i.id = v_serial.item_id
    ),

    -- Lot info (if serial belongs to a lot)
    'lot', (
      SELECT CASE WHEN v_serial.lot_id IS NOT NULL THEN
        jsonb_build_object(
          'id', il.id, 'lot_number', il.lot_number,
          'expiry_date', il.expiry_date, 'status', il.status
        )
      ELSE NULL END
      FROM item_lots il WHERE il.id = v_serial.lot_id
    ),

    -- All movements for this serial
    'movements', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',        sm.id,
          'created_at', sm.created_at,
          'ref_type',  sm.ref_type,
          'ref_id',    sm.ref_id,
          'quantity',  sm.quantity,
          'warehouse', w.name,
          'location',  wl.code,
          'note',      sm.note
        )
        ORDER BY sm.created_at
      ), '[]'::jsonb)
      FROM stock_movements sm
      LEFT JOIN warehouses          w   ON w.id  = sm.warehouse_id
      LEFT JOIN warehouse_locations wl  ON wl.id = sm.location_id
      WHERE sm.serial_id = _serial_id
        AND sm.tenant_id = v_tenant
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_serial_traceability(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. RPC: get_available_lots(_item_id, _warehouse_id?)
--     Returns lots with positive on-hand, sorted by FEFO (expiry ASC NULLS LAST)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_available_lots(
  _item_id      uuid,
  _warehouse_id uuid DEFAULT NULL
)
RETURNS TABLE (
  lot_id         uuid,
  lot_number     text,
  expiry_date    date,
  status         text,
  supplier_lot_ref text,
  on_hand        numeric,
  warehouse_id   uuid,
  warehouse_name text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    il.id         AS lot_id,
    il.lot_number,
    il.expiry_date,
    il.status,
    il.supplier_lot_ref,
    SUM(sm.quantity)::numeric AS on_hand,
    sm.warehouse_id,
    w.name        AS warehouse_name
  FROM item_lots  il
  JOIN stock_movements sm ON sm.lot_id = il.id AND sm.tenant_id = il.tenant_id
  JOIN warehouses       w  ON w.id = sm.warehouse_id
  WHERE il.item_id    = _item_id
    AND il.tenant_id  = current_tenant_id()
    AND il.deleted_at IS NULL
    AND il.status NOT IN ('Quarantine', 'Recalled', 'Consumed')
    AND (_warehouse_id IS NULL OR sm.warehouse_id = _warehouse_id)
  GROUP BY il.id, il.lot_number, il.expiry_date, il.status,
           il.supplier_lot_ref, sm.warehouse_id, w.name
  HAVING SUM(sm.quantity) > 0
  ORDER BY il.expiry_date ASC NULLS LAST, il.lot_number ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_available_lots(uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. RPC: get_available_serials(_item_id, _warehouse_id?)
--     Returns serials that are 'In Stock' for an item
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_available_serials(
  _item_id      uuid,
  _warehouse_id uuid DEFAULT NULL
)
RETURNS TABLE (
  serial_id      uuid,
  serial_number  text,
  lot_number     text,
  status         text,
  warehouse_id   uuid,
  warehouse_name text,
  location_code  text,
  warranty_end   date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    s.id          AS serial_id,
    s.serial_number,
    il.lot_number,
    s.status,
    s.warehouse_id,
    w.name        AS warehouse_name,
    wl.code       AS location_code,
    s.warranty_end
  FROM item_serials          s
  LEFT JOIN item_lots            il  ON il.id  = s.lot_id
  LEFT JOIN warehouses           w   ON w.id   = s.warehouse_id
  LEFT JOIN warehouse_locations  wl  ON wl.id  = s.location_id
  WHERE s.item_id    = _item_id
    AND s.tenant_id  = current_tenant_id()
    AND s.deleted_at IS NULL
    AND s.status     = 'In Stock'
    AND (_warehouse_id IS NULL OR s.warehouse_id = _warehouse_id)
  ORDER BY s.serial_number ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_available_serials(uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. Seed enforce_fefo = false config for existing tenants
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.inventory_config (tenant_id, key, value)
SELECT t.id, 'enforce_fefo', 'false'
FROM public.tenants t
WHERE t.deleted_at IS NULL
ON CONFLICT (tenant_id, key) DO NOTHING;
