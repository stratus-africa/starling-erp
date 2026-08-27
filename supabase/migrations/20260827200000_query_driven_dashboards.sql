CREATE OR REPLACE FUNCTION public.get_sales_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := public.current_tenant_id();
  v_today date := CURRENT_DATE;
  v_start date := CURRENT_DATE - 6;
  v_currency text := 'KES';
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No active tenant'; END IF;

  RETURN jsonb_build_object(
    'metrics', jsonb_build_array(
      jsonb_build_object('key','todays_sales','label',"Today's Sales",'value',COALESCE((SELECT SUM(grand_total) FROM invoices WHERE tenant_id=v_tenant AND deleted_at IS NULL AND voided_at IS NULL AND status='posted' AND COALESCE(date, posted_at::date)=v_today),0),'href','/sales/invoices'),
      jsonb_build_object('key','outstanding_receivables','label','Outstanding Receivables','value',COALESCE((SELECT SUM(balance_due) FROM invoices WHERE tenant_id=v_tenant AND deleted_at IS NULL AND voided_at IS NULL AND COALESCE(balance_due,0)>0),0),'href','/sales/invoices'),
      jsonb_build_object('key','quotes_awaiting_response','label','Quotes Awaiting Response','value',(SELECT COUNT(*) FROM sales_quotes WHERE tenant_id=v_tenant AND deleted_at IS NULL AND status IN ('sent','open','pending')),'href','/sales/quotes'),
      jsonb_build_object('key','orders_awaiting_fulfillment','label','Orders Awaiting Fulfillment','value',(SELECT COUNT(*) FROM sales_orders WHERE tenant_id=v_tenant AND deleted_at IS NULL AND status IN ('confirmed','approved','processing','open')),'href','/sales/orders'),
      jsonb_build_object('key','overdue_invoices','label','Overdue Invoices','value',(SELECT COUNT(*) FROM invoices WHERE tenant_id=v_tenant AND deleted_at IS NULL AND voided_at IS NULL AND COALESCE(balance_due,0)>0 AND due_date < v_today),'href','/sales/invoices')
    ),
    'trend', COALESCE((SELECT jsonb_agg(jsonb_build_object('x',to_char(d,'DD Mon'),'a',sales,'b',collections) ORDER BY d)
      FROM (SELECT d::date d,
        COALESCE((SELECT SUM(grand_total) FROM invoices i WHERE i.tenant_id=v_tenant AND i.deleted_at IS NULL AND i.voided_at IS NULL AND i.status='posted' AND COALESCE(i.date,i.posted_at::date)=d::date),0) sales,
        COALESCE((SELECT SUM(amount) FROM payments_received p WHERE p.tenant_id=v_tenant AND p.deleted_at IS NULL AND p.voided_at IS NULL AND COALESCE(p.date,p.posted_at::date)=d::date),0) collections
      FROM generate_series(v_start,v_today,'1 day') d) s), '[]'::jsonb),
    'top_products', COALESCE((SELECT jsonb_agg(jsonb_build_object('primary',name,'secondary',qty||' units · '||round(value,2),'status',CASE WHEN qty>0 THEN 'Top seller' ELSE '' END,'tone','success') ORDER BY value DESC)
      FROM (SELECT COALESCE(it.name, il.description) name, SUM(il.quantity) qty, SUM(il.line_total) value
            FROM invoice_lines il JOIN invoices i ON i.id=il.document_id LEFT JOIN items it ON it.id=il.item_id
            WHERE il.tenant_id=v_tenant AND il.deleted_at IS NULL AND i.deleted_at IS NULL AND i.voided_at IS NULL AND i.status='posted' AND COALESCE(i.date,i.posted_at::date) >= v_start
            GROUP BY COALESCE(it.name, il.description) LIMIT 5) p), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_sales_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sales_dashboard() TO authenticated;
