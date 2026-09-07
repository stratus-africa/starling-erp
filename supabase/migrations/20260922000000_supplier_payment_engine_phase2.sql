-- Phase 2: transactional supplier payment lifecycle.
-- Reuses post_payment_made and void_posted_document; no second journal engine.

ALTER TABLE public.payments_made
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS bank_account_id uuid,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Draft';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_made_bank_account_fk') THEN
    ALTER TABLE public.payments_made
      ADD CONSTRAINT payments_made_bank_account_fk
      FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_made_status_check') THEN
    ALTER TABLE public.payments_made ADD CONSTRAINT payments_made_status_check
      CHECK (status IN ('Draft', 'Posted', 'Voided'));
  END IF;
END $$;

UPDATE public.payments_made
SET status = CASE
  WHEN voided_at IS NOT NULL OR lower(COALESCE(status, '')) IN ('voided', 'void') THEN 'Voided'
  WHEN posted_at IS NOT NULL OR lower(COALESCE(status, '')) = 'posted' THEN 'Posted'
  ELSE 'Draft'
END;

INSERT INTO public.permissions (code, module, action, description) VALUES
  ('payments.allocate', 'payments', 'allocate', 'Allocate and unallocate posted supplier payments')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.role_permissions (role, permission_code)
SELECT r.role, 'payments.allocate'
FROM (VALUES ('accounting'::public.app_role), ('purchasing'::public.app_role)) AS r(role)
ON CONFLICT DO NOTHING;

-- Supplier payment creation is exposed through the RPC below. Existing direct
-- authenticated INSERT access is replaced with a transaction-local capability
-- that only the RPC sets.
DROP POLICY IF EXISTS centralized_payments_made_insert ON public.payments_made;
CREATE POLICY centralized_payments_made_insert
  ON public.payments_made FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.has_permission('payments.create')
    AND current_setting('nimbus.supplier_payment_create', true) = 'on'
  );

CREATE OR REPLACE FUNCTION public.prevent_direct_supplier_payment_posting()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.status = 'Posted' OR NEW.posted_at IS NOT NULL)
     AND OLD.posted_at IS NULL
     AND current_setting('nimbus.supplier_payment_post', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Supplier payments must be posted through the payment posting RPC';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_direct_supplier_payment_posting ON public.payments_made;
CREATE TRIGGER trg_prevent_direct_supplier_payment_posting
BEFORE UPDATE ON public.payments_made
FOR EACH ROW EXECUTE FUNCTION public.prevent_direct_supplier_payment_posting();

CREATE OR REPLACE FUNCTION public.create_supplier_payment(
  _supplier_id uuid,
  _amount numeric,
  _date date,
  _currency text,
  _bank_account_id uuid DEFAULT NULL,
  _payment_method text DEFAULT NULL,
  _reference text DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_tenant uuid := public.current_tenant_id();
  v_supplier public.suppliers;
  v_bank public.bank_accounts;
  v_currency text := upper(NULLIF(trim(_currency), ''));
  v_payment_id uuid;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No active tenant' USING ERRCODE = '42501'; END IF;
  IF NOT public.has_permission('payments.create') THEN RAISE EXCEPTION 'Not authorized: payments.create' USING ERRCODE = '42501'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;
  IF _date IS NULL THEN RAISE EXCEPTION 'Payment date is required'; END IF;
  SELECT * INTO v_supplier FROM public.suppliers
  WHERE id = _supplier_id AND tenant_id = v_tenant AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier not found for current tenant'; END IF;
  v_currency := COALESCE(v_currency, upper(NULLIF(trim(v_supplier.currency), '')));
  IF v_currency IS NULL THEN RAISE EXCEPTION 'Payment currency is required'; END IF;
  IF v_supplier.currency IS NOT NULL AND upper(v_supplier.currency) <> v_currency THEN
    RAISE EXCEPTION 'Payment currency does not match supplier currency';
  END IF;
  IF _bank_account_id IS NOT NULL THEN
    SELECT * INTO v_bank FROM public.bank_accounts
    WHERE id = _bank_account_id AND tenant_id = v_tenant AND deleted_at IS NULL AND COALESCE(status, 'Active') = 'Active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Bank or cash account not found for current tenant'; END IF;
    IF v_bank.currency IS NOT NULL AND upper(v_bank.currency) <> v_currency THEN
      RAISE EXCEPTION 'Bank account currency does not match payment currency';
    END IF;
  END IF;

  PERFORM set_config('nimbus.supplier_payment_create', 'on', true);
  INSERT INTO public.payments_made (
    tenant_id, supplier_id, amount, date, currency, bank_account_id, mode,
    reference, notes, status, created_by
  ) VALUES (
    v_tenant, _supplier_id, round(_amount, 2), _date, v_currency, _bank_account_id,
    NULLIF(trim(_payment_method), ''), NULLIF(trim(_reference), ''),
    NULLIF(trim(_notes), ''), 'Draft', auth.uid()
  ) RETURNING id INTO v_payment_id;
  PERFORM set_config('nimbus.supplier_payment_create', 'off', true);
  RETURN v_payment_id;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('nimbus.supplier_payment_create', 'off', true);
  RAISE;
END;
$$;

-- Same posting engine and journal contract, with the selected bank account's
-- GL account used as the credit side when one was captured on the payment.
CREATE OR REPLACE FUNCTION public.post_payment_made_unchecked(_payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  pmt record;
  ap_acct uuid;
  cash_acct uuid;
  pmt_amt numeric(14,2);
BEGIN
  SELECT * INTO pmt FROM public.payments_made WHERE id = _payment_id AND deleted_at IS NULL;
  IF pmt.id IS NULL THEN RAISE EXCEPTION 'Payment made not found'; END IF;
  ap_acct := public._cfg_account(pmt.tenant_id, 'accounts_payable');
  cash_acct := COALESCE(
    (SELECT gl_account_id FROM public.bank_accounts WHERE id = pmt.bank_account_id AND tenant_id = pmt.tenant_id AND deleted_at IS NULL),
    public._cfg_account(pmt.tenant_id, 'cash')
  );
  pmt_amt := COALESCE(pmt.amount, 0);
  IF ap_acct IS NULL THEN RAISE EXCEPTION 'Posting config: accounts_payable account not set'; END IF;
  IF cash_acct IS NULL THEN RAISE EXCEPTION 'Posting account for bank/cash not set'; END IF;
  IF pmt_amt <= 0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;
  PERFORM public._emit_journal(pmt.tenant_id, COALESCE(pmt.date, CURRENT_DATE),
    'Payment made ' || COALESCE(pmt.number, pmt.id::text), 'payment_made', pmt.id,
    jsonb_build_array(
      jsonb_build_object('account_id', ap_acct, 'debit', pmt_amt, 'credit', 0, 'memo', 'AP cleared'),
      jsonb_build_object('account_id', cash_acct, 'debit', 0, 'credit', pmt_amt, 'memo', 'Cash out')
    )
  );
  PERFORM set_config('nimbus.supplier_payment_post', 'on', true);
  UPDATE public.payments_made SET status = 'Posted', posted_at = now() WHERE id = _payment_id;
  PERFORM set_config('nimbus.supplier_payment_post', 'off', true);
  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (pmt.tenant_id, 'payment_made', pmt.id, 'Posted', 'Payment made posted; AP DR / Bank/Cash CR', auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));
  RETURN _payment_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.post_payment_made_unchecked(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.post_supplier_payment(_payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.has_permission('payments.post') THEN RAISE EXCEPTION 'Not authorized: payments.post' USING ERRCODE = '42501'; END IF;
  RETURN public.post_payment_made(_payment_id);
END;
$$;

-- Keep the existing JSONB API for multi-bill allocation and add the requested
-- single-bill signature for simple and retry-safe callers.
CREATE OR REPLACE FUNCTION public.allocate_supplier_payment(_payment_id uuid, _allocations jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
  FOR v_item IN SELECT value FROM jsonb_array_elements(_allocations) ORDER BY value->>'bill_id' LOOP
    SELECT * INTO v_bill FROM public.bills WHERE id = (v_item->>'bill_id')::uuid AND tenant_id = v_tenant AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found for current tenant'; END IF;
    INSERT INTO public.supplier_payment_allocations (tenant_id, payment_id, bill_id, amount, created_by, updated_by)
    VALUES (v_tenant, _payment_id, v_bill.id, round((v_item->>'amount')::numeric, 2), auth.uid(), auth.uid());
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_supplier_payment(_payment_id uuid, _bill_id uuid, _amount numeric)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN public.allocate_supplier_payment(
    _payment_id,
    jsonb_build_array(jsonb_build_object('bill_id', _bill_id, 'amount', _amount))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unallocate_supplier_payment(_allocation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.has_permission('payments.allocate') THEN RAISE EXCEPTION 'Not authorized: payments.allocate' USING ERRCODE = '42501'; END IF;
  UPDATE public.supplier_payment_allocations SET deleted_at = now(), updated_at = now(), updated_by = auth.uid()
  WHERE id = _allocation_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active supplier payment allocation not found'; END IF;
  RETURN _allocation_id;
END;
$$;

DROP POLICY IF EXISTS supplier_payment_allocations_write ON public.supplier_payment_allocations;
CREATE POLICY supplier_payment_allocations_write ON public.supplier_payment_allocations FOR ALL TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND public.has_permission('payments.allocate')
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.has_permission('payments.allocate')
  );

CREATE OR REPLACE FUNCTION public.void_supplier_payment(_payment_id uuid, _reason text DEFAULT 'Supplier payment voided')
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_reversal_id uuid;
BEGIN
  IF NOT public.has_permission('payments.void') THEN RAISE EXCEPTION 'Not authorized: payments.void' USING ERRCODE = '42501'; END IF;
  v_reversal_id := public.void_posted_document('payment_made', _payment_id, 'payments.void', _reason);
  UPDATE public.supplier_payment_allocations
  SET deleted_at = now(), updated_at = now(), updated_by = auth.uid()
  WHERE payment_id = _payment_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL;
  RETURN v_reversal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_supplier_payment(uuid, numeric, date, text, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_supplier_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_supplier_payment(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_supplier_payment(uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unallocate_supplier_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_supplier_payment(uuid, text) TO authenticated;

CREATE INDEX IF NOT EXISTS payments_made_tenant_status_idx
  ON public.payments_made (tenant_id, status, date DESC) WHERE deleted_at IS NULL;