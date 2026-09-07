-- Phase 3: canonical Sales lifecycle and state dimensions.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'Unallocated';
ALTER TABLE public.payments_received
  ADD COLUMN IF NOT EXISTS allocation_status text NOT NULL DEFAULT 'Unallocated';

-- Normalize historical values by owning dimension. Do not map fulfillment or
-- invoicing values into lifecycle status columns.
UPDATE public.sales_quotes
SET status = CASE lower(COALESCE(status, 'draft'))
  WHEN 'open' THEN 'Draft'
  WHEN 'pending' THEN 'Draft'
  WHEN 'approved' THEN 'Accepted'
  WHEN 'accepted' THEN 'Accepted'
  WHEN 'sent' THEN 'Sent'
  WHEN 'viewed' THEN 'Viewed'
  WHEN 'rejected' THEN 'Rejected'
  WHEN 'expired' THEN 'Expired'
  WHEN 'cancelled' THEN 'Cancelled'
  ELSE 'Draft'
END
WHERE status IS NULL OR status NOT IN ('Draft', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired', 'Cancelled');

UPDATE public.sales_orders
SET status = CASE lower(COALESCE(status, 'draft'))
  WHEN 'open' THEN 'Draft'
  WHEN 'pending' THEN 'Draft'
  WHEN 'approved' THEN 'Confirmed'
  WHEN 'confirmed' THEN 'Confirmed'
  WHEN 'processing' THEN 'Processing'
  WHEN 'completed' THEN 'Completed'
  WHEN 'cancelled' THEN 'Cancelled'
  ELSE 'Draft'
END
WHERE status IS NULL OR status NOT IN ('Draft', 'Confirmed', 'Processing', 'Completed', 'Cancelled');

UPDATE public.invoices
SET status = CASE lower(COALESCE(status, 'draft'))
  WHEN 'open' THEN 'Draft'
  WHEN 'pending' THEN 'Draft'
  WHEN 'approved' THEN 'Posted'
  WHEN 'posted' THEN 'Posted'
  WHEN 'sent' THEN 'Sent'
  WHEN 'processing' THEN 'Posted'
  WHEN 'partially paid' THEN 'Partially Paid'
  WHEN 'paid' THEN 'Paid'
  WHEN 'overdue' THEN 'Overdue'
  WHEN 'voided' THEN 'Voided'
  WHEN 'cancelled' THEN 'Cancelled'
  ELSE 'Draft'
END
WHERE status IS NULL OR status NOT IN ('Draft', 'Posted', 'Sent', 'Partially Paid', 'Paid', 'Overdue', 'Voided', 'Cancelled');

UPDATE public.payments_received
SET status = CASE lower(COALESCE(status, 'draft'))
  WHEN 'open' THEN 'Draft'
  WHEN 'pending' THEN 'Draft'
  WHEN 'approved' THEN 'Draft'
  WHEN 'posted' THEN 'Posted'
  WHEN 'voided' THEN 'Voided'
  ELSE 'Draft'
END
WHERE status IS NULL OR status NOT IN ('Draft', 'Posted', 'Voided');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_quotes_status_check') THEN
    ALTER TABLE public.sales_quotes ADD CONSTRAINT sales_quotes_status_check
      CHECK (status IN ('Draft', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired', 'Cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_status_check') THEN
    ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_status_check
      CHECK (status IN ('Draft', 'Confirmed', 'Processing', 'Completed', 'Cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_status_check') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check
      CHECK (status IN ('Draft', 'Posted', 'Sent', 'Partially Paid', 'Paid', 'Overdue', 'Voided', 'Cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_payment_status_check') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_payment_status_check
      CHECK (payment_status IN ('Unallocated', 'Partially Allocated', 'Fully Allocated'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_received_status_check') THEN
    ALTER TABLE public.payments_received ADD CONSTRAINT payments_received_status_check
      CHECK (status IN ('Draft', 'Posted', 'Voided'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_received_allocation_status_check') THEN
    ALTER TABLE public.payments_received ADD CONSTRAINT payments_received_allocation_status_check
      CHECK (allocation_status IN ('Unallocated', 'Partially Allocated', 'Fully Allocated'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.refresh_invoice_payment_status(_invoice_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_summary record;
  v_lifecycle text;
  v_payment_status text;
BEGIN
  SELECT * INTO v_summary FROM public.get_invoice_payment_summary(_invoice_id);
  v_payment_status := CASE
    WHEN v_summary.allocated_amount <= 0 THEN 'Unallocated'
    WHEN v_summary.balance_due <= 0.005 THEN 'Fully Allocated'
    ELSE 'Partially Allocated'
  END;
  v_lifecycle := CASE
    WHEN v_summary.balance_due <= 0.005 THEN 'Paid'
    WHEN v_summary.allocated_amount > 0 THEN 'Partially Paid'
    WHEN v_summary.payment_status = 'Overdue' THEN 'Overdue'
    ELSE NULL
  END;

  PERFORM set_config('nimbus.allow_posted_mutation', 'on', true);
  UPDATE public.invoices
  SET amount_paid = v_summary.allocated_amount,
      balance_due = v_summary.balance_due,
      balance = v_summary.balance_due,
      payment_status = v_payment_status,
      status = CASE
        WHEN status IN ('Draft', 'Voided', 'Cancelled') THEN status
        WHEN v_lifecycle IS NULL THEN CASE WHEN status = 'Sent' THEN 'Sent' ELSE 'Posted' END
        ELSE v_lifecycle
      END,
      updated_at = now()
  WHERE id = _invoice_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL;
  PERFORM set_config('nimbus.allow_posted_mutation', 'off', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_payment_allocation_status(_payment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_amount numeric;
  v_allocated numeric;
BEGIN
  SELECT amount INTO v_amount FROM public.payments_received
  WHERE id = _payment_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL;
  SELECT COALESCE(SUM(amount), 0) INTO v_allocated FROM public.payment_allocations
  WHERE payment_id = _payment_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL;
  PERFORM set_config('nimbus.allow_posted_mutation', 'on', true);
  UPDATE public.payments_received
  SET allocation_status = CASE
    WHEN v_allocated <= 0 THEN 'Unallocated'
    WHEN v_allocated >= COALESCE(v_amount, 0) THEN 'Fully Allocated'
    ELSE 'Partially Allocated'
  END,
  updated_at = now()
  WHERE id = _payment_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL;
  PERFORM set_config('nimbus.allow_posted_mutation', 'off', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_sales_order_status(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_summary record;
  v_invoice_count integer;
  v_fulfilled numeric;
  v_ordered numeric;
  v_overdue boolean;
BEGIN
  SELECT * INTO v_summary FROM public.get_sales_order_financial_summary(_order_id);
  SELECT COUNT(*) INTO v_invoice_count FROM public.invoices
  WHERE source_order_id = _order_id AND tenant_id = public.current_tenant_id()
    AND deleted_at IS NULL AND voided_at IS NULL AND COALESCE(status, '') NOT IN ('Cancelled', 'Voided');
  SELECT COALESCE(SUM(sol.quantity), 0), COALESCE((SELECT SUM(pl.quantity) FROM public.package_lines pl JOIN public.packages p ON p.id = pl.document_id WHERE p.sales_order_id = _order_id AND p.tenant_id = public.current_tenant_id() AND p.deleted_at IS NULL AND p.voided_at IS NULL AND pl.deleted_at IS NULL), 0)
  INTO v_ordered, v_fulfilled FROM public.sales_order_lines sol
  WHERE sol.document_id = _order_id AND sol.tenant_id = public.current_tenant_id() AND sol.deleted_at IS NULL;
  SELECT EXISTS (
    SELECT 1 FROM public.invoices i
    CROSS JOIN LATERAL public.get_invoice_payment_summary(i.id) s
    WHERE i.source_order_id = _order_id AND i.tenant_id = public.current_tenant_id()
      AND i.deleted_at IS NULL AND i.voided_at IS NULL AND i.due_date < CURRENT_DATE
      AND s.balance_due > 0 AND COALESCE(i.status, '') NOT IN ('Cancelled', 'Voided')
  ) INTO v_overdue;

  UPDATE public.sales_orders
  SET fulfillment_status = CASE WHEN v_ordered <= 0 OR v_fulfilled <= 0 THEN 'Not Started' WHEN v_fulfilled >= v_ordered THEN 'Fulfilled' ELSE 'Partially Fulfilled' END,
      invoice_status = CASE WHEN v_invoice_count = 0 OR v_summary.invoiced_amount <= 0 THEN 'Not Invoiced' WHEN v_summary.invoiced_amount >= v_summary.order_total THEN 'Fully Invoiced' ELSE 'Partially Invoiced' END,
      payment_status = CASE WHEN v_overdue AND v_summary.paid_amount < v_summary.order_total THEN 'Overdue' WHEN v_summary.paid_amount <= 0 THEN 'Unpaid' WHEN v_summary.paid_amount >= v_summary.order_total THEN 'Paid' ELSE 'Partially Paid' END,
      updated_at = now()
  WHERE id = _order_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_payment_allocation_dependents()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment uuid := COALESCE(NEW.payment_id, OLD.payment_id);
  v_invoice uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_order uuid;
  v_customer uuid;
BEGIN
  PERFORM public.refresh_invoice_payment_status(v_invoice);
  PERFORM public.refresh_payment_allocation_status(v_payment);
  SELECT customer_id INTO v_customer FROM public.payments_received WHERE id = v_payment;
  IF v_customer IS NOT NULL THEN PERFORM public.refresh_customer_ar_summary(v_customer); END IF;
  SELECT source_order_id INTO v_order FROM public.invoices WHERE id = v_invoice;
  IF v_order IS NOT NULL THEN PERFORM public.refresh_sales_order_status(v_order); END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_payment_allocation_dependents ON public.payment_allocations;
CREATE TRIGGER trg_refresh_payment_allocation_dependents
AFTER INSERT OR UPDATE OR DELETE ON public.payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.refresh_payment_allocation_dependents();

CREATE OR REPLACE FUNCTION public.refresh_sales_status_after_invoice_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('nimbus.status_refresh', true) = 'on' THEN RETURN NEW; END IF;
  PERFORM set_config('nimbus.status_refresh', 'on', true);
  PERFORM public.refresh_invoice_payment_status(NEW.id);
  IF NEW.source_order_id IS NOT NULL THEN PERFORM public.refresh_sales_order_status(NEW.source_order_id); END IF;
  PERFORM set_config('nimbus.status_refresh', 'off', true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_sales_status_after_invoice_change ON public.invoices;
CREATE TRIGGER trg_refresh_sales_status_after_invoice_change
AFTER INSERT OR UPDATE OF status, source_order_id, voided_at ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.refresh_sales_status_after_invoice_change();

CREATE OR REPLACE FUNCTION public.refresh_sales_order_after_invoice_line_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_order uuid;
BEGIN
  SELECT source_order_id INTO v_order
  FROM public.invoices
  WHERE id = COALESCE(NEW.document_id, OLD.document_id);
  IF v_order IS NOT NULL THEN PERFORM public.refresh_sales_order_status(v_order); END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_sales_order_after_invoice_line_change ON public.invoice_lines;
CREATE TRIGGER trg_refresh_sales_order_after_invoice_line_change
AFTER INSERT OR UPDATE OF quantity, item_id, description, deleted_at OR DELETE ON public.invoice_lines
FOR EACH ROW EXECUTE FUNCTION public.refresh_sales_order_after_invoice_line_change();

CREATE OR REPLACE FUNCTION public.refresh_sales_status_after_credit_note_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.invoice_id IS NOT NULL THEN PERFORM public.refresh_invoice_payment_status(NEW.invoice_id); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_sales_status_after_credit_note_change ON public.credit_notes;
CREATE TRIGGER trg_refresh_sales_status_after_credit_note_change
AFTER INSERT OR UPDATE OF status, invoice_id, voided_at ON public.credit_notes
FOR EACH ROW EXECUTE FUNCTION public.refresh_sales_status_after_credit_note_change();

CREATE OR REPLACE FUNCTION public.refresh_sales_status_after_package_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_order uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_order := OLD.sales_order_id;
  ELSE
    v_order := NEW.sales_order_id;
  END IF;
  IF v_order IS NOT NULL THEN PERFORM public.refresh_sales_order_status(v_order); END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_sales_status_after_package_change ON public.packages;
CREATE TRIGGER trg_refresh_sales_status_after_package_change
AFTER INSERT OR UPDATE OF sales_order_id, status, voided_at OR DELETE ON public.packages
FOR EACH ROW EXECUTE FUNCTION public.refresh_sales_status_after_package_change();

CREATE OR REPLACE FUNCTION public.refresh_sales_order_after_package_line_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_order uuid;
BEGIN
  SELECT sales_order_id INTO v_order FROM public.packages
  WHERE id = COALESCE(NEW.document_id, OLD.document_id);
  IF v_order IS NOT NULL THEN PERFORM public.refresh_sales_order_status(v_order); END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_sales_order_after_package_line_change ON public.package_lines;
CREATE TRIGGER trg_refresh_sales_order_after_package_line_change
AFTER INSERT OR UPDATE OF quantity, deleted_at OR DELETE ON public.package_lines
FOR EACH ROW EXECUTE FUNCTION public.refresh_sales_order_after_package_line_change();

-- Idempotent, auditable quote conversion. Existing linked orders are returned;
-- a second order is never created for the same quote.
CREATE OR REPLACE FUNCTION public.convert_quote_to_order(_quote_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_quote public.sales_quotes;
  v_order_id uuid;
  v_line record;
BEGIN
  IF NOT public.has_permission('sales.create') THEN RAISE EXCEPTION 'Not authorized: sales.create' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_quote FROM public.sales_quotes
  WHERE id = _quote_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote not found for current tenant'; END IF;
  IF v_quote.converted_order_id IS NOT NULL THEN
    SELECT id INTO v_order_id FROM public.sales_orders WHERE id = v_quote.converted_order_id AND tenant_id = v_quote.tenant_id AND deleted_at IS NULL;
    IF v_order_id IS NOT NULL THEN RETURN v_order_id; END IF;
  END IF;
  IF v_quote.status <> 'Accepted' THEN RAISE EXCEPTION 'Only accepted quotes can be converted'; END IF;
  IF v_quote.expiry IS NOT NULL AND v_quote.expiry < CURRENT_DATE THEN RAISE EXCEPTION 'Expired quotes cannot be converted'; END IF;

  INSERT INTO public.sales_orders (
    tenant_id, customer_id, source_quote_id, date, currency, subtotal,
    discount_total, tax_total, grand_total, amount, notes, status,
    fulfillment_status, invoice_status, payment_status, created_by
  ) VALUES (
    v_quote.tenant_id, v_quote.customer_id, v_quote.id, COALESCE(v_quote.date, CURRENT_DATE),
    v_quote.currency, v_quote.subtotal, v_quote.discount_total, v_quote.tax_total,
    v_quote.grand_total, v_quote.amount, v_quote.notes, 'Draft',
    'Not Started', 'Not Invoiced', 'Unpaid', auth.uid()
  ) RETURNING id INTO v_order_id;

  FOR v_line IN SELECT * FROM public.sales_quote_lines WHERE document_id = _quote_id AND tenant_id = v_quote.tenant_id AND deleted_at IS NULL ORDER BY line_no
  LOOP
    INSERT INTO public.sales_order_lines (
      tenant_id, document_id, line_no, item_id, description, quantity,
      unit_price, discount_pct, tax_pct, line_total
    ) VALUES (
      v_quote.tenant_id, v_order_id, v_line.line_no, v_line.item_id, v_line.description,
      v_line.quantity, v_line.unit_price, v_line.discount_pct, v_line.tax_pct, v_line.line_total
    );
  END LOOP;

  UPDATE public.sales_quotes SET converted_order_id = v_order_id, updated_at = now() WHERE id = _quote_id;
  PERFORM public.record_business_event('converted', 'sales_quote', _quote_id, NULL,
    jsonb_build_object('order_id', v_order_id), jsonb_build_object('source', 'convert_quote_to_order'));
  PERFORM public.refresh_sales_order_status(v_order_id);
  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_quote_to_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_payment_allocation_status(uuid) TO authenticated;
