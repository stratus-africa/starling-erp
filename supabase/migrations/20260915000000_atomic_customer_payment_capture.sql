-- Keep customer payment creation, posting, and initial allocation atomic.
-- Unallocated receipts pass an empty allocation array and remain available for
-- later allocation from the payment detail page.

CREATE OR REPLACE FUNCTION public.create_and_post_customer_payment(
  _customer_id uuid,
  _amount numeric,
  _date date,
  _payment_method text,
  _reference text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _currency text DEFAULT NULL,
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
    _currency
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

GRANT EXECUTE ON FUNCTION public.create_and_post_customer_payment(uuid, numeric, date, text, text, text, text, jsonb)
  TO authenticated;
