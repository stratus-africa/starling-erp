-- Migration: 20260909200000_sales_source_document_invoicing_rules.sql
-- Description: Business rules, indexes, and database validation for Sales Order -> Invoice
-- and Quote -> Sales Order source document relationships, including remaining quantity calculations.

-- 1. Helper function: calculate remaining billable/invoicable quantities for a sales order
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
  v_remaining_qty numeric;
  v_total_ordered numeric := 0;
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

  -- Iterate through order lines
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
    -- Calculate how much of this item has already been invoiced in non-cancelled invoices
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

    v_remaining_qty := GREATEST(0, v_line.quantity - v_invoiced_qty);

    v_total_ordered := v_total_ordered + v_line.quantity;
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
    'total_invoiced', v_total_invoiced,
    'total_remaining', v_total_remaining,
    'is_fully_invoiced', v_is_fully_invoiced,
    'lines', v_lines
  );
END;
$$;

-- 2. Database validation trigger: enforce that invoiced quantity cannot exceed remaining order quantity
CREATE OR REPLACE FUNCTION public.validate_invoice_line_against_sales_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source_order_id uuid;
  v_ordered_qty numeric;
  v_other_invoiced_qty numeric;
  v_desc text;
BEGIN
  -- Look up if parent invoice has a source sales order
  SELECT source_order_id INTO v_source_order_id
  FROM public.invoices
  WHERE id = NEW.document_id
    AND deleted_at IS NULL;

  -- If not linked to a sales order, allow
  IF v_source_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- If line is deleted, allow
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Find ordered quantity on the source sales order
  IF NEW.item_id IS NOT NULL THEN
    SELECT COALESCE(SUM(quantity), 0) INTO v_ordered_qty
    FROM public.sales_order_lines
    WHERE document_id = v_source_order_id
      AND item_id = NEW.item_id
      AND deleted_at IS NULL;
  ELSE
    SELECT COALESCE(SUM(quantity), 0) INTO v_ordered_qty
    FROM public.sales_order_lines
    WHERE document_id = v_source_order_id
      AND description = NEW.description
      AND deleted_at IS NULL;
  END IF;

  -- If item was on the sales order, enforce remaining quantity limit
  IF v_ordered_qty > 0 THEN
    -- Sum all OTHER non-cancelled invoice lines for this item from this sales order
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

    IF (v_other_invoiced_qty + NEW.quantity) > v_ordered_qty THEN
      v_desc := COALESCE(NEW.description, 'Item');
      RAISE EXCEPTION 'Invoiced quantity (%) for "%" exceeds remaining un-invoiced quantity (%) on source Sales Order',
        NEW.quantity, v_desc, (v_ordered_qty - v_other_invoiced_qty);
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

-- 3. Optimized indexes for source-document lookup and filtering
CREATE INDEX IF NOT EXISTS idx_invoices_source_order
  ON public.invoices (tenant_id, source_order_id)
  WHERE source_order_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_orders_source_quote
  ON public.sales_orders (tenant_id, source_quote_id)
  WHERE source_quote_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_quotes_customer_status
  ON public.sales_quotes (tenant_id, customer_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_orders_customer_status
  ON public.sales_orders (tenant_id, customer_id, status)
  WHERE deleted_at IS NULL;
