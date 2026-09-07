-- Phase 8: consolidated procurement/AP dashboard.

CREATE OR REPLACE FUNCTION public.get_purchases_dashboard(
  _date_from date DEFAULT DATE_TRUNC('month', CURRENT_DATE)::date,
  _date_to date DEFAULT CURRENT_DATE,
  _currency text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_tenant uuid := public.current_tenant_id();
  v_from date := COALESCE(_date_from, DATE_TRUNC('month', CURRENT_DATE)::date);
  v_to date := COALESCE(_date_to, CURRENT_DATE);
  v_currency text := NULLIF(upper(trim(_currency)), '');
  v_result jsonb;
BEGIN
  IF NOT public.has_permission('reports.read') THEN
    RAISE EXCEPTION 'Not authorized: reports.read' USING ERRCODE = '42501';
  END IF;

  WITH bills AS (
    SELECT b.*,
      COALESCE((SELECT SUM(a.amount) FROM public.supplier_payment_allocations a WHERE a.bill_id = b.id AND a.deleted_at IS NULL), 0) paid,
      COALESCE((SELECT SUM(a.amount) FROM public.supplier_credit_note_applications a WHERE a.bill_id = b.id AND a.deleted_at IS NULL), 0) credits
    FROM public.bills b
    WHERE b.tenant_id = v_tenant AND b.deleted_at IS NULL AND b.posted_at IS NOT NULL
      AND b.status NOT IN ('Cancelled', 'Voided') AND (v_currency IS NULL OR b.currency = v_currency)
  ),
  pos AS (
    SELECT po.* FROM public.purchase_orders po
    WHERE po.tenant_id = v_tenant AND po.deleted_at IS NULL AND po.status NOT IN ('Cancelled', 'Closed')
      AND (v_currency IS NULL OR po.currency = v_currency)
  ),
  expenses AS (
    SELECT e.* FROM public.expenses e
    WHERE e.tenant_id = v_tenant AND e.deleted_at IS NULL AND e.date BETWEEN v_from AND v_to
      AND (v_currency IS NULL OR e.currency = v_currency)
  ),
  supplier_spend AS (
    SELECT COALESCE(s.name, 'Unassigned') supplier, COALESCE(SUM(b.grand_total), 0) spend
    FROM bills b LEFT JOIN public.suppliers s ON s.id = b.supplier_id
    WHERE b.date BETWEEN v_from AND v_to GROUP BY s.name ORDER BY spend DESC LIMIT 10
  ),
  aging AS (
    SELECT
      COALESCE(SUM(CASE WHEN b.due_date IS NULL OR b.due_date >= CURRENT_DATE THEN GREATEST(0,b.grand_total-b.paid-b.credits) ELSE 0 END),0) current,
      COALESCE(SUM(CASE WHEN CURRENT_DATE-b.due_date BETWEEN 1 AND 30 THEN GREATEST(0,b.grand_total-b.paid-b.credits) ELSE 0 END),0) bucket_1_30,
      COALESCE(SUM(CASE WHEN CURRENT_DATE-b.due_date BETWEEN 31 AND 60 THEN GREATEST(0,b.grand_total-b.paid-b.credits) ELSE 0 END),0) bucket_31_60,
      COALESCE(SUM(CASE WHEN CURRENT_DATE-b.due_date BETWEEN 61 AND 90 THEN GREATEST(0,b.grand_total-b.paid-b.credits) ELSE 0 END),0) bucket_61_90,
      COALESCE(SUM(CASE WHEN CURRENT_DATE-b.due_date > 90 THEN GREATEST(0,b.grand_total-b.paid-b.credits) ELSE 0 END),0) over_90
    FROM bills b
  ),
  funnel AS (
    SELECT
      (SELECT COUNT(*) FROM public.purchase_requisitions r WHERE r.tenant_id=v_tenant AND r.date BETWEEN v_from AND v_to AND r.deleted_at IS NULL) requisitions,
      (SELECT COUNT(*) FROM public.purchase_requisitions r WHERE r.tenant_id=v_tenant AND r.date BETWEEN v_from AND v_to AND r.status IN ('Approved','Converted') AND r.deleted_at IS NULL) approved_requisitions,
      (SELECT COUNT(*) FROM public.purchase_orders po WHERE po.tenant_id=v_tenant AND po.date BETWEEN v_from AND v_to AND po.deleted_at IS NULL) purchase_orders,
      (SELECT COUNT(*) FROM public.goods_receipts gr WHERE gr.tenant_id=v_tenant AND gr.receipt_date BETWEEN v_from AND v_to AND gr.status='Posted' AND gr.deleted_at IS NULL) receipts,
      (SELECT COUNT(*) FROM bills b WHERE b.date BETWEEN v_from AND v_to) bills,
      (SELECT COUNT(*) FROM public.payments_made p WHERE p.tenant_id=v_tenant AND p.date BETWEEN v_from AND v_to AND p.posted_at IS NOT NULL AND p.deleted_at IS NULL) payments
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', v_to, 'currency', COALESCE(v_currency,'mixed')),
    'kpis', jsonb_build_object(
      'purchase_spend_today', COALESCE((SELECT SUM(b.grand_total) FROM bills b WHERE b.date=CURRENT_DATE),0),
      'purchase_spend_mtd', COALESCE((SELECT SUM(b.grand_total) FROM bills b WHERE b.date BETWEEN DATE_TRUNC('month',CURRENT_DATE)::date AND CURRENT_DATE),0),
      'open_purchase_orders', (SELECT COUNT(*) FROM pos),
      'pending_requisitions', (SELECT COUNT(*) FROM public.purchase_requisitions r WHERE r.tenant_id=v_tenant AND r.status IN ('Submitted','Pending Approval') AND r.deleted_at IS NULL),
      'pending_approvals', (SELECT COUNT(*) FROM public.approval_requests a WHERE a.tenant_id=v_tenant AND a.status='pending' AND a.entity_type IN ('purchase_requisition','supplier_bill','expense')),
      'orders_awaiting_receipt', (SELECT COUNT(*) FROM pos WHERE receiving_status <> 'Fully Received'),
      'orders_awaiting_bills', (SELECT COUNT(*) FROM pos WHERE billing_status <> 'Fully Billed'),
      'outstanding_ap', COALESCE((SELECT SUM(GREATEST(0,grand_total-paid-credits)) FROM bills),0),
      'overdue_ap', COALESCE((SELECT SUM(CASE WHEN due_date<CURRENT_DATE THEN GREATEST(0,grand_total-paid-credits) ELSE 0 END) FROM bills),0),
      'unallocated_supplier_payments', COALESCE((SELECT SUM(GREATEST(0,p.amount-COALESCE((SELECT SUM(a.amount) FROM public.supplier_payment_allocations a WHERE a.payment_id=p.id AND a.deleted_at IS NULL),0))) FROM public.payments_made p WHERE p.tenant_id=v_tenant AND p.posted_at IS NOT NULL AND p.voided_at IS NULL AND p.deleted_at IS NULL),0),
      'open_commitments', COALESCE((SELECT SUM(po.grand_total) FROM pos WHERE po.status IN ('Approved','Sent','Acknowledged')),0),
      'expense_spend_mtd', COALESCE((SELECT SUM(e.total) FROM expenses e WHERE e.date BETWEEN DATE_TRUNC('month',CURRENT_DATE)::date AND CURRENT_DATE),0),
      'outstanding_reimbursements', COALESCE((SELECT SUM(e.total) FROM expenses e WHERE e.reimbursement_status IN ('Pending','Partially Reimbursed')),0)
    ),
    'supplier_spend', COALESCE((SELECT jsonb_agg(to_jsonb(supplier_spend)) FROM supplier_spend),'[]'::jsonb),
    'ap_aging', to_jsonb((SELECT aging FROM aging)),
    'funnel', to_jsonb((SELECT funnel FROM funnel)),
    'expense_by_category', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT e.category, SUM(e.total) spend FROM expenses e GROUP BY e.category ORDER BY spend DESC LIMIT 10) x),'[]'::jsonb),
    'purchase_trend', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.period) FROM (SELECT b.date period, SUM(b.grand_total) spend FROM bills b WHERE b.date BETWEEN v_from AND v_to GROUP BY b.date) x),'[]'::jsonb),
    'match_exceptions', (SELECT COUNT(*) FROM bills b WHERE b.source_po_id IS NOT NULL AND (public.validate_supplier_bill_against_po(b.id)).match_status='Exception')
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_purchases_dashboard(date,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_purchases_dashboard(date,date,text) TO authenticated;