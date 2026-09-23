-- packages links to a sales order through sales_order_id (not order_id).
CREATE OR REPLACE FUNCTION public.transition_sales_order(_order_id uuid, _new_status text, _reason text DEFAULT NULL::text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_order     public.sales_orders;
  v_old       text;
  v_lines     integer;
  v_invoices  integer;
  v_packages  integer;
BEGIN
  IF _new_status IS NULL OR btrim(_new_status) = '' THEN
    RAISE EXCEPTION 'A target status is required';
  END IF;
  IF NOT public.has_permission('sales.update') THEN
    RAISE EXCEPTION 'You do not have permission to change a sales order status' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order
  FROM public.sales_orders
  WHERE id = _order_id
    AND tenant_id = public.current_tenant_id()
    AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales order not found in your workspace';
  END IF;

  v_old := COALESCE(v_order.status, 'Draft');
  IF v_old = _new_status THEN RETURN v_old; END IF;

  IF NOT public.sales_order_transition_allowed(v_old, _new_status) THEN
    RAISE EXCEPTION 'A sales order cannot move from % to %', v_old, _new_status;
  END IF;

  SELECT count(*) INTO v_lines
  FROM public.sales_order_lines
  WHERE document_id = _order_id
    AND tenant_id = v_order.tenant_id
    AND deleted_at IS NULL
    AND quantity > 0;

  IF _new_status = 'Confirmed' THEN
    IF v_order.customer_id IS NULL THEN
      RAISE EXCEPTION 'Add a customer before confirming this sales order';
    END IF;
    IF v_lines = 0 THEN
      RAISE EXCEPTION 'Add at least one line item before confirming this sales order';
    END IF;
    IF COALESCE(v_order.grand_total, 0) < 0 THEN
      RAISE EXCEPTION 'This sales order total is negative and cannot be confirmed';
    END IF;
  END IF;

  IF _new_status IN ('Cancelled', 'Draft') THEN
    SELECT count(*) INTO v_invoices
    FROM public.invoices
    WHERE tenant_id = v_order.tenant_id
      AND source_order_id = _order_id
      AND deleted_at IS NULL
      AND COALESCE(status, 'Draft') <> 'Cancelled';

    SELECT count(*) INTO v_packages
    FROM public.packages
    WHERE tenant_id = v_order.tenant_id
      AND sales_order_id = _order_id
      AND deleted_at IS NULL
      AND COALESCE(status, 'Draft') <> 'Cancelled';

    IF v_invoices > 0 THEN
      RAISE EXCEPTION 'This sales order already has % invoice(s) and cannot be %', v_invoices, lower(_new_status);
    END IF;
    IF v_packages > 0 THEN
      RAISE EXCEPTION 'This sales order already has % package(s) and cannot be %', v_packages, lower(_new_status);
    END IF;
  END IF;

  UPDATE public.sales_orders
  SET status = _new_status, updated_at = now()
  WHERE id = _order_id;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (v_order.tenant_id, 'order', _order_id, _new_status,
          COALESCE(_reason, format('Sales order moved from %s to %s', v_old, _new_status)),
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));

  RETURN _new_status;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_sales_order(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_sales_order(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.transition_sales_order(uuid, text, text) TO authenticated, service_role;
