-- Fix deployed sales overview RPCs for payment schemas that use posted_at
-- as the posting marker and do not expose payments_received.status.

CREATE OR REPLACE FUNCTION public.get_sales_overview(
  _date_from date,
  _date_to date,
  _currency text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := public.current_tenant_id();
  v_currency text := NULLIF(upper(trim(_currency)), '');
  v_result jsonb;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No active tenant' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('reports.read') THEN
    RAISE EXCEPTION 'Not authorized: reports.read' USING ERRCODE = '42501';
  END IF;
  IF _date_from IS NULL OR _date_to IS NULL OR _date_from > _date_to THEN
    RAISE EXCEPTION 'A valid reporting date range is required';
  END IF;

  WITH posted_invoices AS (
    SELECT i.date::date AS document_date, i.grand_total, i.balance_due, i.due_date
    FROM public.invoices i
    WHERE i.tenant_id = v_tenant
      AND i.deleted_at IS NULL
      AND i.voided_at IS NULL
      AND COALESCE(i.status, '') IN ('Posted', 'Sent', 'Partially Paid', 'Paid', 'Overdue')
      AND i.date::date BETWEEN _date_from AND _date_to
      AND (v_currency IS NULL OR upper(i.currency) = v_currency)
  ), posted_payments AS (
    SELECT p.date::date AS payment_date, p.amount
    FROM public.payments_received p
    WHERE p.tenant_id = v_tenant
      AND p.deleted_at IS NULL
      AND p.voided_at IS NULL
      AND p.posted_at IS NOT NULL
      AND p.date::date BETWEEN _date_from AND _date_to
      AND (v_currency IS NULL OR upper(p.currency) = v_currency)
  ), order_totals AS (
    SELECT so.grand_total
    FROM public.sales_orders so
    WHERE so.tenant_id = v_tenant
      AND so.deleted_at IS NULL
      AND so.date::date BETWEEN _date_from AND _date_to
      AND (v_currency IS NULL OR upper(so.currency) = v_currency)
  ), trend_dates AS (
    SELECT generate_series(_date_from, _date_to, interval '1 day')::date AS day
  ), trend AS (
    SELECT
      td.day,
      COALESCE((SELECT SUM(pi.grand_total) FROM posted_invoices pi WHERE pi.document_date = td.day), 0) AS sales,
      COALESCE((SELECT SUM(pp.amount) FROM posted_payments pp WHERE pp.payment_date = td.day), 0) AS collections
    FROM trend_dates td
  )
  SELECT jsonb_build_object(
    'date_from', _date_from,
    'date_to', _date_to,
    'currency', v_currency,
    'gross_sales', COALESCE((SELECT SUM(grand_total) FROM posted_invoices), 0),
    'orders', COALESCE((SELECT COUNT(*) FROM order_totals), 0),
    'average_order_value', COALESCE((SELECT AVG(grand_total) FROM order_totals), 0),
    'outstanding_ar', COALESCE((SELECT SUM(balance_due) FROM posted_invoices WHERE balance_due > 0), 0),
    'overdue_ar', COALESCE((SELECT SUM(balance_due) FROM posted_invoices WHERE balance_due > 0 AND due_date < CURRENT_DATE), 0),
    'collections', COALESCE((SELECT SUM(amount) FROM posted_payments), 0),
    'trend', COALESCE((SELECT jsonb_agg(jsonb_build_object('date', day, 'sales', sales, 'collections', collections) ORDER BY day) FROM trend), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_overview(date, date, text) TO authenticated;
