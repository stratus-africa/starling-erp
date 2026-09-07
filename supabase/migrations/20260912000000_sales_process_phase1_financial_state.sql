-- Phase 1: Sales process financial state and payment allocations.
-- This migration preserves the legacy payments_received.invoice_id relationship
-- and denormalized invoice payment fields for compatibility. Allocations and the
-- functions below are the authoritative source for new financial calculations.

-- -----------------------------------------------------------------------------
-- Sales order state dimensions
-- -----------------------------------------------------------------------------

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS fulfillment_status text,
  ADD COLUMN IF NOT EXISTS invoice_status text,
  ADD COLUMN IF NOT EXISTS payment_status text;

UPDATE public.sales_orders
SET fulfillment_status = CASE
  WHEN fulfillment_status IN ('Not Started', 'Partially Fulfilled', 'Fulfilled')
    THEN fulfillment_status
  ELSE 'Not Started'
END,
invoice_status = CASE
  WHEN invoice_status IN ('Not Invoiced', 'Partially Invoiced', 'Fully Invoiced')
    THEN invoice_status
  ELSE 'Not Invoiced'
END,
payment_status = CASE
  WHEN payment_status IN ('Unpaid', 'Partially Paid', 'Paid', 'Overdue')
    THEN payment_status
  ELSE 'Unpaid'
END;

ALTER TABLE public.sales_orders
  ALTER COLUMN fulfillment_status SET DEFAULT 'Not Started',
  ALTER COLUMN fulfillment_status SET NOT NULL,
  ALTER COLUMN invoice_status SET DEFAULT 'Not Invoiced',
  ALTER COLUMN invoice_status SET NOT NULL,
  ALTER COLUMN payment_status SET DEFAULT 'Unpaid',
  ALTER COLUMN payment_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_fulfillment_status_check') THEN
    ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_fulfillment_status_check
      CHECK (fulfillment_status IN ('Not Started', 'Partially Fulfilled', 'Fulfilled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_invoice_status_check') THEN
    ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_invoice_status_check
      CHECK (invoice_status IN ('Not Invoiced', 'Partially Invoiced', 'Fully Invoiced'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_payment_status_check') THEN
    ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_payment_status_check
      CHECK (payment_status IN ('Unpaid', 'Partially Paid', 'Paid', 'Overdue'));
  END IF;
END $$;

-- The legacy schema did not expose payment currency or invoice_id in every
-- generated client schema, although both are used by the application model.
ALTER TABLE public.payments_received
  ADD COLUMN IF NOT EXISTS invoice_id uuid,
  ADD COLUMN IF NOT EXISTS currency text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_received_invoice_id_fkey'
  ) THEN
    ALTER TABLE public.payments_received
      ADD CONSTRAINT payments_received_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Allocation ledger
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments_received(id),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  allocation_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz
);

ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS payment_allocations_tenant_payment_idx
  ON public.payment_allocations (tenant_id, payment_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS payment_allocations_tenant_invoice_idx
  ON public.payment_allocations (tenant_id, invoice_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payment_allocations_active_unique_idx
  ON public.payment_allocations (tenant_id, payment_id, invoice_id)
  WHERE deleted_at IS NULL;

DROP POLICY IF EXISTS payment_allocations_tenant_read ON public.payment_allocations;
CREATE POLICY payment_allocations_tenant_read
  ON public.payment_allocations FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_permission('payments.read'));

DROP POLICY IF EXISTS payment_allocations_tenant_insert ON public.payment_allocations;
CREATE POLICY payment_allocations_tenant_insert
  ON public.payment_allocations FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.has_permission('payments.create')
  );

DROP POLICY IF EXISTS payment_allocations_tenant_update ON public.payment_allocations;
CREATE POLICY payment_allocations_tenant_update
  ON public.payment_allocations FOR UPDATE TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND public.has_permission('payments.update')
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.has_permission('payments.update')
  );

DROP POLICY IF EXISTS payment_allocations_tenant_delete ON public.payment_allocations;
CREATE POLICY payment_allocations_tenant_delete
  ON public.payment_allocations FOR DELETE TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND public.has_permission('payments.update')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_allocations TO authenticated;
GRANT ALL ON public.payment_allocations TO service_role;

-- -----------------------------------------------------------------------------
-- Authoritative summaries
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_invoice_payment_summary(_invoice_id uuid)
RETURNS TABLE (
  invoice_total numeric,
  allocated_amount numeric,
  credit_notes_applied numeric,
  balance_due numeric,
  payment_status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice public.invoices;
  v_allocated numeric;
  v_credit_notes numeric;
  v_balance numeric;
BEGIN
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = _invoice_id
    AND tenant_id = public.current_tenant_id()
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found for current tenant';
  END IF;

  SELECT COALESCE(SUM(pa.amount), 0) INTO v_allocated
  FROM public.payment_allocations pa
  WHERE pa.invoice_id = _invoice_id AND pa.tenant_id = v_invoice.tenant_id AND pa.deleted_at IS NULL;

  SELECT COALESCE(SUM(cn.grand_total), 0) INTO v_credit_notes
  FROM public.credit_notes cn
  WHERE cn.invoice_id = _invoice_id
    AND cn.tenant_id = v_invoice.tenant_id
    AND cn.deleted_at IS NULL
    AND cn.voided_at IS NULL
    AND COALESCE(cn.status, '') NOT IN ('Cancelled', 'Voided');

  v_balance := GREATEST(0, COALESCE(v_invoice.grand_total, 0) - v_credit_notes - v_allocated);

  RETURN QUERY SELECT
    COALESCE(v_invoice.grand_total, 0),
    v_allocated,
    v_credit_notes,
    v_balance,
    CASE
      WHEN v_balance <= 0.005 THEN 'Paid'
      WHEN v_allocated > 0 THEN 'Partially Paid'
      WHEN v_invoice.due_date IS NOT NULL AND v_invoice.due_date < CURRENT_DATE THEN 'Overdue'
      ELSE 'Unpaid'
    END;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_payment_allocation_summary(_payment_id uuid)
RETURNS TABLE (
  payment_amount numeric,
  allocated_amount numeric,
  unallocated_amount numeric,
  allocation_status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment public.payments_received;
  v_allocated numeric;
BEGIN
  SELECT * INTO v_payment
  FROM public.payments_received
  WHERE id = _payment_id
    AND tenant_id = public.current_tenant_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found for current tenant';
  END IF;

  SELECT COALESCE(SUM(pa.amount), 0) INTO v_allocated
  FROM public.payment_allocations pa
  WHERE pa.payment_id = _payment_id AND pa.tenant_id = v_payment.tenant_id AND pa.deleted_at IS NULL;

  RETURN QUERY SELECT
    COALESCE(v_payment.amount, 0),
    v_allocated,
    GREATEST(0, COALESCE(v_payment.amount, 0) - v_allocated),
    CASE
      WHEN v_allocated > COALESCE(v_payment.amount, 0) THEN 'Overallocated'
      WHEN v_allocated <= 0 THEN 'Unallocated'
      WHEN v_allocated >= COALESCE(v_payment.amount, 0) THEN 'Fully Allocated'
      ELSE 'Partially Allocated'
    END;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_sales_order_financial_summary(_order_id uuid)
RETURNS TABLE (
  order_total numeric,
  invoiced_amount numeric,
  uninvoiced_amount numeric,
  paid_amount numeric,
  outstanding_amount numeric,
  fulfillment_percentage numeric,
  invoice_percentage numeric,
  payment_percentage numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.sales_orders;
  v_invoiced numeric;
  v_paid numeric;
  v_ordered_qty numeric;
  v_fulfilled_qty numeric;
BEGIN
  SELECT * INTO v_order
  FROM public.sales_orders
  WHERE id = _order_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales order not found for current tenant'; END IF;

  SELECT
    COALESCE((
      SELECT SUM(inv.grand_total)
      FROM public.invoices inv
      WHERE inv.source_order_id = _order_id
        AND inv.tenant_id = v_order.tenant_id
        AND inv.deleted_at IS NULL
        AND inv.voided_at IS NULL
        AND COALESCE(inv.status, '') NOT IN ('Cancelled', 'Voided')
    ), 0),
    COALESCE((
      SELECT SUM(pa.amount)
      FROM public.payment_allocations pa
      JOIN public.invoices inv ON inv.id = pa.invoice_id AND inv.tenant_id = pa.tenant_id
      WHERE inv.source_order_id = _order_id
        AND pa.tenant_id = v_order.tenant_id
        AND pa.deleted_at IS NULL
        AND inv.deleted_at IS NULL
        AND inv.voided_at IS NULL
        AND COALESCE(inv.status, '') NOT IN ('Cancelled', 'Voided')
    ), 0)
  INTO v_invoiced, v_paid;

  SELECT COALESCE(SUM(sol.quantity), 0) INTO v_ordered_qty
  FROM public.sales_order_lines sol
  WHERE sol.document_id = _order_id AND sol.tenant_id = v_order.tenant_id AND sol.deleted_at IS NULL;

  SELECT COALESCE(SUM(pl.quantity), 0) INTO v_fulfilled_qty
  FROM public.package_lines pl
  JOIN public.packages pkg ON pkg.id = pl.document_id AND pkg.tenant_id = pl.tenant_id
  WHERE pkg.sales_order_id = _order_id
    AND pkg.tenant_id = v_order.tenant_id
    AND pkg.deleted_at IS NULL
    AND pkg.voided_at IS NULL
    AND COALESCE(pkg.status, '') NOT IN ('Cancelled', 'Voided')
    AND pl.deleted_at IS NULL;

  RETURN QUERY SELECT
    COALESCE(v_order.grand_total, 0),
    v_invoiced,
    GREATEST(0, COALESCE(v_order.grand_total, 0) - v_invoiced),
    v_paid,
    GREATEST(0, COALESCE(v_order.grand_total, 0) - v_paid),
    CASE WHEN v_ordered_qty > 0 THEN ROUND(LEAST(100, v_fulfilled_qty / v_ordered_qty * 100), 2) ELSE 0 END,
    CASE WHEN COALESCE(v_order.grand_total, 0) > 0 THEN ROUND(LEAST(100, v_invoiced / v_order.grand_total * 100), 2) ELSE 0 END,
    CASE WHEN COALESCE(v_order.grand_total, 0) > 0 THEN ROUND(LEAST(100, v_paid / v_order.grand_total * 100), 2) ELSE 0 END;
END;
$$;

-- -----------------------------------------------------------------------------
-- Allocation validation and status refresh
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_payment_allocation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment public.payments_received;
  v_invoice public.invoices;
  v_allocated_payment numeric;
  v_allocated_invoice numeric;
  v_credit_notes numeric;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN RAISE EXCEPTION 'Allocation amount must be greater than zero'; END IF;
  IF NEW.tenant_id IS DISTINCT FROM public.current_tenant_id() THEN RAISE EXCEPTION 'Allocation tenant is not current tenant'; END IF;

  SELECT * INTO v_payment FROM public.payments_received
  WHERE id = NEW.payment_id AND tenant_id = NEW.tenant_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment does not exist for current tenant'; END IF;
  IF v_payment.voided_at IS NOT NULL OR COALESCE(v_payment.status, '') IN ('Cancelled', 'Voided') THEN
    RAISE EXCEPTION 'Payment is not valid for allocation';
  END IF;
  IF COALESCE(v_payment.amount, 0) <= 0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;

  SELECT * INTO v_invoice FROM public.invoices
  WHERE id = NEW.invoice_id AND tenant_id = NEW.tenant_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice does not exist for current tenant'; END IF;
  IF v_invoice.voided_at IS NOT NULL OR COALESCE(v_invoice.status, '') IN ('Cancelled', 'Voided') THEN
    RAISE EXCEPTION 'Invoice is not valid for allocation';
  END IF;
  IF v_payment.customer_id IS DISTINCT FROM v_invoice.customer_id THEN RAISE EXCEPTION 'Payment and invoice customers do not match'; END IF;
  IF v_payment.currency IS NULL OR v_invoice.currency IS NULL OR upper(v_payment.currency) <> upper(v_invoice.currency) THEN
    RAISE EXCEPTION 'Payment and invoice currencies do not match';
  END IF;

  SELECT COALESCE(SUM(pa.amount), 0) INTO v_allocated_payment
  FROM public.payment_allocations pa
  WHERE pa.payment_id = NEW.payment_id AND pa.tenant_id = NEW.tenant_id AND pa.deleted_at IS NULL
    AND pa.id IS DISTINCT FROM NEW.id;
  IF NEW.amount > COALESCE(v_payment.amount, 0) - v_allocated_payment THEN RAISE EXCEPTION 'Allocation exceeds payment unallocated balance'; END IF;

  SELECT COALESCE(SUM(pa.amount), 0) INTO v_allocated_invoice
  FROM public.payment_allocations pa
  WHERE pa.invoice_id = NEW.invoice_id AND pa.tenant_id = NEW.tenant_id AND pa.deleted_at IS NULL
    AND pa.id IS DISTINCT FROM NEW.id;
  SELECT COALESCE(SUM(cn.grand_total), 0) INTO v_credit_notes
  FROM public.credit_notes cn
  WHERE cn.invoice_id = NEW.invoice_id AND cn.tenant_id = NEW.tenant_id
    AND cn.deleted_at IS NULL AND cn.voided_at IS NULL
    AND COALESCE(cn.status, '') NOT IN ('Cancelled', 'Voided');
  IF NEW.amount > COALESCE(v_invoice.grand_total, 0) - v_credit_notes - v_allocated_invoice THEN
    RAISE EXCEPTION 'Allocation exceeds invoice outstanding balance';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_payment_allocation ON public.payment_allocations;
CREATE TRIGGER trg_validate_payment_allocation
BEFORE INSERT OR UPDATE OF tenant_id, payment_id, invoice_id, amount, deleted_at
ON public.payment_allocations FOR EACH ROW EXECUTE FUNCTION public.validate_payment_allocation();

CREATE OR REPLACE FUNCTION public.refresh_invoice_payment_status(_invoice_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_summary record;
BEGIN
  SELECT * INTO v_summary FROM public.get_invoice_payment_summary(_invoice_id);
  PERFORM set_config('nimbus.allow_posted_mutation', 'on', true);
  UPDATE public.invoices
  SET amount_paid = v_summary.allocated_amount,
      balance_due = v_summary.balance_due,
      balance = v_summary.balance_due,
      updated_at = now()
  WHERE id = _invoice_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL;
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
    SELECT 1
    FROM public.invoices i
    CROSS JOIN LATERAL public.get_invoice_payment_summary(i.id) s
    WHERE i.source_order_id = _order_id
      AND i.tenant_id = public.current_tenant_id()
      AND i.deleted_at IS NULL
      AND i.voided_at IS NULL
      AND i.due_date < CURRENT_DATE
      AND s.balance_due > 0
      AND COALESCE(i.status, '') NOT IN ('Cancelled', 'Voided')
  ) INTO v_overdue;

  UPDATE public.sales_orders
  SET fulfillment_status = CASE WHEN v_ordered <= 0 OR v_fulfilled <= 0 THEN 'Not Started' WHEN v_fulfilled >= v_ordered THEN 'Fulfilled' ELSE 'Partially Fulfilled' END,
      invoice_status = CASE WHEN v_invoice_count = 0 OR v_summary.invoiced_amount <= 0 THEN 'Not Invoiced' WHEN v_summary.invoiced_amount >= v_summary.order_total THEN 'Fully Invoiced' ELSE 'Partially Invoiced' END,
      payment_status = CASE WHEN v_overdue AND v_summary.paid_amount < v_summary.order_total THEN 'Overdue' WHEN v_summary.paid_amount <= 0 THEN 'Unpaid' WHEN v_summary.paid_amount >= v_summary.order_total THEN 'Paid' ELSE 'Partially Paid' END,
      updated_at = now()
  WHERE id = _order_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_customer_ar_summary(_customer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_tenant uuid := public.current_tenant_id(); v_balance numeric;
BEGIN
  SELECT COALESCE(SUM(s.balance_due), 0) - COALESCE((SELECT SUM(p.amount - COALESCE(a.allocated, 0)) FROM public.payments_received p LEFT JOIN (SELECT payment_id, SUM(amount) allocated FROM public.payment_allocations WHERE tenant_id = v_tenant AND deleted_at IS NULL GROUP BY payment_id) a ON a.payment_id = p.id WHERE p.tenant_id = v_tenant AND p.customer_id = _customer_id AND p.deleted_at IS NULL AND p.voided_at IS NULL AND COALESCE(p.status, '') NOT IN ('Cancelled', 'Voided')), 0)
  INTO v_balance
  FROM public.invoices i
  CROSS JOIN LATERAL public.get_invoice_payment_summary(i.id) s
  WHERE i.customer_id = _customer_id AND i.tenant_id = v_tenant AND i.deleted_at IS NULL AND i.voided_at IS NULL AND COALESCE(i.status, '') NOT IN ('Cancelled', 'Voided');
  UPDATE public.customers SET balance = v_balance, updated_at = now() WHERE id = _customer_id AND tenant_id = v_tenant AND deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_payment_allocation_dependents()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_payment uuid := COALESCE(NEW.payment_id, OLD.payment_id); v_invoice uuid := COALESCE(NEW.invoice_id, OLD.invoice_id); v_customer uuid;
BEGIN
  PERFORM public.refresh_invoice_payment_status(v_invoice);
  SELECT customer_id INTO v_customer FROM public.payments_received WHERE id = v_payment;
  IF v_customer IS NOT NULL THEN PERFORM public.refresh_customer_ar_summary(v_customer); END IF;
  PERFORM public.refresh_sales_order_status(i.source_order_id) FROM public.invoices i WHERE i.id = v_invoice AND i.source_order_id IS NOT NULL;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_payment_allocation_dependents ON public.payment_allocations;
CREATE TRIGGER trg_refresh_payment_allocation_dependents
AFTER INSERT OR UPDATE OR DELETE ON public.payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.refresh_payment_allocation_dependents();

-- -----------------------------------------------------------------------------
-- Historical migration: only relationships already present in the database are
-- copied. Records without a valid relationship remain unallocated.
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.payment_applications') IS NOT NULL THEN
    -- A payment currency is sufficient only when all of its historical
    -- applications agree on one currency. Ambiguous records remain untouched.
    PERFORM set_config('nimbus.allow_posted_mutation', 'on', true);
    UPDATE public.payments_received p
    SET currency = historical.currency
    FROM (
      SELECT pa.payment_id, MIN(i.currency) AS currency
      FROM public.payment_applications pa
      JOIN public.invoices i ON i.id = pa.invoice_id AND i.tenant_id = pa.tenant_id
      WHERE i.currency IS NOT NULL
      GROUP BY pa.payment_id
      HAVING COUNT(DISTINCT i.currency) = 1
    ) historical
    WHERE p.id = historical.payment_id AND p.currency IS NULL;

    INSERT INTO public.payment_allocations (tenant_id, payment_id, invoice_id, amount, allocation_date, created_at)
    SELECT pa.tenant_id, pa.payment_id, pa.invoice_id, pa.amount, CURRENT_DATE, pa.created_at
    FROM public.payment_applications pa
    JOIN public.payments_received p ON p.id = pa.payment_id AND p.tenant_id = pa.tenant_id
    JOIN public.invoices i ON i.id = pa.invoice_id AND i.tenant_id = pa.tenant_id
    WHERE pa.amount > 0 AND p.deleted_at IS NULL AND p.voided_at IS NULL
      AND i.deleted_at IS NULL AND i.voided_at IS NULL
      AND p.customer_id IS NOT DISTINCT FROM i.customer_id
    ON CONFLICT (tenant_id, payment_id, invoice_id) WHERE deleted_at IS NULL DO NOTHING;
  END IF;
END $$;

INSERT INTO public.payment_allocations (tenant_id, payment_id, invoice_id, amount, allocation_date, created_at, created_by)
SELECT p.tenant_id, p.id, p.invoice_id, p.amount, COALESCE(p.date, CURRENT_DATE), p.created_at, p.created_by
FROM public.payments_received p
JOIN public.invoices i ON i.id = p.invoice_id AND i.tenant_id = p.tenant_id
WHERE p.invoice_id IS NOT NULL AND p.amount > 0
  AND p.deleted_at IS NULL AND p.voided_at IS NULL
  AND i.deleted_at IS NULL AND i.voided_at IS NULL
  AND p.customer_id IS NOT DISTINCT FROM i.customer_id
  AND (p.currency IS NULL OR upper(p.currency) = upper(i.currency))
  AND NOT EXISTS (SELECT 1 FROM public.payment_allocations pa WHERE pa.payment_id = p.id AND pa.invoice_id = i.id AND pa.tenant_id = p.tenant_id AND pa.deleted_at IS NULL)
ON CONFLICT (tenant_id, payment_id, invoice_id) WHERE deleted_at IS NULL DO NOTHING;

GRANT EXECUTE ON FUNCTION public.get_invoice_payment_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_allocation_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_order_financial_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_sales_order_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_invoice_payment_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_customer_ar_summary(uuid) TO authenticated;
