-- Validate the deployed schema contract after all additive migrations have run.
-- This is intentionally a diagnostic RPC plus a fail-fast migration check: it
-- never changes business data or accounting behavior.

CREATE OR REPLACE FUNCTION public.validate_schema_contract()
RETURNS TABLE (
  category text,
  object_name text,
  detail text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  RETURN QUERY
  SELECT 'table', expected.object_name, 'missing table'
  FROM (VALUES
    ('tenants'), ('profiles'), ('user_roles'), ('permissions'), ('role_permissions'),
    ('customers'), ('suppliers'), ('items'), ('warehouses'), ('bom_headers'), ('bom_lines'),
    ('invoices'), ('invoice_lines'), ('bills'), ('payments_received'), ('payments_made'),
    ('journal_entries'), ('journal_lines'), ('accounting_periods'), ('bank_accounts'),
    ('bank_transactions'), ('bank_statement_lines'), ('bank_reconciliations'),
    ('stock_movements'), ('inventory_adjustments'), ('inventory_transfers'),
    ('production_orders'), ('production_entries'), ('item_lots'), ('item_serials'),
    ('audit_logs'), ('business_events'), ('document_events'), ('payment_allocations'),
    ('supplier_payment_allocations'), ('goods_receipts'), ('goods_receipt_lines'),
    ('expenses'), ('employee_reimbursements')
  ) AS expected(object_name)
  WHERE to_regclass('public.' || expected.object_name) IS NULL;

  RETURN QUERY
  SELECT 'column', expected.table_name || '.' || expected.column_name, 'missing column'
  FROM (VALUES
    ('invoices', 'tenant_id'), ('invoices', 'posted_at'), ('invoices', 'balance_due'),
    ('bills', 'tenant_id'), ('bills', 'posted_at'), ('payments_received', 'posted_at'),
    ('payments_made', 'posted_at'), ('journal_entries', 'tenant_id'),
    ('journal_entries', 'entry_date'), ('journal_lines', 'journal_id'),
    ('accounting_periods', 'tenant_id'), ('accounting_periods', 'period_start'),
    ('bank_accounts', 'gl_account_id'), ('stock_movements', 'item_id'),
    ('production_orders', 'warehouse_id'), ('production_entries', 'production_order_id')
  ) AS expected(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = expected.table_name
      AND c.column_name = expected.column_name
  );

  RETURN QUERY
  SELECT 'rpc', expected.object_name, 'missing function signature'
  FROM (VALUES
    ('public.current_tenant_id()'),
    ('public.has_permission(text,uuid)'),
    ('public._emit_journal(uuid,date,text,text,uuid,jsonb)'),
    ('public.post_invoice(uuid)'),
    ('public.post_bill(uuid)'),
    ('public.post_payment_received(uuid)'),
    ('public.post_payment_made(uuid)'),
    ('public.post_manual_journal(uuid)'),
    ('public.manage_accounting_period(integer,integer,text,text)'),
    ('public.create_and_post_customer_payment(uuid,numeric,date,text,text,text,text,jsonb)'),
    ('public.create_supplier_payment(uuid,numeric,date,text,uuid,text,text,text)'),
    ('public.post_supplier_payment(uuid)'),
    ('public.get_sales_overview(date,date,text)')
  ) AS expected(object_name)
  WHERE to_regprocedure(expected.object_name) IS NULL;

  RETURN QUERY
  SELECT 'enum', 'public.app_role', 'missing enum'
  WHERE to_regtype('public.app_role') IS NULL;

  RETURN QUERY
  SELECT 'index', expected.object_name, 'missing index'
  FROM (VALUES
    ('idx_invoices_tenant_status_active'), ('idx_journal_entries_tenant_status'),
    ('idx_journal_lines_tenant_journal'), ('idx_payments_received_tenant_created'),
    ('idx_payments_made_tenant_created'), ('item_lots_item_lot_number_key'),
    ('item_serials_item_serial_key'), ('accounting_periods_tenant_start_idx'),
    ('payments_made_tenant_status_idx')
  ) AS expected(object_name)
  WHERE to_regclass('public.' || expected.object_name) IS NULL;

  RETURN QUERY
  SELECT 'rls', expected.object_name, 'RLS is disabled'
  FROM (VALUES
    ('invoices'), ('bills'), ('payments_received'), ('payments_made'),
    ('journal_entries'), ('journal_lines'), ('accounting_periods'), ('bank_accounts'),
    ('stock_movements'), ('production_orders'), ('audit_logs')
  ) AS expected(object_name)
  WHERE to_regclass('public.' || expected.object_name) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_class c
      WHERE c.oid = to_regclass('public.' || expected.object_name)
        AND c.relrowsecurity
    );

  RETURN QUERY
  SELECT 'policy', expected.table_name || '.' || expected.policy_name, 'missing policy'
  FROM (VALUES
    ('invoices', 'centralized_invoices_insert'),
    ('bills', 'centralized_bills_insert'),
    ('payments_made', 'centralized_payments_made_insert'),
    ('accounting_periods', 'Firm owners can modify accounting periods'),
    ('item_lots', 'item_lots tenant access'),
    ('item_serials', 'item_serials tenant access')
  ) AS expected(table_name, policy_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = expected.table_name
      AND p.policyname = expected.policy_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_schema_contract() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_schema_contract() TO service_role;

DO $$
DECLARE
  missing_count integer;
  missing_objects text;
BEGIN
  SELECT count(*), string_agg(category || ': ' || object_name, ', ' ORDER BY category, object_name)
  INTO missing_count, missing_objects
  FROM public.validate_schema_contract();
  IF missing_count > 0 THEN
    RAISE EXCEPTION 'Schema contract validation failed with % missing object checks: %', missing_count, missing_objects;
  END IF;
END;
$$;
