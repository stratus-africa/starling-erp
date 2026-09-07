-- Phase 7: database-aggregated Sales reporting.

CREATE OR REPLACE FUNCTION public.get_sales_by_customer(_date_from date, _date_to date, _customer_id uuid DEFAULT NULL, _salesperson_id uuid DEFAULT NULL, _currency text DEFAULT NULL, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.current_tenant_id(); v_currency text := NULLIF(upper(trim(_currency)), ''); v_rows jsonb;
BEGIN
  IF v_tenant IS NULL OR NOT public.has_permission('reports.read') THEN RAISE EXCEPTION 'Not authorized to view sales reports' USING ERRCODE = '42501'; END IF;
  WITH facts AS (
    SELECT i.customer_id, c.name, COUNT(DISTINCT i.source_order_id) orders, COUNT(DISTINCT i.id) invoices, SUM(i.grand_total) gross_sales, SUM(i.grand_total - COALESCE(i.discount_total,0)) net_sales, SUM(il.quantity * COALESCE(it.cost,0)) cogs, COALESCE(SUM(i.amount_paid),0) paid, COALESCE(SUM(s.balance_due),0) outstanding, COALESCE(SUM(s.balance_due) FILTER (WHERE i.due_date < CURRENT_DATE AND s.balance_due > 0),0) overdue
    FROM public.invoices i JOIN public.customers c ON c.id=i.customer_id AND c.tenant_id=i.tenant_id LEFT JOIN public.invoice_lines il ON il.document_id=i.id AND il.tenant_id=i.tenant_id AND il.deleted_at IS NULL LEFT JOIN public.items it ON it.id=il.item_id CROSS JOIN LATERAL public.get_invoice_payment_summary(i.id) s
    WHERE i.tenant_id=v_tenant AND i.deleted_at IS NULL AND i.voided_at IS NULL AND i.posted_at IS NOT NULL AND COALESCE(i.status,'') NOT IN ('Draft','Cancelled','Voided') AND i.date::date BETWEEN _date_from AND _date_to AND (_customer_id IS NULL OR i.customer_id=_customer_id) AND (_salesperson_id IS NULL OR i.created_by=_salesperson_id) AND (v_currency IS NULL OR upper(i.currency)=v_currency)
    GROUP BY i.customer_id,c.name
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(f) || jsonb_build_object('gross_profit', f.net_sales-f.cogs, 'margin_percent', CASE WHEN f.net_sales=0 THEN 0 ELSE round((f.net_sales-f.cogs)/f.net_sales*100,2) END) ORDER BY f.net_sales DESC), '[]'::jsonb) INTO v_rows FROM (SELECT * FROM facts LIMIT GREATEST(1,LEAST(_limit,500)) OFFSET GREATEST(0,_offset)) f;
  RETURN jsonb_build_object('rows',v_rows,'limit',_limit,'offset',_offset);
END; $$;

CREATE OR REPLACE FUNCTION public.get_sales_by_product(_date_from date, _date_to date, _customer_id uuid DEFAULT NULL, _salesperson_id uuid DEFAULT NULL, _product_id uuid DEFAULT NULL, _currency text DEFAULT NULL, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.current_tenant_id(); v_currency text := NULLIF(upper(trim(_currency)), ''); v_rows jsonb;
BEGIN
  IF v_tenant IS NULL OR NOT public.has_permission('reports.read') THEN RAISE EXCEPTION 'Not authorized to view sales reports' USING ERRCODE='42501'; END IF;
  WITH facts AS (
    SELECT il.item_id, COALESCE(it.name,il.description,'Unspecified') product, SUM(il.quantity) units_sold, SUM(il.line_total) gross_sales, SUM(il.quantity*il.unit_price*COALESCE(il.discount_pct,0)/100) discounts, SUM(il.line_total) net_sales, SUM(il.quantity*COALESCE(it.cost,0)) cogs
    FROM public.invoice_lines il JOIN public.invoices i ON i.id=il.document_id AND i.tenant_id=il.tenant_id LEFT JOIN public.items it ON it.id=il.item_id
    WHERE i.tenant_id=v_tenant AND il.tenant_id=v_tenant AND il.deleted_at IS NULL AND i.deleted_at IS NULL AND i.voided_at IS NULL AND i.posted_at IS NOT NULL AND COALESCE(i.status,'') NOT IN ('Draft','Cancelled','Voided') AND i.date::date BETWEEN _date_from AND _date_to AND (_customer_id IS NULL OR i.customer_id=_customer_id) AND (_salesperson_id IS NULL OR i.created_by=_salesperson_id) AND (_product_id IS NULL OR il.item_id=_product_id) AND (v_currency IS NULL OR upper(i.currency)=v_currency)
    GROUP BY il.item_id,COALESCE(it.name,il.description,'Unspecified')
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(f) || jsonb_build_object('gross_profit', f.net_sales-f.cogs, 'margin_percent', CASE WHEN f.net_sales=0 THEN 0 ELSE round((f.net_sales-f.cogs)/f.net_sales*100,2) END) ORDER BY f.net_sales DESC),'[]'::jsonb) INTO v_rows FROM (SELECT * FROM facts LIMIT GREATEST(1,LEAST(_limit,500)) OFFSET GREATEST(0,_offset)) f;
  RETURN jsonb_build_object('rows',v_rows,'limit',_limit,'offset',_offset);
END; $$;

CREATE OR REPLACE FUNCTION public.get_sales_by_salesperson(_date_from date, _date_to date, _currency text DEFAULT NULL, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.current_tenant_id(); v_currency text := NULLIF(upper(trim(_currency)), ''); v_rows jsonb;
BEGIN
  IF v_tenant IS NULL OR NOT public.has_permission('reports.read') THEN RAISE EXCEPTION 'Not authorized to view sales reports' USING ERRCODE='42501'; END IF;
  WITH facts AS (
    SELECT i.created_by salesperson_id, COALESCE(p.full_name,p.email,'Unassigned') salesperson, COUNT(DISTINCT q.id) quotes, COALESCE(SUM(q.grand_total),0) quoted_value, COUNT(DISTINCT q.id) FILTER (WHERE q.status='Accepted') accepted_quotes, COUNT(DISTINCT i.source_order_id) orders, COALESCE(SUM(so.grand_total),0) order_value, COUNT(DISTINCT i.id) invoices, SUM(i.grand_total) sales, SUM(il.quantity*COALESCE(it.cost,0)) cogs
    FROM public.invoices i LEFT JOIN public.profiles p ON p.id=i.created_by LEFT JOIN public.sales_quotes q ON q.created_by=i.created_by AND q.tenant_id=i.tenant_id AND q.deleted_at IS NULL AND q.date::date BETWEEN _date_from AND _date_to LEFT JOIN public.sales_orders so ON so.id=i.source_order_id LEFT JOIN public.invoice_lines il ON il.document_id=i.id AND il.deleted_at IS NULL LEFT JOIN public.items it ON it.id=il.item_id
    WHERE i.tenant_id=v_tenant AND i.deleted_at IS NULL AND i.voided_at IS NULL AND i.posted_at IS NOT NULL AND COALESCE(i.status,'') NOT IN ('Draft','Cancelled','Voided') AND i.date::date BETWEEN _date_from AND _date_to AND (v_currency IS NULL OR upper(i.currency)=v_currency)
    GROUP BY i.created_by,p.full_name,p.email
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(f)||jsonb_build_object('gross_profit',f.sales-f.cogs,'margin_percent',CASE WHEN f.sales=0 THEN 0 ELSE round((f.sales-f.cogs)/f.sales*100,2) END,'conversion_rate',CASE WHEN f.quotes=0 THEN 0 ELSE round(f.accepted_quotes::numeric/f.quotes*100,2) END) ORDER BY f.sales DESC),'[]'::jsonb) INTO v_rows FROM (SELECT * FROM facts LIMIT GREATEST(1,LEAST(_limit,500)) OFFSET GREATEST(0,_offset)) f;
  RETURN jsonb_build_object('rows',v_rows,'limit',_limit,'offset',_offset);
END; $$;

CREATE OR REPLACE FUNCTION public.get_quote_conversion_report(_date_from date, _date_to date, _customer_id uuid DEFAULT NULL, _salesperson_id uuid DEFAULT NULL, _currency text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_tenant uuid:=public.current_tenant_id(); v_result jsonb;
BEGIN
 IF v_tenant IS NULL OR NOT public.has_permission('reports.read') THEN RAISE EXCEPTION 'Not authorized to view sales reports' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('created',COUNT(*),'sent',COUNT(*) FILTER(WHERE status IN ('Sent','Viewed','Accepted')),'viewed',COUNT(*) FILTER(WHERE status IN ('Viewed','Accepted')),'accepted',COUNT(*) FILTER(WHERE status='Accepted'),'orders',COUNT(*) FILTER(WHERE converted_order_id IS NOT NULL),'quoted_value',COALESCE(SUM(grand_total),0),'won_value',COALESCE(SUM(grand_total) FILTER(WHERE status='Accepted'),0),'acceptance_rate',CASE WHEN COUNT(*)=0 THEN 0 ELSE round(COUNT(*) FILTER(WHERE status='Accepted')::numeric/COUNT(*)*100,2) END,'conversion_rate',CASE WHEN COUNT(*)=0 THEN 0 ELSE round(COUNT(*) FILTER(WHERE converted_order_id IS NOT NULL)::numeric/COUNT(*)*100,2) END) INTO v_result FROM public.sales_quotes WHERE tenant_id=v_tenant AND deleted_at IS NULL AND date::date BETWEEN _date_from AND _date_to AND (_customer_id IS NULL OR customer_id=_customer_id) AND (_salesperson_id IS NULL OR created_by=_salesperson_id) AND (NULLIF(upper(trim(_currency)),'') IS NULL OR upper(currency)=upper(trim(_currency)));
 RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.get_order_fulfillment_report(_date_from date, _date_to date, _customer_id uuid DEFAULT NULL, _currency text DEFAULT NULL, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_tenant uuid:=public.current_tenant_id(); v_rows jsonb;
BEGIN
 IF v_tenant IS NULL OR NOT public.has_permission('reports.read') THEN RAISE EXCEPTION 'Not authorized to view sales reports' USING ERRCODE='42501'; END IF;
 WITH facts AS (SELECT so.id,so.number,so.customer_id,c.name customer,so.date order_date,so.grand_total order_value,COALESCE(so.fulfillment_status,'Not Started') status,0::numeric fulfillment_percent,0::numeric invoice_percent,0::numeric payment_percent FROM public.sales_orders so LEFT JOIN public.customers c ON c.id=so.customer_id WHERE so.tenant_id=v_tenant AND so.deleted_at IS NULL AND so.date::date BETWEEN _date_from AND _date_to AND (_customer_id IS NULL OR so.customer_id=_customer_id) AND (NULLIF(upper(trim(_currency)),'') IS NULL OR upper(so.currency)=upper(trim(_currency)))) SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY order_date DESC),'[]'::jsonb) INTO v_rows FROM (SELECT * FROM facts LIMIT GREATEST(1,LEAST(_limit,500)) OFFSET GREATEST(0,_offset)) f;
 RETURN jsonb_build_object('rows',v_rows,'limit',_limit,'offset',_offset);
END; $$;

CREATE OR REPLACE FUNCTION public.get_sales_profitability(_date_from date, _date_to date, _group_by text DEFAULT 'customer', _customer_id uuid DEFAULT NULL, _currency text DEFAULT NULL, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_tenant uuid:=public.current_tenant_id(); v_rows jsonb;
BEGIN
 IF v_tenant IS NULL OR NOT public.has_permission('reports.read') THEN RAISE EXCEPTION 'Not authorized to view sales reports' USING ERRCODE='42501'; END IF;
 WITH facts AS (SELECT CASE WHEN _group_by='product' THEN COALESCE(it.name,il.description,'Unspecified') WHEN _group_by='invoice' THEN COALESCE(i.number,i.id::text) WHEN _group_by='order' THEN COALESCE(so.number,so.id::text) ELSE COALESCE(c.name,'Unspecified') END group_name,SUM(il.line_total) revenue,SUM(il.quantity*COALESCE(it.cost,0)) cogs FROM public.invoice_lines il JOIN public.invoices i ON i.id=il.document_id LEFT JOIN public.customers c ON c.id=i.customer_id LEFT JOIN public.items it ON it.id=il.item_id LEFT JOIN public.sales_orders so ON so.id=i.source_order_id WHERE i.tenant_id=v_tenant AND il.deleted_at IS NULL AND i.deleted_at IS NULL AND i.voided_at IS NULL AND i.posted_at IS NOT NULL AND COALESCE(i.status,'') NOT IN ('Draft','Cancelled','Voided') AND i.date::date BETWEEN _date_from AND _date_to AND (_customer_id IS NULL OR i.customer_id=_customer_id) AND (NULLIF(upper(trim(_currency)),'') IS NULL OR upper(i.currency)=upper(trim(_currency))) GROUP BY 1) SELECT COALESCE(jsonb_agg(to_jsonb(f)||jsonb_build_object('gross_profit',f.revenue-f.cogs,'margin_percent',CASE WHEN f.revenue=0 THEN 0 ELSE round((f.revenue-f.cogs)/f.revenue*100,2) END) ORDER BY f.revenue DESC),'[]'::jsonb) INTO v_rows FROM (SELECT * FROM facts LIMIT GREATEST(1,LEAST(_limit,500)) OFFSET GREATEST(0,_offset)) f;
 RETURN jsonb_build_object('rows',v_rows,'limit',_limit,'offset',_offset);
END; $$;

GRANT EXECUTE ON FUNCTION public.get_sales_by_customer(date,date,uuid,uuid,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_by_product(date,date,uuid,uuid,uuid,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_by_salesperson(date,date,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_quote_conversion_report(date,date,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_fulfillment_report(date,date,uuid,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_profitability(date,date,text,uuid,text,integer,integer) TO authenticated;
