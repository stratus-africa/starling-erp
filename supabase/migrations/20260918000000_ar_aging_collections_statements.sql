-- Phase 6: tenant-scoped AR, aging, collections, and customer statements.

CREATE OR REPLACE FUNCTION public.get_customer_ar_summary(_customer_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_tenant uuid := public.current_tenant_id();
  v_credit numeric := 0;
  v_outstanding numeric := 0;
  v_overdue numeric := 0;
  v_unallocated numeric := 0;
BEGIN
  IF v_tenant IS NULL OR NOT public.has_permission('reports.read') THEN RAISE EXCEPTION 'Not authorized to view customer AR' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = _customer_id AND tenant_id = v_tenant AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Customer not found'; END IF;
  SELECT COALESCE(credit_limit, 0) INTO v_credit FROM public.customers WHERE id = _customer_id AND tenant_id = v_tenant;
  SELECT COALESCE(SUM(s.balance_due) FILTER (WHERE s.balance_due > 0), 0), COALESCE(SUM(s.balance_due) FILTER (WHERE s.balance_due > 0 AND i.due_date < CURRENT_DATE), 0)
  INTO v_outstanding, v_overdue
  FROM public.invoices i CROSS JOIN LATERAL public.get_invoice_payment_summary(i.id) s
  WHERE i.customer_id = _customer_id AND i.tenant_id = v_tenant AND i.deleted_at IS NULL AND i.voided_at IS NULL AND i.posted_at IS NOT NULL AND COALESCE(i.status, '') NOT IN ('Draft', 'Cancelled', 'Voided');
  SELECT COALESCE(SUM(p.amount - COALESCE(a.allocated, 0)), 0) INTO v_unallocated
  FROM public.payments_received p
  LEFT JOIN (SELECT payment_id, SUM(amount) allocated FROM public.payment_allocations WHERE tenant_id = v_tenant AND deleted_at IS NULL GROUP BY payment_id) a ON a.payment_id = p.id
  WHERE p.customer_id = _customer_id AND p.tenant_id = v_tenant AND p.deleted_at IS NULL AND p.voided_at IS NULL AND p.posted_at IS NOT NULL AND p.amount > COALESCE(a.allocated, 0);
  RETURN jsonb_build_object('customer_id', _customer_id, 'credit_limit', v_credit, 'outstanding', v_outstanding, 'overdue', v_overdue, 'available_credit', GREATEST(0, v_credit - v_outstanding), 'unallocated_payments', v_unallocated);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ar_aging(_date_from date, _date_to date, _customer_id uuid DEFAULT NULL, _salesperson_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.current_tenant_id(); v_as_of date := COALESCE(_date_to, CURRENT_DATE); v_result jsonb;
BEGIN
  IF v_tenant IS NULL OR NOT public.has_permission('reports.read') THEN RAISE EXCEPTION 'Not authorized to view AR aging' USING ERRCODE = '42501'; END IF;
  IF _date_from IS NULL OR _date_to IS NULL OR _date_from > _date_to THEN RAISE EXCEPTION 'A valid aging date range is required'; END IF;
  WITH outstanding AS (
    SELECT i.id, i.customer_id, i.number, i.date, i.due_date, i.currency, s.balance_due,
      CASE WHEN i.due_date IS NULL OR i.due_date >= v_as_of THEN 'Current' WHEN v_as_of - i.due_date BETWEEN 1 AND 30 THEN '1-30' WHEN v_as_of - i.due_date BETWEEN 31 AND 60 THEN '31-60' WHEN v_as_of - i.due_date BETWEEN 61 AND 90 THEN '61-90' ELSE '90+' END AS bucket
    FROM public.invoices i CROSS JOIN LATERAL public.get_invoice_payment_summary(i.id) s
    JOIN public.customers c ON c.id = i.customer_id AND c.tenant_id = i.tenant_id AND c.deleted_at IS NULL
    WHERE i.tenant_id = v_tenant AND i.deleted_at IS NULL AND i.voided_at IS NULL AND i.posted_at IS NOT NULL AND COALESCE(i.status, '') NOT IN ('Draft', 'Cancelled', 'Voided') AND i.date::date <= v_as_of AND (_customer_id IS NULL OR i.customer_id = _customer_id) AND (_salesperson_id IS NULL OR c.salesperson_id = _salesperson_id) AND s.balance_due > 0
  ), customers AS (
    SELECT o.customer_id, c.name, SUM(o.balance_due) FILTER (WHERE bucket = 'Current') AS current, SUM(o.balance_due) FILTER (WHERE bucket = '1-30') AS days_1_30, SUM(o.balance_due) FILTER (WHERE bucket = '31-60') AS days_31_60, SUM(o.balance_due) FILTER (WHERE bucket = '61-90') AS days_61_90, SUM(o.balance_due) FILTER (WHERE bucket = '90+') AS over_90, SUM(o.balance_due) AS total FROM outstanding o JOIN public.customers c ON c.id = o.customer_id GROUP BY o.customer_id, c.name
  )
  SELECT jsonb_build_object('date_from', _date_from, 'date_to', _date_to, 'buckets', jsonb_build_object('current', COALESCE((SELECT SUM(balance_due) FROM outstanding WHERE bucket = 'Current'), 0), 'days_1_30', COALESCE((SELECT SUM(balance_due) FROM outstanding WHERE bucket = '1-30'), 0), 'days_31_60', COALESCE((SELECT SUM(balance_due) FROM outstanding WHERE bucket = '31-60'), 0), 'days_61_90', COALESCE((SELECT SUM(balance_due) FROM outstanding WHERE bucket = '61-90'), 0), 'over_90', COALESCE((SELECT SUM(balance_due) FROM outstanding WHERE bucket = '90+'), 0)), 'rows', COALESCE((SELECT jsonb_agg(to_jsonb(customers) ORDER BY total DESC) FROM customers), '[]'::jsonb), 'invoices', COALESCE((SELECT jsonb_agg(to_jsonb(outstanding) ORDER BY due_date NULLS LAST, number) FROM outstanding), '[]'::jsonb)) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_collections_report(_date_from date, _date_to date, _customer_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.current_tenant_id(); v_result jsonb;
BEGIN
  IF v_tenant IS NULL OR NOT public.has_permission('reports.read') THEN RAISE EXCEPTION 'Not authorized to view collections' USING ERRCODE = '42501'; END IF;
  WITH inv AS (SELECT i.id, i.customer_id, i.number, i.date, i.due_date, i.grand_total, s.balance_due FROM public.invoices i CROSS JOIN LATERAL public.get_invoice_payment_summary(i.id) s WHERE i.tenant_id = v_tenant AND i.deleted_at IS NULL AND i.voided_at IS NULL AND i.posted_at IS NOT NULL AND COALESCE(i.status, '') NOT IN ('Draft','Cancelled','Voided')),
  period_inv AS (SELECT * FROM inv WHERE date::date BETWEEN _date_from AND _date_to AND (_customer_id IS NULL OR customer_id = _customer_id)),
  payments AS (SELECT p.id, p.customer_id, p.number, p.date, p.amount FROM public.payments_received p WHERE p.tenant_id = v_tenant AND p.deleted_at IS NULL AND p.voided_at IS NULL AND p.posted_at IS NOT NULL AND p.date::date BETWEEN _date_from AND _date_to AND (_customer_id IS NULL OR p.customer_id = _customer_id)),
  credits AS (SELECT cn.id, cn.customer_id, cn.number, cn.date, cn.grand_total FROM public.credit_notes cn WHERE cn.tenant_id = v_tenant AND cn.deleted_at IS NULL AND cn.voided_at IS NULL AND cn.posted_at IS NOT NULL AND COALESCE(cn.status, '') NOT IN ('Cancelled','Voided') AND cn.date::date BETWEEN _date_from AND _date_to AND (_customer_id IS NULL OR cn.customer_id = _customer_id)),
  unallocated AS (SELECT p.id, p.customer_id, p.number, p.date, p.amount - COALESCE(a.allocated, 0) AS amount FROM public.payments_received p LEFT JOIN (SELECT payment_id, SUM(amount) allocated FROM public.payment_allocations WHERE tenant_id = v_tenant AND deleted_at IS NULL GROUP BY payment_id) a ON a.payment_id = p.id WHERE p.tenant_id = v_tenant AND p.deleted_at IS NULL AND p.voided_at IS NULL AND p.posted_at IS NOT NULL AND p.amount > COALESCE(a.allocated, 0) AND (_customer_id IS NULL OR p.customer_id = _customer_id))
  SELECT jsonb_build_object('opening_ar', COALESCE((SELECT SUM(grand_total - balance_due) FROM inv WHERE date::date < _date_from), 0), 'invoices', COALESCE((SELECT SUM(grand_total) FROM period_inv), 0), 'payments', COALESCE((SELECT SUM(amount) FROM payments), 0), 'credit_notes', COALESCE((SELECT SUM(grand_total) FROM credits), 0), 'closing_ar', COALESCE((SELECT SUM(balance_due) FROM inv WHERE (_customer_id IS NULL OR customer_id = _customer_id)), 0), 'collection_rate', CASE WHEN COALESCE((SELECT SUM(grand_total) FROM period_inv), 0) = 0 THEN 0 ELSE ROUND(COALESCE((SELECT SUM(amount) FROM payments), 0) / (SELECT SUM(grand_total) FROM period_inv) * 100, 2) END, 'dso', CASE WHEN COALESCE((SELECT SUM(grand_total) FROM period_inv), 0) = 0 THEN 0 ELSE ROUND(COALESCE((SELECT SUM(balance_due) FROM inv WHERE (_customer_id IS NULL OR customer_id = _customer_id)), 0) / (SELECT SUM(grand_total) FROM period_inv) * (_date_to - _date_from + 1), 2) END, 'overdue_percent', CASE WHEN COALESCE((SELECT SUM(balance_due) FROM inv WHERE (_customer_id IS NULL OR customer_id = _customer_id)), 0) = 0 THEN 0 ELSE ROUND((SELECT SUM(balance_due) FROM inv WHERE due_date < _date_to AND balance_due > 0 AND (_customer_id IS NULL OR customer_id = _customer_id)) / (SELECT SUM(balance_due) FROM inv WHERE (_customer_id IS NULL OR customer_id = _customer_id)) * 100, 2) END, 'overdue_invoices', COALESCE((SELECT jsonb_agg(to_jsonb(inv) ORDER BY due_date) FROM inv WHERE balance_due > 0 AND due_date < _date_to AND (_customer_id IS NULL OR customer_id = _customer_id)), '[]'::jsonb), 'upcoming_invoices', COALESCE((SELECT jsonb_agg(to_jsonb(inv) ORDER BY due_date) FROM inv WHERE balance_due > 0 AND due_date >= _date_to AND (_customer_id IS NULL OR customer_id = _customer_id)), '[]'::jsonb), 'unallocated_payments', COALESCE((SELECT jsonb_agg(to_jsonb(unallocated) ORDER BY date DESC) FROM unallocated), '[]'::jsonb)) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_customer_statement(_customer_id uuid, _date_from date, _date_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.current_tenant_id(); v_result jsonb;
BEGIN
  IF v_tenant IS NULL OR NOT public.has_permission('reports.read') THEN RAISE EXCEPTION 'Not authorized to view statements' USING ERRCODE = '42501'; END IF;
  WITH tx AS (
    SELECT i.date::date AS date, 'Invoice'::text AS transaction, i.number AS reference, i.grand_total AS debit, 0::numeric AS credit FROM public.invoices i WHERE i.tenant_id = v_tenant AND i.customer_id = _customer_id AND i.deleted_at IS NULL AND i.voided_at IS NULL AND i.posted_at IS NOT NULL AND COALESCE(i.status, '') NOT IN ('Draft','Cancelled','Voided')
    UNION ALL SELECT p.date::date, 'Payment', p.number, 0::numeric, p.amount FROM public.payments_received p WHERE p.tenant_id = v_tenant AND p.customer_id = _customer_id AND p.deleted_at IS NULL AND p.voided_at IS NULL AND p.posted_at IS NOT NULL
    UNION ALL SELECT cn.date::date, 'Credit Note', cn.number, 0::numeric, cn.grand_total FROM public.credit_notes cn WHERE cn.tenant_id = v_tenant AND cn.customer_id = _customer_id AND cn.deleted_at IS NULL AND cn.voided_at IS NULL AND cn.posted_at IS NOT NULL AND COALESCE(cn.status, '') NOT IN ('Cancelled','Voided')
  ), opening AS (SELECT COALESCE(SUM(debit - credit) FILTER (WHERE date < _date_from), 0) AS balance FROM tx), period AS (SELECT * FROM tx WHERE date BETWEEN _date_from AND _date_to), running AS (SELECT p.*, (SELECT balance FROM opening) + SUM(p.debit - p.credit) OVER (ORDER BY p.date, p.reference NULLS LAST ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance FROM period p)
  SELECT jsonb_build_object('customer_id', _customer_id, 'date_from', _date_from, 'date_to', _date_to, 'opening_balance', (SELECT balance FROM opening), 'total_debits', COALESCE((SELECT SUM(debit) FROM period), 0), 'total_credits', COALESCE((SELECT SUM(credit) FROM period), 0), 'closing_balance', (SELECT balance FROM opening) + COALESCE((SELECT SUM(debit - credit) FROM period), 0), 'transactions', COALESCE((SELECT jsonb_agg(to_jsonb(running) ORDER BY date, reference) FROM running), '[]'::jsonb)) INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_ar_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ar_aging(date, date, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_collections_report(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_statement(uuid, date, date) TO authenticated;
