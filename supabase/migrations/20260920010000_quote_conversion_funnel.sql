CREATE OR REPLACE FUNCTION public.get_quote_conversion_report(_date_from date, _date_to date, _customer_id uuid DEFAULT NULL, _salesperson_id uuid DEFAULT NULL, _currency text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_tenant uuid := public.current_tenant_id();
  v_result jsonb;
BEGIN
  IF v_tenant IS NULL OR NOT public.has_permission('reports.read') THEN
    RAISE EXCEPTION 'Not authorized to view sales reports' USING ERRCODE = '42501';
  END IF;

  WITH quote_facts AS (
    SELECT q.id, q.status, q.grand_total, q.converted_order_id
    FROM public.sales_quotes q
    WHERE q.tenant_id = v_tenant
      AND q.deleted_at IS NULL
      AND q.date::date BETWEEN _date_from AND _date_to
      AND (_customer_id IS NULL OR q.customer_id = _customer_id)
      AND (_salesperson_id IS NULL OR q.created_by = _salesperson_id)
      AND (NULLIF(upper(trim(_currency)), '') IS NULL OR upper(q.currency) = upper(trim(_currency)))
  ),
  counts AS (
    SELECT
      COUNT(*) created,
      COUNT(*) FILTER (WHERE status IN ('Sent', 'Viewed', 'Accepted')) sent,
      COUNT(*) FILTER (WHERE status IN ('Viewed', 'Accepted')) viewed,
      COUNT(*) FILTER (WHERE status = 'Accepted') accepted,
      COUNT(*) FILTER (WHERE converted_order_id IS NOT NULL) orders,
      COALESCE(SUM(grand_total), 0) quoted_value,
      COALESCE(SUM(grand_total) FILTER (WHERE status = 'Accepted'), 0) won_value
    FROM quote_facts
  ),
  invoice_counts AS (
    SELECT COUNT(DISTINCT i.id) invoiced,
      COUNT(DISTINCT i.id) FILTER (WHERE i.amount_paid >= i.grand_total AND i.grand_total > 0) paid
    FROM quote_facts q
    JOIN public.sales_orders so ON so.id = q.converted_order_id
      AND so.tenant_id = v_tenant AND so.deleted_at IS NULL
    JOIN public.invoices i ON i.source_order_id = so.id
      AND i.tenant_id = v_tenant AND i.deleted_at IS NULL
      AND i.voided_at IS NULL AND i.posted_at IS NOT NULL
      AND COALESCE(i.status, '') NOT IN ('Draft', 'Cancelled', 'Voided')
  )
  SELECT jsonb_build_object(
    'created', c.created, 'sent', c.sent, 'viewed', c.viewed, 'accepted', c.accepted,
    'orders', c.orders, 'invoiced', ic.invoiced, 'paid', ic.paid,
    'quoted_value', c.quoted_value, 'won_value', c.won_value,
    'acceptance_rate', CASE WHEN c.created = 0 THEN 0 ELSE round(c.accepted::numeric / c.created * 100, 2) END,
    'conversion_rate', CASE WHEN c.created = 0 THEN 0 ELSE round(c.orders::numeric / c.created * 100, 2) END
  ) INTO v_result
  FROM counts c CROSS JOIN invoice_counts ic;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_quote_conversion_report(date, date, uuid, uuid, text) TO authenticated;