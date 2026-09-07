-- Phase 2: transactional customer payment lifecycle.
-- Receipt creation, posting, and allocation are deliberately separate actions.

ALTER TABLE public.payments_received
  ADD COLUMN IF NOT EXISTS notes text;

CREATE OR REPLACE FUNCTION public.create_customer_payment(
  _customer_id uuid,
  _amount numeric,
  _date date,
  _payment_method text,
  _reference text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _currency text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := public.current_tenant_id();
  v_customer public.customers;
  v_currency text := upper(NULLIF(trim(_currency), ''));
  v_payment_id uuid;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No active tenant' USING ERRCODE = '42501'; END IF;
  IF NOT public.has_permission('payments.create') THEN RAISE EXCEPTION 'Not authorized: payments.create' USING ERRCODE = '42501'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;
  IF _date IS NULL THEN RAISE EXCEPTION 'Payment date is required'; END IF;
  IF NULLIF(trim(_payment_method), '') IS NULL THEN RAISE EXCEPTION 'Payment method is required'; END IF;

  SELECT * INTO v_customer
  FROM public.customers
  WHERE id = _customer_id AND tenant_id = v_tenant AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found for current tenant'; END IF;

  v_currency := COALESCE(v_currency, upper(NULLIF(trim(v_customer.currency), '')));
  IF v_currency IS NULL THEN RAISE EXCEPTION 'Payment currency is required'; END IF;
  IF v_customer.currency IS NOT NULL AND upper(v_customer.currency) <> v_currency THEN
    RAISE EXCEPTION 'Payment currency does not match customer currency';
  END IF;

  INSERT INTO public.payments_received (
    tenant_id, customer_id, amount, date, mode, reference, notes, currency,
    status, created_by
  ) VALUES (
    v_tenant, _customer_id, ROUND(_amount, 2), _date, NULLIF(trim(_payment_method), ''),
    NULLIF(trim(_reference), ''), NULLIF(trim(_notes), ''), v_currency, 'Draft', auth.uid()
  ) RETURNING id INTO v_payment_id;

  PERFORM public.record_business_event(
    'created', 'payment_received', v_payment_id, NULL,
    jsonb_build_object('customer_id', _customer_id, 'amount', ROUND(_amount, 2), 'currency', v_currency),
    jsonb_build_object('source', 'create_customer_payment')
  );
  RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_customer_payment(
  _payment_id uuid,
  _allocations jsonb
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment public.payments_received;
  v_item jsonb;
  v_invoice public.invoices;
  v_tenant uuid := public.current_tenant_id();
  v_total numeric := 0;
  v_allocated numeric;
  v_credit_notes numeric;
  v_invoice_allocated numeric;
  v_count integer := 0;
  v_invoice_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT public.has_permission('payments.update') THEN RAISE EXCEPTION 'Not authorized: payments.update' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(_allocations) <> 'array' OR jsonb_array_length(_allocations) = 0 THEN RAISE EXCEPTION 'At least one allocation is required'; END IF;

  SELECT * INTO v_payment FROM public.payments_received
  WHERE id = _payment_id AND tenant_id = v_tenant AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found for current tenant'; END IF;
  IF v_payment.posted_at IS NULL OR COALESCE(v_payment.status, '') <> 'Posted' THEN RAISE EXCEPTION 'Only posted payments can be allocated'; END IF;
  IF v_payment.voided_at IS NOT NULL OR COALESCE(v_payment.status, '') IN ('Voided', 'Cancelled') THEN RAISE EXCEPTION 'Payment is not valid for allocation'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_allocations) ORDER BY value->>'invoice_id'
  LOOP
    IF (v_item->>'invoice_id') IS NULL OR (v_item->>'amount') IS NULL THEN RAISE EXCEPTION 'Each allocation requires invoice_id and amount'; END IF;
    IF (v_item->>'invoice_id')::uuid = ANY(v_invoice_ids) THEN RAISE EXCEPTION 'Duplicate invoice allocation in request'; END IF;
    v_invoice_ids := array_append(v_invoice_ids, (v_item->>'invoice_id')::uuid);
    IF ((v_item->>'amount')::numeric) <= 0 THEN RAISE EXCEPTION 'Allocation amount must be greater than zero'; END IF;
    v_total := v_total + round((v_item->>'amount')::numeric, 2);
  END LOOP;

  SELECT COALESCE(SUM(amount), 0) INTO v_allocated
  FROM public.payment_allocations WHERE payment_id = _payment_id AND tenant_id = v_tenant AND deleted_at IS NULL;
  IF v_total > COALESCE(v_payment.amount, 0) - v_allocated THEN RAISE EXCEPTION 'Allocation exceeds payment unallocated balance'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_allocations) ORDER BY value->>'invoice_id'
  LOOP
    SELECT * INTO v_invoice FROM public.invoices
    WHERE id = (v_item->>'invoice_id')::uuid AND tenant_id = v_tenant AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found for current tenant'; END IF;
    IF v_invoice.customer_id IS DISTINCT FROM v_payment.customer_id THEN RAISE EXCEPTION 'Payment and invoice customers do not match'; END IF;
    IF upper(COALESCE(v_invoice.currency, '')) <> upper(COALESCE(v_payment.currency, '')) THEN RAISE EXCEPTION 'Payment and invoice currencies do not match'; END IF;
    IF v_invoice.voided_at IS NOT NULL OR COALESCE(v_invoice.status, '') IN ('Voided', 'Cancelled') THEN RAISE EXCEPTION 'Invoice is not valid for allocation'; END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_invoice_allocated
    FROM public.payment_allocations WHERE invoice_id = v_invoice.id AND tenant_id = v_tenant AND deleted_at IS NULL;
    SELECT COALESCE(SUM(grand_total), 0) INTO v_credit_notes
    FROM public.credit_notes
    WHERE invoice_id = v_invoice.id AND tenant_id = v_tenant AND deleted_at IS NULL AND voided_at IS NULL
      AND COALESCE(status, '') NOT IN ('Cancelled', 'Voided');
    IF round((v_item->>'amount')::numeric, 2) > COALESCE(v_invoice.grand_total, 0) - v_credit_notes - v_invoice_allocated THEN
      RAISE EXCEPTION 'Allocation exceeds invoice outstanding balance';
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_allocations)
  LOOP
    INSERT INTO public.payment_allocations (tenant_id, payment_id, invoice_id, amount, allocation_date, created_by)
    VALUES (v_tenant, _payment_id, (v_item->>'invoice_id')::uuid, round((v_item->>'amount')::numeric, 2), CURRENT_DATE, auth.uid());
    v_count := v_count + 1;
  END LOOP;

  PERFORM public.record_business_event(
    'applied', 'payment_received', _payment_id, NULL,
    jsonb_build_object('allocations', _allocations),
    jsonb_build_object('allocation_count', v_count)
  );
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.unallocate_customer_payment(_allocation_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_allocation public.payment_allocations;
BEGIN
  IF NOT public.has_permission('payments.update') THEN RAISE EXCEPTION 'Not authorized: payments.update' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_allocation FROM public.payment_allocations
  WHERE id = _allocation_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active payment allocation not found'; END IF;

  UPDATE public.payment_allocations
  SET deleted_at = now()
  WHERE id = _allocation_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL;

  PERFORM public.record_business_event(
    'deleted', 'payment_allocation', _allocation_id,
    jsonb_build_object('payment_id', v_allocation.payment_id, 'invoice_id', v_allocation.invoice_id, 'amount', v_allocation.amount),
    NULL, jsonb_build_object('reason', 'Customer payment unallocated')
  );
  RETURN _allocation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_customer_payment(uuid, numeric, date, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_customer_payment(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unallocate_customer_payment(uuid) TO authenticated;
