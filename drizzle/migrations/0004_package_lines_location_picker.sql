ALTER TABLE public.package_lines
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.warehouse_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS package_lines_location_idx ON public.package_lines(location_id);

CREATE OR REPLACE FUNCTION public.create_package_from_sales_order(_sales_order_id uuid, _warehouse_id uuid, _lines jsonb, _weight numeric DEFAULT 0, _length numeric DEFAULT NULL::numeric, _width numeric DEFAULT NULL::numeric, _height numeric DEFAULT NULL::numeric, _notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_order sales_orders;
  v_pkg uuid;
  v_item jsonb;
  v_line sales_order_lines;
  v_qty numeric;
  v_prev numeric;
  v_number text;
  v_loc uuid;
  v_onhand numeric;
BEGIN
  IF NOT has_permission('sales.create') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized to create packages' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_order FROM public.sales_orders
  WHERE id = _sales_order_id AND tenant_id = v_tenant AND deleted_at IS NULL
    AND status NOT IN ('Cancelled','Completed') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales order is not eligible for packing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = _warehouse_id AND tenant_id = v_tenant AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Warehouse not found or access denied';
  END IF;

  v_number := 'PKG-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('public.package_number_seq')::text, 6, '0');
  INSERT INTO public.packages (
    tenant_id, number, sales_order_id, customer_id, warehouse_id, date, weight,
    notes, status, packing_status, shipment_status, created_by
  ) VALUES (
    v_tenant, v_number, _sales_order_id, v_order.customer_id, _warehouse_id, CURRENT_DATE,
    COALESCE(_weight, 0), _notes, 'Draft', 'Draft', 'Not Shipped', auth.uid()
  ) RETURNING id INTO v_pkg;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(_lines, '[]'::jsonb)) LOOP
    SELECT * INTO v_line FROM public.sales_order_lines
    WHERE id = (v_item->>'sales_order_line_id')::uuid AND document_id = _sales_order_id
      AND tenant_id = v_tenant AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sales Order line does not belong to this order'; END IF;
    v_qty := (v_item->>'quantity')::numeric;
    SELECT COALESCE(SUM(pl.quantity), 0) INTO v_prev
    FROM public.package_lines pl JOIN public.packages p ON p.id = pl.document_id
    WHERE p.sales_order_id = _sales_order_id AND p.tenant_id = v_tenant
      AND p.status <> 'Cancelled' AND p.deleted_at IS NULL AND pl.item_id = v_line.item_id AND pl.deleted_at IS NULL;
    IF v_qty IS NULL OR v_qty <= 0 OR v_prev + v_qty > v_line.quantity THEN
      RAISE EXCEPTION 'Selected quantity exceeds the remaining Sales Order quantity for %', COALESCE(v_line.description, v_line.item_id::text);
    END IF;

    v_loc := NULLIF(v_item->>'location_id','')::uuid;
    IF v_loc IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.warehouse_locations wl
        WHERE wl.id = v_loc AND wl.tenant_id = v_tenant AND wl.warehouse_id = _warehouse_id AND wl.deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'Selected stock location does not belong to this warehouse';
      END IF;
      SELECT COALESCE(SUM(sm.quantity), 0) INTO v_onhand
      FROM public.stock_movements sm
      WHERE sm.tenant_id = v_tenant AND sm.item_id = v_line.item_id AND sm.location_id = v_loc;
      IF v_onhand < v_qty THEN
        RAISE EXCEPTION 'Only % available in the selected bin for %', v_onhand, COALESCE(v_line.description, v_line.item_id::text);
      END IF;
    END IF;

    INSERT INTO public.package_lines (tenant_id, document_id, line_no, item_id, description, quantity, location_id)
    VALUES (v_tenant, v_pkg, COALESCE((v_item->>'line_no')::integer, 1), v_line.item_id, v_line.description, v_qty, v_loc);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.package_lines WHERE document_id = v_pkg AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'At least one package line is required';
  END IF;
  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (v_tenant, 'package', v_pkg, 'Draft', 'Package created from Sales Order', auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));
  RETURN v_pkg;
END;
$function$;

CREATE OR REPLACE FUNCTION public.post_package_unchecked(_package_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  pk packages;
  j_id uuid;
  cogs_acct uuid; inv_acct uuid;
  cogs_total numeric(14,2) := 0;
  line record;
  wh uuid;
BEGIN
  SELECT * INTO pk FROM packages WHERE id = _package_id AND deleted_at IS NULL;
  IF pk.id IS NULL THEN RAISE EXCEPTION 'Package not found'; END IF;
  IF pk.tenant_id <> current_tenant_id() AND NOT is_super_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF pk.posted_at IS NOT NULL THEN RAISE EXCEPTION 'Package already confirmed'; END IF;

  cogs_acct := _account_id(pk.tenant_id, '5000');
  inv_acct  := _account_id(pk.tenant_id, '1200');

  wh := pk.warehouse_id;
  IF wh IS NULL THEN
    SELECT id INTO wh FROM warehouses WHERE tenant_id = pk.tenant_id AND deleted_at IS NULL ORDER BY created_at LIMIT 1;
  END IF;

  FOR line IN
    SELECT pl.*, i.cost AS item_cost, i.type AS item_type
    FROM package_lines pl LEFT JOIN items i ON i.id = pl.item_id
    WHERE pl.document_id = _package_id AND pl.deleted_at IS NULL AND pl.item_id IS NOT NULL
  LOOP
    IF line.item_type IS NULL OR line.item_type <> 'Service' THEN
      INSERT INTO stock_movements(tenant_id, item_id, warehouse_id, location_id, quantity, unit_cost, ref_type, ref_id, note, created_by)
      VALUES (pk.tenant_id, line.item_id, wh, line.location_id, -line.quantity, COALESCE(line.item_cost,0), 'package', pk.id, 'Package ' || COALESCE(pk.number,''), auth.uid());
      cogs_total := cogs_total + (COALESCE(line.item_cost,0) * line.quantity);
    END IF;
  END LOOP;

  IF cogs_total > 0 AND cogs_acct IS NOT NULL AND inv_acct IS NOT NULL THEN
    INSERT INTO journal_entries(tenant_id, entry_date, memo, source_ref_type, source_ref_id, total_debit, total_credit, created_by)
    VALUES (pk.tenant_id, CURRENT_DATE, 'Shipment ' || COALESCE(pk.number,''), 'package', pk.id, cogs_total, cogs_total, auth.uid())
    RETURNING id INTO j_id;
    INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES (pk.tenant_id, j_id, cogs_acct, cogs_total, 0, 'COGS');
    INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES (pk.tenant_id, j_id, inv_acct, 0, cogs_total, 'Inventory');
  END IF;

  UPDATE packages SET status = 'Packed', posted_at = now() WHERE id = _package_id;

  INSERT INTO document_events(tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (pk.tenant_id, 'package', pk.id, 'Posted',
          'Inventory movements and journal entry recorded', auth.uid(),
          (SELECT email FROM profiles WHERE id = auth.uid()));

  IF pk.sales_order_id IS NOT NULL THEN
    UPDATE sales_orders SET status = 'Packed'
    WHERE id = pk.sales_order_id AND status IN ('Draft','Confirmed','Processing');
  END IF;

  RETURN _package_id;
END $function$;