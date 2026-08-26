-- =========================================================
-- Phase 3: Inventory + Manufacturing posting
-- =========================================================

-- 1. bom_lines table (component lines for Bill of Materials)
CREATE TABLE IF NOT EXISTS public.bom_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  bom_id uuid NOT NULL REFERENCES public.bom_headers(id) ON DELETE CASCADE,
  line_no integer NOT NULL DEFAULT 1,
  item_id uuid REFERENCES public.items(id),
  quantity numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bom_lines TO authenticated;
GRANT ALL ON public.bom_lines TO service_role;
ALTER TABLE public.bom_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bom_lines_tenant_read" ON public.bom_lines
  FOR SELECT TO authenticated
  USING (tenant_id = current_tenant_id() OR is_super_admin());

CREATE POLICY "bom_lines_tenant_write" ON public.bom_lines
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

CREATE TRIGGER trg_bom_lines_updated BEFORE UPDATE ON public.bom_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_audit_bom_lines AFTER INSERT OR DELETE OR UPDATE ON public.bom_lines
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- 2. Add posting / warehouse columns
ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);
ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS posted_at timestamptz;
ALTER TABLE public.inventory_adjustments ADD COLUMN IF NOT EXISTS posted_at timestamptz;
ALTER TABLE public.inventory_transfers ADD COLUMN IF NOT EXISTS posted_at timestamptz;

-- 3. Seed WIP (1300) account for existing tenants
INSERT INTO public.chart_of_accounts (tenant_id, code, name, type)
SELECT t.id, '1300', 'Work in Progress', 'Asset'
FROM public.tenants t
WHERE t.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts c
    WHERE c.tenant_id = t.id AND c.code = '1300' AND c.deleted_at IS NULL
  );

-- 4. Update handle_new_user to include WIP account in default chart
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_tenant_id uuid;
  tenant_name text;
  tenant_slug text;
BEGIN
  tenant_name := COALESCE(NEW.raw_user_meta_data->>'company', split_part(NEW.email,'@',1) || '''s Workspace');
  tenant_slug := lower(regexp_replace(tenant_name || '-' || substr(NEW.id::text,1,8),'[^a-z0-9]+','-','g'));

  INSERT INTO public.tenants (name, slug) VALUES (tenant_name, tenant_slug) RETURNING id INTO new_tenant_id;

  INSERT INTO public.profiles (id, tenant_id, email, full_name)
  VALUES (NEW.id, new_tenant_id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  INSERT INTO public.user_roles (user_id, tenant_id, role) VALUES (NEW.id, new_tenant_id, 'tenant_admin');

  INSERT INTO public.chart_of_accounts (tenant_id, code, name, type, created_by) VALUES
    (new_tenant_id,'1000','Cash','Asset',NEW.id),
    (new_tenant_id,'1100','Accounts Receivable','Asset',NEW.id),
    (new_tenant_id,'1200','Inventory','Asset',NEW.id),
    (new_tenant_id,'1300','Work in Progress','Asset',NEW.id),
    (new_tenant_id,'2000','Accounts Payable','Liability',NEW.id),
    (new_tenant_id,'3000','Owner Equity','Equity',NEW.id),
    (new_tenant_id,'4000','Sales Revenue','Income',NEW.id),
    (new_tenant_id,'5000','Cost of Goods Sold','Expense',NEW.id),
    (new_tenant_id,'6000','Operating Expenses','Expense',NEW.id);

  RETURN NEW;
END;
$$;

-- 5. Stock sync trigger: keeps items.stock in sync with stock_movements
CREATE OR REPLACE FUNCTION public.sync_item_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.items
  SET stock = COALESCE(stock, 0) + NEW.quantity
  WHERE id = NEW.item_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_item_stock ON public.stock_movements;
CREATE TRIGGER trg_sync_item_stock AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.sync_item_stock();

-- 6. post_adjustment
CREATE OR REPLACE FUNCTION public.post_adjustment(_adjustment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  adj inventory_adjustments;
  j_id uuid;
  inv_acct uuid;
  exp_acct uuid;
  val numeric(14,2);
BEGIN
  SELECT * INTO adj FROM inventory_adjustments WHERE id = _adjustment_id AND deleted_at IS NULL;
  IF adj.id IS NULL THEN RAISE EXCEPTION 'Adjustment not found'; END IF;
  IF adj.tenant_id <> current_tenant_id() AND NOT is_super_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF adj.posted_at IS NOT NULL THEN RAISE EXCEPTION 'Adjustment already posted'; END IF;

  inv_acct := _account_id(adj.tenant_id, '1200');
  exp_acct := _account_id(adj.tenant_id, '6000');
  val := COALESCE(adj.quantity, 0) * COALESCE((SELECT cost FROM items WHERE id = adj.item_id), 0);

  INSERT INTO stock_movements(tenant_id, item_id, warehouse_id, quantity, unit_cost, ref_type, ref_id, note, created_by)
  VALUES (adj.tenant_id, adj.item_id, adj.warehouse_id, adj.quantity,
          COALESCE((SELECT cost FROM items WHERE id = adj.item_id), 0),
          'adjustment', adj.id, 'Adjustment ' || COALESCE(adj.number,''), auth.uid());

  IF val <> 0 AND inv_acct IS NOT NULL AND exp_acct IS NOT NULL THEN
    INSERT INTO journal_entries(tenant_id, entry_date, memo, source_ref_type, source_ref_id, total_debit, total_credit, created_by)
    VALUES (adj.tenant_id, CURRENT_DATE, 'Adjustment ' || COALESCE(adj.number,''), 'adjustment', adj.id, ABS(val), ABS(val), auth.uid())
    RETURNING id INTO j_id;

    IF val > 0 THEN
      INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
      VALUES (adj.tenant_id, j_id, inv_acct, val, 0, 'Inventory adjustment IN');
      INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
      VALUES (adj.tenant_id, j_id, exp_acct, 0, val, 'Variance');
    ELSE
      INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
      VALUES (adj.tenant_id, j_id, exp_acct, ABS(val), 0, 'Variance');
      INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
      VALUES (adj.tenant_id, j_id, inv_acct, 0, ABS(val), 'Inventory adjustment OUT');
    END IF;
  END IF;

  UPDATE inventory_adjustments SET status = 'Posted', posted_at = now() WHERE id = _adjustment_id;

  INSERT INTO document_events(tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (adj.tenant_id, 'adjustment', adj.id, 'Posted',
          'Stock adjustment posted; inventory updated', auth.uid(),
          (SELECT email FROM profiles WHERE id = auth.uid()));

  RETURN _adjustment_id;
END;
$$;

-- 7. post_transfer
CREATE OR REPLACE FUNCTION public.post_transfer(_transfer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  tr inventory_transfers;
  unit_cost numeric(14,2);
BEGIN
  SELECT * INTO tr FROM inventory_transfers WHERE id = _transfer_id AND deleted_at IS NULL;
  IF tr.id IS NULL THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF tr.tenant_id <> current_tenant_id() AND NOT is_super_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF tr.posted_at IS NOT NULL THEN RAISE EXCEPTION 'Transfer already posted'; END IF;

  unit_cost := COALESCE((SELECT cost FROM items WHERE id = tr.item_id), 0);

  -- Stock OUT from source warehouse
  INSERT INTO stock_movements(tenant_id, item_id, warehouse_id, quantity, unit_cost, ref_type, ref_id, note, created_by)
  VALUES (tr.tenant_id, tr.item_id, tr.from_warehouse_id, -tr.quantity, unit_cost,
          'transfer_out', tr.id, 'Transfer OUT ' || COALESCE(tr.number,''), auth.uid());

  -- Stock IN to destination warehouse
  INSERT INTO stock_movements(tenant_id, item_id, warehouse_id, quantity, unit_cost, ref_type, ref_id, note, created_by)
  VALUES (tr.tenant_id, tr.item_id, tr.to_warehouse_id, tr.quantity, unit_cost,
          'transfer_in', tr.id, 'Transfer IN ' || COALESCE(tr.number,''), auth.uid());

  UPDATE inventory_transfers SET status = 'Completed', posted_at = now() WHERE id = _transfer_id;

  INSERT INTO document_events(tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (tr.tenant_id, 'transfer', tr.id, 'Completed',
          'Stock transferred between warehouses', auth.uid(),
          (SELECT email FROM profiles WHERE id = auth.uid()));

  RETURN _transfer_id;
END;
$$;

-- 8. post_production_order
CREATE OR REPLACE FUNCTION public.post_production_order(_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  mo production_orders;
  bm bom_headers;
  wh uuid;
  comp record;
  component_qty numeric(14,4);
  component_cost numeric(14,2) := 0;
  total_component_cost numeric(14,2) := 0;
  j_id uuid;
  wip_acct uuid;
  inv_acct uuid;
  scale numeric(14,6);
BEGIN
  SELECT * INTO mo FROM production_orders WHERE id = _order_id AND deleted_at IS NULL;
  IF mo.id IS NULL THEN RAISE EXCEPTION 'Production order not found'; END IF;
  IF mo.tenant_id <> current_tenant_id() AND NOT is_super_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF mo.posted_at IS NOT NULL THEN RAISE EXCEPTION 'Production order already posted'; END IF;

  SELECT * INTO bm FROM bom_headers WHERE id = mo.bom_id AND deleted_at IS NULL;
  IF bm.id IS NULL THEN RAISE EXCEPTION 'BOM not found'; END IF;

  wh := mo.warehouse_id;
  IF wh IS NULL THEN
    SELECT id INTO wh FROM warehouses WHERE tenant_id = mo.tenant_id AND deleted_at IS NULL ORDER BY created_at LIMIT 1;
  END IF;

  wip_acct := _account_id(mo.tenant_id, '1300');
  inv_acct := _account_id(mo.tenant_id, '1200');

  -- Scale factor: how many BOM yields to produce
  scale := mo.quantity / COALESCE(NULLIF(bm.yield_qty, 0), 1);

  -- Consume components
  FOR comp IN
    SELECT bl.*, i.cost AS item_cost, i.type AS item_type
    FROM bom_lines bl LEFT JOIN items i ON i.id = bl.item_id
    WHERE bl.bom_id = mo.bom_id AND bl.deleted_at IS NULL AND bl.item_id IS NOT NULL
  LOOP
    component_qty := comp.quantity * scale;
    component_cost := COALESCE(comp.unit_cost, comp.item_cost, 0) * component_qty;
    total_component_cost := total_component_cost + component_cost;

    INSERT INTO stock_movements(tenant_id, item_id, warehouse_id, quantity, unit_cost, ref_type, ref_id, note, created_by)
    VALUES (mo.tenant_id, comp.item_id, wh, -component_qty,
            COALESCE(comp.unit_cost, comp.item_cost, 0),
            'production_consume', mo.id, 'Consume for ' || COALESCE(mo.number,''), auth.uid());
  END LOOP;

  -- Receive finished good
  INSERT INTO stock_movements(tenant_id, item_id, warehouse_id, quantity, unit_cost, ref_type, ref_id, note, created_by)
  VALUES (mo.tenant_id, bm.product_id, wh, mo.quantity,
          CASE WHEN mo.quantity > 0 THEN total_component_cost / mo.quantity ELSE 0 END,
          'production_receive', mo.id, 'Produce ' || COALESCE(mo.number,''), auth.uid());

  -- Update finished item average cost
  IF mo.quantity > 0 THEN
    UPDATE items SET cost = total_component_cost / mo.quantity WHERE id = bm.product_id;
  END IF;

  -- Journal entries (two entries for clean WIP flow)
  IF total_component_cost > 0 AND wip_acct IS NOT NULL AND inv_acct IS NOT NULL THEN
    -- Entry 1: consume components → WIP
    INSERT INTO journal_entries(tenant_id, entry_date, memo, source_ref_type, source_ref_id, total_debit, total_credit, created_by)
    VALUES (mo.tenant_id, CURRENT_DATE, 'Consume components – ' || COALESCE(mo.number,''), 'production_order', mo.id, total_component_cost, total_component_cost, auth.uid())
    RETURNING id INTO j_id;
    INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES (mo.tenant_id, j_id, wip_acct, total_component_cost, 0, 'WIP');
    INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES (mo.tenant_id, j_id, inv_acct, 0, total_component_cost, 'Inventory – components consumed');

    -- Entry 2: receive finished goods ← WIP
    INSERT INTO journal_entries(tenant_id, entry_date, memo, source_ref_type, source_ref_id, total_debit, total_credit, created_by)
    VALUES (mo.tenant_id, CURRENT_DATE, 'Receive finished goods – ' || COALESCE(mo.number,''), 'production_order', mo.id, total_component_cost, total_component_cost, auth.uid())
    RETURNING id INTO j_id;
    INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES (mo.tenant_id, j_id, inv_acct, total_component_cost, 0, 'Inventory – finished goods');
    INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES (mo.tenant_id, j_id, wip_acct, 0, total_component_cost, 'WIP cleared');
  END IF;

  UPDATE production_orders SET status = 'Completed', posted_at = now() WHERE id = _order_id;

  INSERT INTO document_events(tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (mo.tenant_id, 'production_order', mo.id, 'Completed',
          'Production completed; components consumed and finished goods received', auth.uid(),
          (SELECT email FROM profiles WHERE id = auth.uid()));

  RETURN _order_id;
END;
$$;