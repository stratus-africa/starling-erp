ALTER TABLE public.stock_movements DISABLE TRIGGER USER;
ALTER TABLE public.sales_quotes DISABLE TRIGGER USER;
DO $$
DECLARE t uuid := '37911bb0-6dcf-446f-a330-b5299426b005';
BEGIN
  DELETE FROM public.sales_quote_lines WHERE tenant_id = t;
  DELETE FROM public.sales_quotes WHERE tenant_id = t;
  DELETE FROM public.stock_reservations WHERE tenant_id = t;
  DELETE FROM public.stock_movements WHERE tenant_id = t;
  DELETE FROM public.bom_lines WHERE tenant_id = t;
  DELETE FROM public.bom_headers WHERE tenant_id = t;
  DELETE FROM public.item_lots WHERE tenant_id = t;
  DELETE FROM public.item_serials WHERE tenant_id = t;
  DELETE FROM public.uom_conversions WHERE tenant_id = t;
  DELETE FROM public.items WHERE tenant_id = t;
  DELETE FROM public.item_categories WHERE tenant_id = t;
  DELETE FROM public.customers WHERE tenant_id = t;
  DELETE FROM public.suppliers WHERE tenant_id = t;
  DELETE FROM public.warehouse_locations WHERE tenant_id = t;
  DELETE FROM public.warehouse_zones WHERE tenant_id = t;
  DELETE FROM public.warehouses WHERE tenant_id = t;
END $$;
ALTER TABLE public.sales_quotes ENABLE TRIGGER USER;
ALTER TABLE public.stock_movements ENABLE TRIGGER USER;