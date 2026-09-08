-- Manufacturing costing and accounting integration.
-- Material valuation remains sourced from stock_movements.unit_cost. Labour,
-- machine, and overhead are explicit manufacturing cost lines for future and
-- current operational capture; journals use the shared _emit_journal path.

CREATE TABLE IF NOT EXISTS public.production_order_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  cost_type text NOT NULL CHECK (cost_type IN ('material', 'labour', 'machine', 'overhead')),
  description text,
  planned_amount numeric NOT NULL DEFAULT 0 CHECK (planned_amount >= 0),
  actual_amount numeric NOT NULL DEFAULT 0 CHECK (actual_amount >= 0),
  source_ref_type text,
  source_ref_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS production_order_costs_order_idx
  ON public.production_order_costs (tenant_id, production_order_id, cost_type)
  WHERE deleted_at IS NULL;

ALTER TABLE public.production_order_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS production_order_costs_read ON public.production_order_costs;
DROP POLICY IF EXISTS production_order_costs_write ON public.production_order_costs;
CREATE POLICY production_order_costs_read ON public.production_order_costs
  FOR SELECT TO authenticated
  USING (tenant_id = current_tenant_id() AND has_permission('manufacturing.read'));
CREATE POLICY production_order_costs_write ON public.production_order_costs
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id() AND has_permission('manufacturing.update'))
  WITH CHECK (tenant_id = current_tenant_id() AND has_permission('manufacturing.update'));

GRANT SELECT, INSERT, UPDATE ON public.production_order_costs TO authenticated;
GRANT ALL ON public.production_order_costs TO service_role;

CREATE OR REPLACE TRIGGER trg_production_order_costs_updated
  BEFORE UPDATE ON public.production_order_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.record_production_order_cost(
  _order_id uuid,
  _cost_type text,
  _planned_amount numeric DEFAULT 0,
  _actual_amount numeric DEFAULT 0,
  _description text DEFAULT NULL,
  _source_ref_type text DEFAULT NULL,
  _source_ref_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_id uuid;
BEGIN
  IF NOT has_permission('manufacturing.update') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;
  IF _cost_type NOT IN ('material', 'labour', 'machine', 'overhead') THEN
    RAISE EXCEPTION 'Unsupported manufacturing cost type';
  END IF;
  IF _planned_amount < 0 OR _actual_amount < 0 THEN
    RAISE EXCEPTION 'Manufacturing costs cannot be negative';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.production_orders
    WHERE id = _order_id AND tenant_id = v_tenant AND deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'Manufacturing order not found'; END IF;

  INSERT INTO public.production_order_costs (
    tenant_id, production_order_id, cost_type, description,
    planned_amount, actual_amount, source_ref_type, source_ref_id, created_by
  ) VALUES (
    v_tenant, _order_id, _cost_type, _description,
    _planned_amount, _actual_amount, _source_ref_type, _source_ref_id, auth.uid()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_production_order_cost(uuid, text, numeric, numeric, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_production_order_costing(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo production_orders;
  v_tenant uuid := current_tenant_id();
  planned_material numeric := 0;
  actual_material numeric := 0;
  finished_goods numeric := 0;
  v_units numeric := 0;
  v_result jsonb;
BEGIN
  SELECT * INTO mo FROM public.production_orders
  WHERE id = _order_id AND tenant_id = v_tenant AND deleted_at IS NULL;
  IF mo.id IS NULL THEN RAISE EXCEPTION 'Manufacturing order not found or access denied'; END IF;
  IF NOT has_permission('manufacturing.read') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM(line_cost), 0) INTO planned_material
  FROM public.explode_bom(mo.bom_id, mo.quantity)
  WHERE is_subassembly = false;

  SELECT COALESCE(SUM(ABS(quantity) * unit_cost), 0) INTO actual_material
  FROM public.stock_movements
  WHERE tenant_id = v_tenant AND ref_type = 'production_consume' AND ref_id = _order_id;

  SELECT COALESCE(SUM(quantity * unit_cost), 0), COALESCE(SUM(quantity), 0)
  INTO finished_goods, v_units
  FROM public.stock_movements
  WHERE tenant_id = v_tenant AND ref_type = 'production_receive' AND ref_id = _order_id;

  SELECT jsonb_build_object(
    'material', jsonb_build_object(
      'planned', planned_material,
      'actual', actual_material,
      'variance', actual_material - planned_material
    ),
    'labour', jsonb_build_object(
      'planned', COALESCE((SELECT SUM(planned_amount) FROM production_order_costs WHERE production_order_id = _order_id AND cost_type = 'labour' AND deleted_at IS NULL), 0),
      'actual', COALESCE((SELECT SUM(actual_amount) FROM production_order_costs WHERE production_order_id = _order_id AND cost_type = 'labour' AND deleted_at IS NULL), 0)
    ),
    'machine', jsonb_build_object(
      'planned', COALESCE((SELECT SUM(planned_amount) FROM production_order_costs WHERE production_order_id = _order_id AND cost_type = 'machine' AND deleted_at IS NULL), 0),
      'actual', COALESCE((SELECT SUM(actual_amount) FROM production_order_costs WHERE production_order_id = _order_id AND cost_type = 'machine' AND deleted_at IS NULL), 0)
    ),
    'overhead', jsonb_build_object(
      'planned', COALESCE((SELECT SUM(planned_amount) FROM production_order_costs WHERE production_order_id = _order_id AND cost_type = 'overhead' AND deleted_at IS NULL), 0),
      'actual', COALESCE((SELECT SUM(actual_amount) FROM production_order_costs WHERE production_order_id = _order_id AND cost_type = 'overhead' AND deleted_at IS NULL), 0)
    ),
    'finished_goods_cost', finished_goods,
    'units_received', v_units
  ) INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_production_order_costing(uuid) TO authenticated;

-- Emit the material/WIP and WIP/finished-goods journals for each partial run.
-- The trigger is idempotent by production entry id and delegates account,
-- period, balance, and audit handling to the shared accounting emitter.
CREATE OR REPLACE FUNCTION public.emit_production_run_cost_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_material numeric := 0;
  v_finished numeric := 0;
  v_wip uuid;
  v_inventory uuid;
  v_lines jsonb;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE tenant_id = NEW.tenant_id
      AND source_ref_type = 'production_order'
      AND source_ref_id = NEW.production_order_id
      AND memo = 'Production run cost – ' || NEW.id::text
      AND deleted_at IS NULL
  ) THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(ABS(sm.quantity) * sm.unit_cost) FILTER (WHERE sm.quantity < 0), 0),
         COALESCE(SUM(sm.quantity * sm.unit_cost) FILTER (WHERE sm.quantity > 0), 0)
  INTO v_material, v_finished
  FROM public.stock_movements sm
  WHERE sm.tenant_id = NEW.tenant_id
    AND sm.id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(NEW.movement_ids, '[]'::jsonb)));
  IF v_material <= 0 AND v_finished <= 0 THEN RETURN NEW; END IF;

  v_wip := public._cfg_account(NEW.tenant_id, 'wip');
  v_inventory := public._cfg_account(NEW.tenant_id, 'inventory');
  IF v_wip IS NULL OR v_inventory IS NULL THEN
    RAISE EXCEPTION 'Manufacturing posting accounts are not configured';
  END IF;

  IF v_material > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_wip, 'debit', v_material, 'credit', 0, 'memo', 'WIP material cost'),
      jsonb_build_object('account_id', v_inventory, 'debit', 0, 'credit', v_material, 'memo', 'Raw material consumption')
    );
    PERFORM public._emit_journal(NEW.tenant_id, NEW.entry_date, 'Production run cost – ' || NEW.id::text, 'production_order', NEW.production_order_id, v_lines);
  END IF;

  IF v_finished > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_inventory, 'debit', v_finished, 'credit', 0, 'memo', 'Finished goods receipt'),
      jsonb_build_object('account_id', v_wip, 'debit', 0, 'credit', v_finished, 'memo', 'WIP relieved')
    );
    PERFORM public._emit_journal(NEW.tenant_id, NEW.entry_date, 'Production run output – ' || NEW.id::text, 'production_order', NEW.production_order_id, v_lines);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_production_entry_cost_journal ON public.production_entries;
DROP TRIGGER IF EXISTS trg_production_entries_z_cost_journal ON public.production_entries;
CREATE TRIGGER trg_production_entries_z_cost_journal
  AFTER INSERT ON public.production_entries
  FOR EACH ROW EXECUTE FUNCTION public.emit_production_run_cost_journal();
