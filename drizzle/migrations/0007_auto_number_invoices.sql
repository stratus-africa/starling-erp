CREATE OR REPLACE FUNCTION public.assign_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_next bigint;
  v_prefix text := 'INV';
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

DROP TRIGGER IF EXISTS trg_assign_invoice_number ON public.invoices;
CREATE TRIGGER trg_assign_invoice_number
BEFORE INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.assign_invoice_number();