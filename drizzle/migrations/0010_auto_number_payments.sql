CREATE OR REPLACE FUNCTION public.assign_payment_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_next bigint;
  v_prefix text := CASE WHEN TG_TABLE_NAME = 'payments_received' THEN 'RCPT' ELSE 'PAY' END;
BEGIN
  IF NEW.number IS NULL OR btrim(NEW.number) = '' THEN
    INSERT INTO public.doc_number_sequences (tenant_id, prefix, next_value)
    VALUES (NEW.tenant_id, v_prefix, 2)
    ON CONFLICT (tenant_id, prefix) DO UPDATE
      SET next_value = public.doc_number_sequences.next_value + 1
    RETURNING next_value - 1 INTO v_next;

    NEW.number := v_prefix || '-' || to_char(COALESCE(NEW.date, CURRENT_DATE), 'YYYY') || '-' || lpad(v_next::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_assign_payment_number ON public.payments_received;
CREATE TRIGGER trg_assign_payment_number
BEFORE INSERT ON public.payments_received
FOR EACH ROW EXECUTE FUNCTION public.assign_payment_number();

DROP TRIGGER IF EXISTS trg_assign_payment_number ON public.payments_made;
CREATE TRIGGER trg_assign_payment_number
BEFORE INSERT ON public.payments_made
FOR EACH ROW EXECUTE FUNCTION public.assign_payment_number();