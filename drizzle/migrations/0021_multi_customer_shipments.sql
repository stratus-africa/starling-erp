CREATE OR REPLACE FUNCTION public.replace_shipment_sales_orders(_shipment_id uuid, _sales_order_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid := public.current_tenant_id(); v_order_id uuid;
BEGIN
  IF NOT public.has_permission('sales.update') THEN RAISE EXCEPTION 'Not authorized to update shipment orders' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shipments WHERE id = _shipment_id AND tenant_id = v_tenant AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Shipment not found for current tenant'; END IF;
  IF EXISTS (SELECT 1 FROM public.shipments WHERE id = _shipment_id AND posted_at IS NOT NULL) THEN RAISE EXCEPTION 'Posted shipments cannot be changed'; END IF;
  IF cardinality(COALESCE(_sales_order_ids, ARRAY[]::uuid[])) = 0 THEN RAISE EXCEPTION 'Select at least one sales order'; END IF;
  IF (SELECT count(DISTINCT id) FROM unnest(_sales_order_ids) AS id) <> cardinality(_sales_order_ids) THEN RAISE EXCEPTION 'A sales order was selected more than once'; END IF;
  FOREACH v_order_id IN ARRAY _sales_order_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.sales_orders WHERE id = v_order_id AND tenant_id = v_tenant AND deleted_at IS NULL) THEN RAISE EXCEPTION 'One or more sales orders do not belong to this workspace'; END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM public.shipments s JOIN public.packages p ON p.id = s.package_id
    WHERE s.id = _shipment_id AND p.sales_order_id IS NOT NULL AND NOT (p.sales_order_id = ANY(_sales_order_ids))
  ) THEN RAISE EXCEPTION 'Selected package does not belong to a sales order loaded on this shipment'; END IF;
  DELETE FROM public.shipment_sales_orders WHERE shipment_id = _shipment_id AND tenant_id = v_tenant;
  INSERT INTO public.shipment_sales_orders (tenant_id, shipment_id, sales_order_id)
  SELECT v_tenant, _shipment_id, id FROM unnest(_sales_order_ids) AS id;
END; $$;

CREATE OR REPLACE FUNCTION public.post_shipment_unchecked(_shipment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sh shipments;
  pk packages;
  v_order record;
BEGIN
  SELECT * INTO sh FROM shipments WHERE id = _shipment_id AND deleted_at IS NULL;
  IF sh.id IS NULL THEN RAISE EXCEPTION 'Shipment not found'; END IF;
  IF sh.tenant_id <> current_tenant_id() AND NOT is_super_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF sh.posted_at IS NOT NULL THEN RAISE EXCEPTION 'Shipment already confirmed'; END IF;

  IF sh.package_id IS NOT NULL THEN
    SELECT * INTO pk FROM packages WHERE id = sh.package_id AND deleted_at IS NULL;
    IF pk.id IS NOT NULL AND pk.posted_at IS NULL THEN
      PERFORM public.post_package(pk.id);
    END IF;
    UPDATE packages SET status = 'Shipped' WHERE id = sh.package_id;
  END IF;

  UPDATE shipments SET status = 'In Transit', posted_at = now() WHERE id = _shipment_id;

  INSERT INTO document_events(tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (sh.tenant_id, 'shipment', sh.id, 'In Transit',
          'Shipment confirmed; inventory movements recorded', auth.uid(),
          (SELECT email FROM profiles WHERE id = auth.uid()));

  FOR v_order IN
    SELECT DISTINCT so.id FROM sales_orders so
    WHERE so.deleted_at IS NULL AND so.tenant_id = sh.tenant_id AND (
      so.id = sh.sales_order_id OR so.id IN (SELECT sales_order_id FROM shipment_sales_orders WHERE shipment_id = sh.id))
  LOOP
    UPDATE sales_orders SET status = 'Shipped'
     WHERE id = v_order.id AND status IN ('Draft','Confirmed','Processing','Packed','Partially Fulfilled');
    INSERT INTO document_events(tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
    VALUES (sh.tenant_id, 'order', v_order.id, 'Shipped',
            'Shipment ' || COALESCE(sh.number,'') || ' dispatched', auth.uid(),
            (SELECT email FROM profiles WHERE id = auth.uid()));
  END LOOP;

  RETURN _shipment_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.post_shipment_unchecked(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.replace_shipment_sales_orders(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_shipment_sales_orders(uuid, uuid[]) TO authenticated, service_role;