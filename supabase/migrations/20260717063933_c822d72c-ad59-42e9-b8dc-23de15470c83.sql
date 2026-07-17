
-- Fix RPCs to match actual column names (date instead of order_date/invoice_date, price/cost instead of purchase_price)

CREATE OR REPLACE FUNCTION public.convert_quote_to_order(_quote_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  q sales_quotes;
  new_id uuid;
  new_num text;
BEGIN
  SELECT * INTO q FROM sales_quotes WHERE id = _quote_id AND deleted_at IS NULL;
  IF q.id IS NULL THEN RAISE EXCEPTION 'Quote not found'; END IF;
  IF q.tenant_id <> current_tenant_id() AND NOT is_super_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF q.converted_order_id IS NOT NULL THEN RETURN q.converted_order_id; END IF;

  new_num := 'SO-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,6);

  INSERT INTO sales_orders(tenant_id, number, customer_id, date, status, subtotal, discount_total, tax_total, grand_total, amount, notes, currency, source_quote_id, created_by)
  VALUES (q.tenant_id, new_num, q.customer_id, CURRENT_DATE, 'Draft', q.subtotal, q.discount_total, q.tax_total, q.grand_total, q.grand_total, q.notes, q.currency, q.id, auth.uid())
  RETURNING id INTO new_id;

  INSERT INTO sales_order_lines(tenant_id, document_id, line_no, item_id, description, quantity, unit_price, discount_pct, tax_pct, line_total)
  SELECT tenant_id, new_id, line_no, item_id, description, quantity, unit_price, discount_pct, tax_pct, line_total
  FROM sales_quote_lines WHERE document_id = _quote_id AND deleted_at IS NULL;

  UPDATE sales_quotes SET converted_order_id = new_id, status = 'Accepted' WHERE id = _quote_id;
  RETURN new_id;
END $function$;

CREATE OR REPLACE FUNCTION public.convert_order_to_invoice(_order_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o sales_orders;
  new_id uuid;
  new_num text;
BEGIN
  SELECT * INTO o FROM sales_orders WHERE id = _order_id AND deleted_at IS NULL;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.tenant_id <> current_tenant_id() AND NOT is_super_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF o.converted_invoice_id IS NOT NULL THEN RETURN o.converted_invoice_id; END IF;

  new_num := 'INV-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,6);

  INSERT INTO invoices(tenant_id, number, customer_id, date, due_date, status, subtotal, discount_total, tax_total, grand_total, amount, notes, currency, source_order_id, balance_due, balance, created_by)
  VALUES (o.tenant_id, new_num, o.customer_id, CURRENT_DATE, CURRENT_DATE + 30, 'Draft', o.subtotal, o.discount_total, o.tax_total, o.grand_total, o.grand_total, o.notes, o.currency, o.id, o.grand_total, o.grand_total, auth.uid())
  RETURNING id INTO new_id;

  INSERT INTO invoice_lines(tenant_id, document_id, line_no, item_id, description, quantity, unit_price, discount_pct, tax_pct, line_total)
  SELECT tenant_id, new_id, line_no, item_id, description, quantity, unit_price, discount_pct, tax_pct, line_total
  FROM sales_order_lines WHERE document_id = _order_id AND deleted_at IS NULL;

  UPDATE sales_orders SET converted_invoice_id = new_id, status = 'Invoiced' WHERE id = _order_id;
  RETURN new_id;
END $function$;

CREATE OR REPLACE FUNCTION public.post_invoice(_invoice_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inv invoices;
  j_id uuid;
  ar_acct uuid; rev_acct uuid; tax_acct uuid; cogs_acct uuid; inv_acct uuid;
  cogs_total numeric(14,2) := 0;
  line record;
  wh uuid;
BEGIN
  SELECT * INTO inv FROM invoices WHERE id = _invoice_id AND deleted_at IS NULL;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF inv.tenant_id <> current_tenant_id() AND NOT is_super_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF inv.posted_at IS NOT NULL THEN RAISE EXCEPTION 'Invoice already posted'; END IF;

  ar_acct   := _account_id(inv.tenant_id, '1100');
  rev_acct  := _account_id(inv.tenant_id, '4000');
  tax_acct  := _account_id(inv.tenant_id, '2000');
  cogs_acct := _account_id(inv.tenant_id, '5000');
  inv_acct  := _account_id(inv.tenant_id, '1200');

  SELECT id INTO wh FROM warehouses WHERE tenant_id = inv.tenant_id AND deleted_at IS NULL ORDER BY created_at LIMIT 1;

  INSERT INTO journal_entries(tenant_id, entry_date, memo, source_ref_type, source_ref_id, total_debit, total_credit, created_by)
  VALUES (inv.tenant_id, CURRENT_DATE, 'Invoice ' || inv.number, 'invoice', inv.id, inv.grand_total, inv.grand_total, auth.uid())
  RETURNING id INTO j_id;

  INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
  VALUES (inv.tenant_id, j_id, ar_acct, inv.grand_total, 0, 'AR');

  INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
  VALUES (inv.tenant_id, j_id, rev_acct, 0, inv.subtotal - inv.discount_total, 'Revenue');

  IF inv.tax_total > 0 THEN
    INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES (inv.tenant_id, j_id, tax_acct, 0, inv.tax_total, 'Tax payable');
  END IF;

  FOR line IN
    SELECT il.*, i.cost as item_cost, i.type as item_type
    FROM invoice_lines il LEFT JOIN items i ON i.id = il.item_id
    WHERE il.document_id = _invoice_id AND il.deleted_at IS NULL AND il.item_id IS NOT NULL
  LOOP
    IF line.item_type IS NULL OR line.item_type NOT IN ('Service') THEN
      INSERT INTO stock_movements(tenant_id, item_id, warehouse_id, quantity, unit_cost, ref_type, ref_id, note, created_by)
      VALUES (inv.tenant_id, line.item_id, wh, -line.quantity, COALESCE(line.item_cost,0), 'invoice', inv.id, 'Invoice ' || inv.number, auth.uid());
      cogs_total := cogs_total + (COALESCE(line.item_cost,0) * line.quantity);
    END IF;
  END LOOP;

  IF cogs_total > 0 AND cogs_acct IS NOT NULL AND inv_acct IS NOT NULL THEN
    INSERT INTO journal_entries(tenant_id, entry_date, memo, source_ref_type, source_ref_id, total_debit, total_credit, created_by)
    VALUES (inv.tenant_id, CURRENT_DATE, 'COGS for ' || inv.number, 'invoice_cogs', inv.id, cogs_total, cogs_total, auth.uid())
    RETURNING id INTO j_id;
    INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES (inv.tenant_id, j_id, cogs_acct, cogs_total, 0, 'COGS');
    INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES (inv.tenant_id, j_id, inv_acct, 0, cogs_total, 'Inventory');
  END IF;

  UPDATE invoices SET status = 'Posted', posted_at = now(), balance_due = grand_total - amount_paid, balance = grand_total - amount_paid WHERE id = _invoice_id;
  RETURN _invoice_id;
END $function$;

REVOKE ALL ON FUNCTION public.convert_quote_to_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.convert_order_to_invoice(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_quote_to_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_order_to_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_invoice(uuid) TO authenticated;
