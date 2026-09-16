-- Sales order fulfillment-based invoicing and stock gating
-- This keeps invoice creation aligned with actual fulfilled quantity and prevents
-- billing beyond what has been shipped/packed for the order.

CREATE OR REPLACE FUNCTION public.get_sales_order_invoicing_status(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid;
  v_order record;
  v_lines jsonb := '[]'::jsonb;
  v_line record;
  v_invoiced_qty numeric;
  v_fulfilled_qty numeric;
  v_remaining_qty numeric;
  v_total_ordered numeric := 0;
  v_total_fulfilled numeric := 0;
  v_total_invoiced numeric := 0;
  v_total_remaining numeric := 0;
  v_is_fully_invoiced boolean := true;
BEGIN
  v_tenant := public.current_tenant_id();

  SELECT * INTO v_order
  FROM public.sales_orders
  WHERE id = _order_id
    AND (v_tenant IS NULL OR tenant_id = v_tenant)
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  FOR v_line IN
    SELECT sol.id, sol.line_no, sol.item_id, sol.description, sol.quantity, sol.unit_price,
           sol.discount_pct, sol.tax_pct, sol.line_total,
           it.sku, it.uom, it.name AS item_name
    FROM public.sales_order_lines sol
    LEFT JOIN public.items it ON it.id = sol.item_id
    WHERE sol.document_id = _order_id
      AND sol.deleted_at IS NULL
    ORDER BY sol.line_no ASC
  LOOP
    SELECT COALESCE(SUM(pl.quantity), 0) INTO v_fulfilled_qty
    FROM public.package_lines pl
    JOIN public.packages pkg ON pkg.id = pl.document_id
    WHERE pkg.sales_order_id = _order_id
      AND pkg.tenant_id = v_tenant
      AND pkg.deleted_at IS NULL
      AND pkg.voided_at IS NULL
      AND pl.deleted_at IS NULL
      AND (
        (v_line.item_id IS NOT NULL AND pl.item_id = v_line.item_id)
        OR (v_line.item_id IS NULL AND pl.description = v_line.description)
      );

    SELECT COALESCE(SUM(il.quantity), 0) INTO v_invoiced_qty
    FROM public.invoice_lines il
    JOIN public.invoices inv ON inv.id = il.document_id
    WHERE inv.source_order_id = _order_id
      AND inv.deleted_at IS NULL
      AND (inv.status IS NULL OR inv.status != 'Cancelled')
      AND il.deleted_at IS NULL
      AND (
        (v_line.item_id IS NOT NULL AND il.item_id = v_line.item_id)
        OR (v_line.item_id IS NULL AND il.description = v_line.description)
      );

    v_remaining_qty := GREATEST(0, v_fulfilled_qty - v_invoiced_qty);

    v_total_ordered := v_total_ordered + v_line.quantity;
    v_total_fulfilled := v_total_fulfilled + v_fulfilled_qty;
    v_total_invoiced := v_total_invoiced + v_invoiced_qty;
    v_total_remaining := v_total_remaining + v_remaining_qty;

    IF v_remaining_qty > 0 THEN
      v_is_fully_invoiced := false;
    END IF;

    v_lines := v_lines || jsonb_build_object(
      'order_line_id', v_line.id,
      'line_no', v_line.line_no,
      'item_id', v_line.item_id,
      'item_name', v_line.item_name,
      'sku', v_line.sku,
      'uom', v_line.uom,
      'description', v_line.description,
      'ordered_quantity', v_line.quantity,
      'fulfilled_quantity', v_fulfilled_qty,
      'already_invoiced_quantity', v_invoiced_qty,
      'remaining_quantity', v_remaining_qty,
      'unit_price', v_line.unit_price,
      'discount_pct', v_line.discount_pct,
      'tax_pct', v_line.tax_pct
    );
  END LOOP;

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.number,
    'order_status', v_order.status,
    'currency', v_order.currency,
    'total_ordered', v_total_ordered,
    'total_fulfilled', v_total_fulfilled,
    'total_invoiced', v_total_invoiced,
    'total_remaining', v_total_remaining,
    'is_fully_invoiced', v_is_fully_invoiced,
    'lines', v_lines
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_invoice_line_against_sales_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source_order_id uuid;
  v_fulfilled_qty numeric;
  v_other_invoiced_qty numeric;
  v_desc text;
BEGIN
  SELECT source_order_id INTO v_source_order_id
  FROM public.invoices
  WHERE id = NEW.document_id
    AND deleted_at IS NULL;

  IF v_source_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.item_id IS NOT NULL THEN
    SELECT COALESCE(SUM(pl.quantity), 0) INTO v_fulfilled_qty
    FROM public.package_lines pl
    JOIN public.packages pkg ON pkg.id = pl.document_id
    WHERE pkg.sales_order_id = v_source_order_id
      AND pkg.deleted_at IS NULL
      AND pkg.voided_at IS NULL
      AND pl.deleted_at IS NULL
      AND pl.item_id = NEW.item_id;
  ELSE
    SELECT COALESCE(SUM(pl.quantity), 0) INTO v_fulfilled_qty
    FROM public.package_lines pl
    JOIN public.packages pkg ON pkg.id = pl.document_id
    WHERE pkg.sales_order_id = v_source_order_id
      AND pkg.deleted_at IS NULL
      AND pkg.voided_at IS NULL
      AND pl.deleted_at IS NULL
      AND pl.description = NEW.description;
  END IF;

  IF v_fulfilled_qty > 0 THEN
    IF NEW.item_id IS NOT NULL THEN
      SELECT COALESCE(SUM(il.quantity), 0) INTO v_other_invoiced_qty
      FROM public.invoice_lines il
      JOIN public.invoices inv ON inv.id = il.document_id
      WHERE inv.source_order_id = v_source_order_id
        AND inv.deleted_at IS NULL
        AND (inv.status IS NULL OR inv.status != 'Cancelled')
        AND il.deleted_at IS NULL
        AND il.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND il.item_id = NEW.item_id;
    ELSE
      SELECT COALESCE(SUM(il.quantity), 0) INTO v_other_invoiced_qty
      FROM public.invoice_lines il
      JOIN public.invoices inv ON inv.id = il.document_id
      WHERE inv.source_order_id = v_source_order_id
        AND inv.deleted_at IS NULL
        AND (inv.status IS NULL OR inv.status != 'Cancelled')
        AND il.deleted_at IS NULL
        AND il.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND il.description = NEW.description;
    END IF;

    IF (v_other_invoiced_qty + NEW.quantity) > v_fulfilled_qty THEN
      v_desc := COALESCE(NEW.description, 'Item');
      RAISE EXCEPTION 'Invoiced quantity (%) for "%" exceeds fulfilled quantity (%) on source Sales Order',
        NEW.quantity, v_desc, (v_fulfilled_qty - v_other_invoiced_qty);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_invoice_line_against_order ON public.invoice_lines;
CREATE TRIGGER trg_validate_invoice_line_against_order
BEFORE INSERT OR UPDATE OF quantity, item_id, description, deleted_at
ON public.invoice_lines
FOR EACH ROW
EXECUTE FUNCTION public.validate_invoice_line_against_sales_order();

CREATE OR REPLACE FUNCTION public.create_invoice_from_sales_order(
  _order_id uuid,
  _lines jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := public.current_tenant_id();
  v_order public.sales_orders;
  v_item jsonb;
  v_order_line public.sales_order_lines;
  v_invoice_id uuid;
  v_line_no integer := 0;
  v_quantity numeric;
  v_invoiced numeric;
  v_fulfilled numeric;
  v_remaining numeric;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_tax numeric := 0;
  v_grand_total numeric := 0;
  v_seen uuid[] := ARRAY[]::uuid[];
BEGIN
  IF v_tenant IS NULL OR NOT public.has_permission('sales.create') THEN
    RAISE EXCEPTION 'Not authorized to create an invoice' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'At least one invoice line is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_order_id::text, 0));
  SELECT * INTO v_order
  FROM public.sales_orders
  WHERE id = _order_id AND tenant_id = v_tenant AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales order not found'; END IF;
  IF COALESCE(v_order.status, '') IN ('Cancelled', 'Completed') THEN
    RAISE EXCEPTION 'Sales order is not available for invoicing';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    IF NULLIF(v_item->>'order_line_id', '') IS NULL THEN
      RAISE EXCEPTION 'Each invoice line requires order_line_id';
    END IF;
    IF (v_item->>'order_line_id')::uuid = ANY(v_seen) THEN
      RAISE EXCEPTION 'Duplicate sales order line in invoice request';
    END IF;
    v_seen := array_append(v_seen, (v_item->>'order_line_id')::uuid);
    v_quantity := round((v_item->>'quantity')::numeric, 6);
    IF v_quantity IS NULL OR v_quantity <= 0 THEN RAISE EXCEPTION 'Invoice quantity must be greater than zero'; END IF;

    SELECT * INTO v_order_line
    FROM public.sales_order_lines
    WHERE id = (v_item->>'order_line_id')::uuid
      AND document_id = _order_id AND tenant_id = v_tenant AND deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sales order line not found'; END IF;

    SELECT COALESCE(SUM(il.quantity), 0) INTO v_invoiced
    FROM public.invoice_lines il
    JOIN public.invoices inv ON inv.id = il.document_id
    WHERE inv.source_order_id = _order_id AND inv.tenant_id = v_tenant
      AND inv.deleted_at IS NULL AND COALESCE(inv.status, '') NOT IN ('Cancelled', 'Voided')
      AND il.deleted_at IS NULL
      AND ((v_order_line.item_id IS NOT NULL AND il.item_id = v_order_line.item_id)
        OR (v_order_line.item_id IS NULL AND il.description = v_order_line.description));

    SELECT COALESCE(SUM(pl.quantity), 0) INTO v_fulfilled
    FROM public.package_lines pl
    JOIN public.packages pkg ON pkg.id = pl.document_id
    WHERE pkg.sales_order_id = _order_id
      AND pkg.tenant_id = v_tenant
      AND pkg.deleted_at IS NULL
      AND pkg.voided_at IS NULL
      AND pl.deleted_at IS NULL
      AND ((v_order_line.item_id IS NOT NULL AND pl.item_id = v_order_line.item_id)
        OR (v_order_line.item_id IS NULL AND pl.description = v_order_line.description));

    v_remaining := GREATEST(0, v_fulfilled - v_invoiced);
    IF v_quantity > v_remaining THEN
      RAISE EXCEPTION 'Invoice quantity (%) exceeds fulfilled quantity (%) for order line %', v_quantity, v_remaining, v_order_line.id;
    END IF;
  END LOOP;

  INSERT INTO public.invoices (
    tenant_id, customer_id, source_order_id, date, currency, subtotal,
    discount_total, tax_total, grand_total, amount_paid, balance_due,
    balance, status, notes, created_by
  ) VALUES (
    v_tenant, v_order.customer_id, v_order.id, CURRENT_DATE, v_order.currency,
    0, 0, 0, 0, 0, 0, 0, 'Draft', v_order.notes, auth.uid()
  ) RETURNING id INTO v_invoice_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    SELECT * INTO v_order_line FROM public.sales_order_lines
    WHERE id = (v_item->>'order_line_id')::uuid AND document_id = _order_id AND tenant_id = v_tenant;
    v_quantity := round((v_item->>'quantity')::numeric, 6);
    v_line_total := round(v_quantity * v_order_line.unit_price * (1 - COALESCE(v_order_line.discount_pct, 0) / 100) * (1 + COALESCE(v_order_line.tax_pct, 0) / 100), 2);
    v_subtotal := v_subtotal + round(v_quantity * v_order_line.unit_price, 2);
    v_discount := v_discount + round(v_quantity * v_order_line.unit_price * COALESCE(v_order_line.discount_pct, 0) / 100, 2);
    v_tax := v_tax + round((v_quantity * v_order_line.unit_price - v_quantity * v_order_line.unit_price * COALESCE(v_order_line.discount_pct, 0) / 100) * COALESCE(v_order_line.tax_pct, 0) / 100, 2);
    v_grand_total := v_grand_total + v_line_total;
    v_line_no := v_line_no + 1;
    INSERT INTO public.invoice_lines (tenant_id, document_id, line_no, item_id, description, quantity, unit_price, discount_pct, tax_pct, line_total)
    VALUES (v_tenant, v_invoice_id, v_line_no, v_order_line.item_id, v_order_line.description, v_quantity, v_order_line.unit_price, v_order_line.discount_pct, v_order_line.tax_pct, v_line_total);
  END LOOP;

  PERFORM set_config('nimbus.allow_posted_mutation', 'on', true);
  UPDATE public.invoices
  SET subtotal = v_subtotal, discount_total = v_discount, tax_total = v_tax,
      grand_total = v_grand_total, balance_due = v_grand_total, balance = v_grand_total
  WHERE id = v_invoice_id;
  PERFORM set_config('nimbus.allow_posted_mutation', 'off', true);
  PERFORM public.record_business_event('created', 'invoice', v_invoice_id, NULL, jsonb_build_object('source_order_id', _order_id), jsonb_build_object('line_count', v_line_no));
  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_order_invoicing_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_from_sales_order(uuid, jsonb) TO authenticated;
