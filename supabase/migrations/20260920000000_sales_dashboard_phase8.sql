-- Phase 8: aggregate Sales lifecycle dashboard.

CREATE OR REPLACE FUNCTION public.get_sales_lifecycle_dashboard()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_tenant uuid := public.current_tenant_id(); v_today date := CURRENT_DATE; v_month date := date_trunc('month', CURRENT_DATE)::date; v_start date := CURRENT_DATE - 29; v_result jsonb;
BEGIN
  IF v_tenant IS NULL OR NOT public.has_permission('sales.read') THEN RAISE EXCEPTION 'Not authorized to view Sales dashboard' USING ERRCODE='42501'; END IF;
  WITH inv AS (
    SELECT i.id,i.customer_id,i.date::date document_date,i.grand_total,i.due_date,s.balance_due
    FROM public.invoices i CROSS JOIN LATERAL public.get_invoice_payment_summary(i.id) s
    WHERE i.tenant_id=v_tenant AND i.deleted_at IS NULL AND i.voided_at IS NULL AND i.posted_at IS NOT NULL AND COALESCE(i.status,'') NOT IN ('Draft','Cancelled','Voided')
  ), payments AS (
    SELECT p.date::date payment_date,p.amount FROM public.payments_received p WHERE p.tenant_id=v_tenant AND p.deleted_at IS NULL AND p.voided_at IS NULL AND p.posted_at IS NOT NULL
  ), trend AS (
    SELECT d::date AS day,COALESCE((SELECT SUM(grand_total) FROM inv WHERE document_date=d::date),0) AS sales,COALESCE((SELECT SUM(amount) FROM payments WHERE payment_date=d::date),0) AS collections FROM generate_series(v_start::timestamp,v_today::timestamp,interval '1 day') AS series(d)
  ), top_customers AS (
    SELECT c.name,SUM(i.grand_total) value FROM inv i JOIN public.customers c ON c.id=i.customer_id GROUP BY c.name ORDER BY value DESC LIMIT 5
  ), top_products AS (
    SELECT COALESCE(it.name,il.description,'Unspecified') name,SUM(il.line_total) value FROM public.invoice_lines il JOIN inv i ON i.id=il.document_id LEFT JOIN public.items it ON it.id=il.item_id WHERE il.deleted_at IS NULL GROUP BY COALESCE(it.name,il.description,'Unspecified') ORDER BY value DESC LIMIT 5
  ), aging AS (
    SELECT CASE WHEN due_date IS NULL OR due_date >= v_today THEN 'Current' WHEN v_today-due_date BETWEEN 1 AND 30 THEN '1-30' WHEN v_today-due_date BETWEEN 31 AND 60 THEN '31-60' WHEN v_today-due_date BETWEEN 61 AND 90 THEN '61-90' ELSE '90+' END bucket,SUM(balance_due) amount FROM inv WHERE balance_due>0 GROUP BY 1
  )
  SELECT jsonb_build_object(
    'metrics',jsonb_build_object(
      'todays_sales',COALESCE((SELECT SUM(grand_total) FROM inv WHERE document_date=v_today),0),
      'mtd_sales',COALESCE((SELECT SUM(grand_total) FROM inv WHERE document_date>=v_month),0),
      'orders',COALESCE((SELECT COUNT(*) FROM public.sales_orders WHERE tenant_id=v_tenant AND deleted_at IS NULL AND date::date>=v_month),0),
      'quotes_awaiting_response',COALESCE((SELECT COUNT(*) FROM public.sales_quotes WHERE tenant_id=v_tenant AND deleted_at IS NULL AND status IN ('Sent','Viewed')),0),
      'orders_awaiting_fulfillment',COALESCE((SELECT COUNT(*) FROM public.sales_orders WHERE tenant_id=v_tenant AND deleted_at IS NULL AND status IN ('Confirmed','Processing') AND fulfillment_status <> 'Fulfilled'),0),
      'outstanding_ar',COALESCE((SELECT SUM(balance_due) FROM inv WHERE balance_due>0),0),
      'overdue_ar',COALESCE((SELECT SUM(balance_due) FROM inv WHERE balance_due>0 AND due_date<v_today),0),
      'unallocated_payments',COALESCE((SELECT SUM(p.amount-COALESCE(a.allocated,0)) FROM public.payments_received p LEFT JOIN (SELECT payment_id,SUM(amount) allocated FROM public.payment_allocations WHERE tenant_id=v_tenant AND deleted_at IS NULL GROUP BY payment_id) a ON a.payment_id=p.id WHERE p.tenant_id=v_tenant AND p.deleted_at IS NULL AND p.voided_at IS NULL AND p.posted_at IS NOT NULL AND p.amount>COALESCE(a.allocated,0)),0)
    ),
    'trend',COALESCE((SELECT jsonb_agg(jsonb_build_object('x',to_char(day,'DD Mon'),'sales',sales,'collections',collections) ORDER BY day) FROM trend),'[]'::jsonb),
    'top_customers',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',name,'value',value) ORDER BY value DESC) FROM top_customers),'[]'::jsonb),
    'top_products',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',name,'value',value) ORDER BY value DESC) FROM top_products),'[]'::jsonb),
    'aging',COALESCE((SELECT jsonb_object_agg(bucket,amount) FROM aging),'{}'::jsonb),
    'quote_funnel',jsonb_build_object('created',(SELECT COUNT(*) FROM public.sales_quotes WHERE tenant_id=v_tenant AND deleted_at IS NULL AND date::date>=v_month),'sent',(SELECT COUNT(*) FROM public.sales_quotes WHERE tenant_id=v_tenant AND deleted_at IS NULL AND status IN ('Sent','Viewed','Accepted') AND date::date>=v_month),'viewed',(SELECT COUNT(*) FROM public.sales_quotes WHERE tenant_id=v_tenant AND deleted_at IS NULL AND status IN ('Viewed','Accepted') AND date::date>=v_month),'accepted',(SELECT COUNT(*) FROM public.sales_quotes WHERE tenant_id=v_tenant AND deleted_at IS NULL AND status='Accepted' AND date::date>=v_month))
  ) INTO v_result;
  RETURN v_result;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_sales_lifecycle_dashboard() TO authenticated;
