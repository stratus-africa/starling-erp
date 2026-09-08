-- Production execution hardening:
--   * partial output is an explicit order status;
--   * scrap consumes component material separately from good output;
--   * existing stock_movements and production_entries remain authoritative.

CREATE OR REPLACE FUNCTION public.mark_production_order_partially_completed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.qty_produced > 0
     AND NEW.qty_produced < NEW.quantity
     AND COALESCE(OLD.status, 'Draft') IN ('In Progress', 'Paused') THEN
    NEW.status := 'Partially Completed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_production_order_partial_status ON public.production_orders;
CREATE TRIGGER trg_production_order_partial_status
  BEFORE UPDATE OF qty_produced ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.mark_production_order_partially_completed();

-- The existing run RPC remains the posting engine. This wrapper allows a
-- subsequent run after the partial-status trigger has fired.
ALTER FUNCTION public.record_production_run(uuid, numeric, numeric, uuid, uuid, text, text)
  RENAME TO record_production_run_legacy;

REVOKE EXECUTE ON FUNCTION public.record_production_run_legacy(uuid, numeric, numeric, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_production_run(
  _order_id uuid,
  _qty_produced numeric,
  _qty_scrap numeric DEFAULT 0,
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
  v_tenant uuid := current_tenant_id();
  mo production_orders;
  v_entry uuid;
BEGIN
  SELECT * INTO mo FROM public.production_orders
  WHERE id = _order_id AND tenant_id = v_tenant AND deleted_at IS NULL;
  IF mo.id IS NULL THEN RAISE EXCEPTION 'Production order not found'; END IF;
  IF mo.status = 'Partially Completed' THEN
    UPDATE public.production_orders
    SET status = 'In Progress', updated_at = now()
    WHERE id = _order_id;
  END IF;

  v_entry := public.record_production_run_legacy(
    _order_id, _qty_produced, _qty_scrap, _warehouse_id, _location_id, _lot_number, _notes
  );
  RETURN v_entry;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_production_run(uuid, numeric, numeric, uuid, uuid, text, text)
  TO authenticated;

-- Scrap is consumed from the same component BOM as good output, but receives
-- its own ledger rows and note. The production entry remains the audit record
-- for the scrap quantity; no finished-good stock is created for scrap.
CREATE OR REPLACE FUNCTION public.consume_production_scrap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo production_orders;
  comp record;
  wh uuid;
BEGIN
  IF COALESCE(NEW.qty_scrap, 0) <= 0 THEN RETURN NEW; END IF;

  SELECT * INTO mo FROM public.production_orders
  WHERE id = NEW.production_order_id AND tenant_id = NEW.tenant_id AND deleted_at IS NULL;
  IF mo.id IS NULL OR mo.bom_id IS NULL THEN RETURN NEW; END IF;
  wh := COALESCE(NEW.warehouse_id, mo.warehouse_id);

  FOR comp IN
    SELECT eb.item_id, SUM(eb.effective_qty) AS effective_qty, MAX(eb.unit_cost) AS unit_cost
    FROM public.explode_bom(mo.bom_id, NEW.qty_scrap) eb
    WHERE eb.is_subassembly = false
    GROUP BY eb.item_id
  LOOP
    INSERT INTO public.stock_movements (
      tenant_id, item_id, warehouse_id, location_id, quantity, unit_cost,
      ref_type, ref_id, note, created_by
    ) VALUES (
      NEW.tenant_id, comp.item_id, wh, NEW.location_id, -comp.effective_qty,
      comp.unit_cost, 'production_consume', NEW.production_order_id,
      format('Scrap consume – run #%s', NEW.entry_number), NEW.created_by
    );

    UPDATE public.stock_reservations
    SET quantity = GREATEST(0, quantity - comp.effective_qty), updated_at = now()
    WHERE tenant_id = NEW.tenant_id
      AND ref_type = 'production_order'
      AND ref_id = NEW.production_order_id
      AND item_id = comp.item_id
      AND status = 'Active'
      AND deleted_at IS NULL;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_production_entries_scrap ON public.production_entries;
CREATE TRIGGER trg_production_entries_scrap
  AFTER INSERT ON public.production_entries
  FOR EACH ROW EXECUTE FUNCTION public.consume_production_scrap();

-- Allow partially completed orders to be paused and submitted to QC.
CREATE OR REPLACE FUNCTION public.pause_production_order(
  _order_id uuid,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  mo production_orders;
BEGIN
  IF NOT has_permission('manufacturing.update') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO mo FROM public.production_orders
  WHERE id = _order_id AND tenant_id = v_tenant AND deleted_at IS NULL;
  IF mo.id IS NULL THEN RAISE EXCEPTION 'Production order not found'; END IF;
  IF mo.status NOT IN ('In Progress', 'Partially Completed') THEN
    RAISE EXCEPTION 'Only active production orders can be paused (current: %)', mo.status;
  END IF;

  UPDATE public.production_orders
  SET status = 'Paused', paused_at = now(), paused_by = auth.uid(),
      pause_reason = _reason, updated_at = now()
  WHERE id = _order_id;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (v_tenant, 'production_order', _order_id, 'Paused',
          COALESCE('Paused: ' || _reason, 'Production paused'), auth.uid(),
          (SELECT email FROM public.profiles WHERE id = auth.uid()));
END;
$$;

GRANT EXECUTE ON FUNCTION public.pause_production_order(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_production_quality_check(
  _order_id uuid,
  _notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  mo production_orders;
BEGIN
  IF NOT has_permission('manufacturing.update') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO mo FROM public.production_orders
  WHERE id = _order_id AND tenant_id = v_tenant AND deleted_at IS NULL;
  IF mo.id IS NULL THEN RAISE EXCEPTION 'Production order not found'; END IF;
  IF mo.status NOT IN ('In Progress', 'Paused', 'Partially Completed') THEN
    RAISE EXCEPTION 'Only active production orders can enter Quality Check (current: %)', mo.status;
  END IF;

  UPDATE public.production_orders
  SET status = 'Quality Check', quality_check_at = now(), quality_check_by = auth.uid(),
      quality_notes = COALESCE(_notes, quality_notes), updated_at = now()
  WHERE id = _order_id;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (v_tenant, 'production_order', _order_id, 'Quality Check',
          COALESCE('QC: ' || _notes, 'Production entered quality check'), auth.uid(),
          (SELECT email FROM public.profiles WHERE id = auth.uid()));
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_production_quality_check(uuid, text) TO authenticated;
