CREATE OR REPLACE FUNCTION public.post_package_unchecked(_package_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  pk packages;
  j_id uuid;
  cogs_acct uuid; inv_acct uuid;
  cogs_total numeric(14,2) := 0;
  line record;
  wh uuid;
  v_ordered numeric(18,4);
  v_packed numeric(18,4);
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
    SELECT COALESCE(SUM(sol.quantity), 0) INTO v_ordered
    FROM sales_order_lines sol
    WHERE sol.document_id = pk.sales_order_id AND sol.deleted_at IS NULL;

    SELECT COALESCE(SUM(pl.quantity), 0) INTO v_packed
    FROM package_lines pl
    JOIN packages p2 ON p2.id = pl.document_id
    WHERE p2.sales_order_id = pk.sales_order_id
      AND p2.deleted_at IS NULL
      AND p2.posted_at IS NOT NULL
      AND pl.deleted_at IS NULL;

    UPDATE sales_orders
    SET status = CASE WHEN status IN ('Draft','Confirmed','Processing') THEN 'Packed' ELSE status END,
        fulfillment_status = CASE
          WHEN v_ordered > 0 AND v_packed >= v_ordered THEN 'Fulfilled'
          WHEN v_packed > 0 THEN 'Partially Fulfilled'
          ELSE 'Not Started'
        END
    WHERE id = pk.sales_order_id;
  END IF;

  RETURN _package_id;
END $function$;