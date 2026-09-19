CREATE OR REPLACE FUNCTION public.allocate_supplier_payment(_payment_id uuid, _allocations jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_payment public.payments_made;
  v_item jsonb;
  v_bill public.bills;
  v_tenant uuid := public.current_tenant_id();
  v_total numeric := 0;
  v_allocated numeric;
  v_count integer := 0;
  v_bill_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT public.has_permission('payments.allocate') THEN
    RAISE EXCEPTION 'Not authorized: payments.allocate' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_allocations) <> 'array' OR jsonb_array_length(_allocations) = 0 THEN RAISE EXCEPTION 'At least one allocation is required'; END IF;
  SELECT * INTO v_payment FROM public.payments_made WHERE id = _payment_id AND tenant_id = v_tenant AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found for current tenant'; END IF;
  IF v_payment.posted_at IS NULL OR v_payment.voided_at IS NOT NULL OR v_payment.reversal_id IS NOT NULL THEN RAISE EXCEPTION 'Payment is not valid for allocation'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(_allocations) ORDER BY value->>'bill_id' LOOP
    IF (v_item->>'bill_id') IS NULL OR (v_item->>'amount') IS NULL THEN RAISE EXCEPTION 'Each allocation requires bill_id and amount'; END IF;
    IF (v_item->>'bill_id')::uuid = ANY(v_bill_ids) THEN RAISE EXCEPTION 'Duplicate bill allocation in request'; END IF;
    v_bill_ids := array_append(v_bill_ids, (v_item->>'bill_id')::uuid);
    IF round((v_item->>'amount')::numeric, 2) <= 0 THEN RAISE EXCEPTION 'Allocation amount must be greater than zero'; END IF;
    v_total := v_total + round((v_item->>'amount')::numeric, 2);
  END LOOP;
  SELECT COALESCE(SUM(amount), 0) INTO v_allocated FROM public.supplier_payment_allocations WHERE payment_id = _payment_id AND tenant_id = v_tenant AND deleted_at IS NULL;
  IF v_total > COALESCE(v_payment.amount, 0) - v_allocated THEN RAISE EXCEPTION 'Allocation exceeds payment unallocated balance'; END IF;

  PERFORM set_config('nimbus.allow_posted_mutation', 'on', true);
  BEGIN
    FOR v_item IN SELECT value FROM jsonb_array_elements(_allocations) ORDER BY value->>'bill_id' LOOP
      SELECT * INTO v_bill FROM public.bills WHERE id = (v_item->>'bill_id')::uuid AND tenant_id = v_tenant AND deleted_at IS NULL FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found for current tenant'; END IF;
      INSERT INTO public.supplier_payment_allocations (tenant_id, payment_id, bill_id, amount, created_by, updated_by)
      VALUES (v_tenant, _payment_id, v_bill.id, round((v_item->>'amount')::numeric, 2), auth.uid(), auth.uid());
      v_count := v_count + 1;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('nimbus.allow_posted_mutation', 'off', true);
    RAISE;
  END;
  PERFORM set_config('nimbus.allow_posted_mutation', 'off', true);

  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.allocate_supplier_payment(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_supplier_payment(uuid, jsonb) TO authenticated, service_role;