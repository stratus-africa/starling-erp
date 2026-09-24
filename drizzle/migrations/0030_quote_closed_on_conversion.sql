CREATE OR REPLACE FUNCTION public.sales_quote_transition_allowed(_old text, _new text)
 RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE COALESCE(_old, 'Draft')
    WHEN 'Draft'     THEN _new IN ('Sent', 'Accepted', 'Cancelled')
    WHEN 'Sent'      THEN _new IN ('Viewed', 'Accepted', 'Rejected', 'Expired', 'Cancelled', 'Draft')
    WHEN 'Viewed'    THEN _new IN ('Accepted', 'Rejected', 'Expired', 'Cancelled')
    WHEN 'Accepted'  THEN _new IN ('Converted', 'Closed', 'Cancelled', 'Sent')
    WHEN 'Rejected'  THEN _new IN ('Draft', 'Sent')
    WHEN 'Expired'   THEN _new IN ('Draft', 'Sent')
    WHEN 'Cancelled' THEN _new IN ('Draft')
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.convert_quote_to_order(_quote_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  q sales_quotes;
  new_id uuid;
  new_num text;
BEGIN
  IF NOT public.has_permission('sales.create') AND NOT public.has_permission('sales.update') THEN
    RAISE EXCEPTION 'You do not have permission to convert quotes' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO q FROM sales_quotes WHERE id = _quote_id AND deleted_at IS NULL FOR UPDATE;
  IF q.id IS NULL THEN RAISE EXCEPTION 'Quote not found'; END IF;
  IF q.tenant_id <> current_tenant_id() AND NOT is_super_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF q.converted_order_id IS NOT NULL THEN RETURN q.converted_order_id; END IF;
  IF COALESCE(q.status,'Draft') <> 'Accepted' THEN
    RAISE EXCEPTION 'Only an accepted quote can be converted to a sales order';
  END IF;

  new_num := 'SO-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,6);

  INSERT INTO sales_orders(tenant_id, number, customer_id, date, status, subtotal, discount_total, tax_total, grand_total, amount, notes, currency, source_quote_id, created_by, salesperson_id)
  VALUES (q.tenant_id, new_num, q.customer_id, CURRENT_DATE, 'Draft', q.subtotal, q.discount_total, q.tax_total, q.grand_total, q.grand_total, q.notes, q.currency, q.id, auth.uid(), q.salesperson_id)
  RETURNING id INTO new_id;

  INSERT INTO sales_order_lines(tenant_id, document_id, line_no, item_id, description, quantity, unit_price, discount_pct, tax_pct, line_total)
  SELECT tenant_id, new_id, line_no, item_id, description, quantity, unit_price, discount_pct, tax_pct, line_total
  FROM sales_quote_lines WHERE document_id = _quote_id AND deleted_at IS NULL;

  UPDATE sales_quotes SET converted_order_id = new_id, status = 'Closed', updated_at = now() WHERE id = _quote_id;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (q.tenant_id, 'quote', _quote_id, 'Closed', format('Converted to sales order %s; quote closed', new_num),
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));
  RETURN new_id;
END $function$;

CREATE OR REPLACE FUNCTION public.guard_closed_quote()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF COALESCE(OLD.status,'') = 'Closed' THEN
    RAISE EXCEPTION 'Quote % is closed and can no longer be changed', OLD.number;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION public.guard_closed_quote_lines()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.sales_quotes q
             WHERE q.id = COALESCE(NEW.document_id, OLD.document_id) AND q.status = 'Closed') THEN
    RAISE EXCEPTION 'This quote is closed and its lines can no longer be changed';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_guard_closed_quote ON public.sales_quotes;
CREATE TRIGGER trg_guard_closed_quote BEFORE UPDATE OR DELETE ON public.sales_quotes
  FOR EACH ROW EXECUTE FUNCTION public.guard_closed_quote();
DROP TRIGGER IF EXISTS trg_guard_closed_quote_lines ON public.sales_quote_lines;
CREATE TRIGGER trg_guard_closed_quote_lines BEFORE INSERT OR UPDATE OR DELETE ON public.sales_quote_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_closed_quote_lines();

-- Close quotes already converted
ALTER TABLE public.sales_quotes DISABLE TRIGGER trg_guard_closed_quote;
UPDATE public.sales_quotes SET status = 'Closed' WHERE converted_order_id IS NOT NULL AND status IS DISTINCT FROM 'Closed';
ALTER TABLE public.sales_quotes ENABLE TRIGGER trg_guard_closed_quote;