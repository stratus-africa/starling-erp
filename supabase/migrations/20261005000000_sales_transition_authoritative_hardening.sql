-- Authoritative sales workflow and payment account hardening.
-- State changes must occur through RPCs; direct UPDATE bypasses are rejected.

ALTER TABLE public.payments_received
  ADD COLUMN IF NOT EXISTS bank_account_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_received_bank_account_fk') THEN
    ALTER TABLE public.payments_received
      ADD CONSTRAINT payments_received_bank_account_fk
      FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sales_status_transition_allowed(
  _entity_type text,
  _old_status text,
  _new_status text
) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(COALESCE(_entity_type, ''))
    WHEN 'quote' THEN (_old_status, _new_status) IN (
      ('Draft','Sent'), ('Draft','Cancelled'),
      ('Sent','Viewed'), ('Sent','Cancelled'),
      ('Viewed','Accepted'), ('Viewed','Rejected'), ('Viewed','Cancelled'),
      ('Accepted','Cancelled'), ('Rejected','Cancelled')
    )
    WHEN 'sales_order' THEN (_old_status, _new_status) IN (
      ('Draft','Confirmed'), ('Draft','Cancelled'),
      ('Confirmed','Processing'), ('Confirmed','Cancelled'),
      ('Processing','Completed'), ('Processing','Cancelled'),
      ('Completed','Cancelled')
    )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_direct_sales_status_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
     AND current_setting('nimbus.sales_status_transition', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Sales document status must be changed through the authoritative transition RPC';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_direct_quote_status_update ON public.sales_quotes;
CREATE TRIGGER trg_prevent_direct_quote_status_update
BEFORE UPDATE OF status ON public.sales_quotes
FOR EACH ROW EXECUTE FUNCTION public.prevent_direct_sales_status_update();

DROP TRIGGER IF EXISTS trg_prevent_direct_sales_order_status_update ON public.sales_orders;
CREATE TRIGGER trg_prevent_direct_sales_order_status_update
BEFORE UPDATE OF status ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.prevent_direct_sales_status_update();

CREATE OR REPLACE FUNCTION public.transition_quote(
  _quote_id uuid,
  _new_status text,
  _reason text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_quote public.sales_quotes;
  v_old_status text;
BEGIN
  IF NOT public.has_permission('sales.update') THEN
    RAISE EXCEPTION 'Not authorized: sales.update' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_quote
  FROM public.sales_quotes
  WHERE id = _quote_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found for current tenant';
  END IF;

  v_old_status := COALESCE(v_quote.status, 'Draft');
  IF v_old_status = _new_status THEN
    RETURN v_old_status;
  END IF;

  IF NOT public.sales_status_transition_allowed('quote', v_old_status, _new_status) THEN
    RAISE EXCEPTION 'Invalid quote transition: % -> %', v_old_status, _new_status;
  END IF;

  IF _new_status = 'Accepted' AND v_quote.expiry IS NOT NULL AND v_quote.expiry < CURRENT_DATE THEN
    RAISE EXCEPTION 'Expired quotes cannot be accepted';
  END IF;

  PERFORM set_config('nimbus.sales_status_transition', 'on', true);
  UPDATE public.sales_quotes
  SET status = _new_status,
      updated_at = now()
  WHERE id = _quote_id;
  PERFORM set_config('nimbus.sales_status_transition', 'off', true);

  PERFORM public.record_business_event(
    'status_changed',
    'sales_quote',
    _quote_id,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', _new_status),
    jsonb_build_object('reason', NULLIF(trim(_reason), ''), 'source', 'transition_quote')
  );

  RETURN _new_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_sales_order(
  _order_id uuid,
  _new_status text,
  _reason text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_order public.sales_orders;
  v_old_status text;
BEGIN
  IF NOT public.has_permission('sales.update') THEN
    RAISE EXCEPTION 'Not authorized: sales.update' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order
  FROM public.sales_orders
  WHERE id = _order_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales order not found for current tenant';
  END IF;

  v_old_status := COALESCE(v_order.status, 'Draft');
  IF v_old_status = _new_status THEN
    RETURN v_old_status;
  END IF;

  IF NOT public.sales_status_transition_allowed('sales_order', v_old_status, _new_status) THEN
    RAISE EXCEPTION 'Invalid sales order transition: % -> %', v_old_status, _new_status;
  END IF;

  IF _new_status = 'Confirmed' AND COALESCE(v_order.customer_id, NULL) IS NULL THEN
    RAISE EXCEPTION 'Sales order requires a customer before confirmation';
  END IF;

  PERFORM set_config('nimbus.sales_status_transition', 'on', true);
  UPDATE public.sales_orders
  SET status = _new_status,
      updated_at = now()
  WHERE id = _order_id;
  PERFORM set_config('nimbus.sales_status_transition', 'off', true);

  PERFORM public.record_business_event(
    'status_changed',
    'sales_order',
    _order_id,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', _new_status),
    jsonb_build_object('reason', NULLIF(trim(_reason), ''), 'source', 'transition_sales_order')
  );

  RETURN _new_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transition_quote(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_sales_order(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_status_transition_allowed(text, text, text) TO public;

CREATE OR REPLACE FUNCTION public.create_customer_payment(
  _customer_id uuid,
  _amount numeric,
  _date date,
  _payment_method text,
  _reference text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _currency text DEFAULT NULL,
  _bank_account_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := public.current_tenant_id();
  v_customer public.customers;
  v_currency text := upper(NULLIF(trim(_currency), ''));
  v_bank public.bank_accounts;
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

  IF _bank_account_id IS NOT NULL THEN
    SELECT * INTO v_bank
    FROM public.bank_accounts
    WHERE id = _bank_account_id AND tenant_id = v_tenant AND deleted_at IS NULL AND COALESCE(status, 'Active') = 'Active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Bank or cash account not found for current tenant'; END IF;
    IF v_bank.currency IS NOT NULL AND upper(v_bank.currency) <> v_currency THEN
      RAISE EXCEPTION 'Deposit account currency does not match payment currency';
    END IF;
  END IF;

  INSERT INTO public.payments_received (
    tenant_id, customer_id, amount, date, mode, reference, notes, currency,
    bank_account_id, status, created_by
  ) VALUES (
    v_tenant, _customer_id, ROUND(_amount, 2), _date, NULLIF(trim(_payment_method), ''),
    NULLIF(trim(_reference), ''), NULLIF(trim(_notes), ''), v_currency,
    _bank_account_id, 'Draft', auth.uid()
  ) RETURNING id INTO v_payment_id;

  PERFORM public.record_business_event(
    'created', 'payment_received', v_payment_id, NULL,
    jsonb_build_object('customer_id', _customer_id, 'amount', ROUND(_amount, 2), 'currency', v_currency, 'bank_account_id', _bank_account_id),
    jsonb_build_object('source', 'create_customer_payment')
  );
  RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_and_post_customer_payment(
  _customer_id uuid,
  _amount numeric,
  _date date,
  _payment_method text,
  _reference text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _currency text DEFAULT NULL,
  _bank_account_id uuid DEFAULT NULL,
  _allocations jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment_id uuid;
BEGIN
  v_payment_id := public.create_customer_payment(
    _customer_id,
    _amount,
    _date,
    _payment_method,
    _reference,
    _notes,
    _currency,
    _bank_account_id
  );

  PERFORM public.post_payment_received(v_payment_id);

  IF jsonb_typeof(_allocations) <> 'array' THEN
    RAISE EXCEPTION 'Allocations must be a JSON array';
  END IF;

  IF jsonb_array_length(_allocations) > 0 THEN
    PERFORM public.allocate_customer_payment(v_payment_id, _allocations);
  END IF;

  RETURN v_payment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_customer_payment(uuid, numeric, date, text, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_and_post_customer_payment(uuid, numeric, date, text, text, text, text, uuid, jsonb) TO authenticated;
