-- Deliberate tenant-scoped indexes for high-volume ERP tables.
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_status_active
  ON public.invoices (tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_created_active
  ON public.invoices (tenant_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_customer_active
  ON public.invoices (tenant_id, customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_number
  ON public.invoices (tenant_id, number);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_tenant_document
  ON public.invoice_lines (tenant_id, document_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_item_created
  ON public.stock_movements (tenant_id, item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_warehouse_created
  ON public.stock_movements (tenant_id, warehouse_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_ref
  ON public.stock_movements (tenant_id, ref_type, ref_id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant_status
  ON public.journal_entries (tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant_created
  ON public.journal_entries (tenant_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant_source
  ON public.journal_entries (tenant_id, source_ref_type, source_ref_id);

CREATE INDEX IF NOT EXISTS idx_journal_lines_tenant_journal
  ON public.journal_lines (tenant_id, journal_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_tenant_account
  ON public.journal_lines (tenant_id, account_id);

CREATE INDEX IF NOT EXISTS idx_payments_received_tenant_created
  ON public.payments_received (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_made_tenant_created
  ON public.payments_made (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created
  ON public.audit_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_record
  ON public.audit_logs (tenant_id, table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_user_read_created
  ON public.notifications (tenant_id, user_id, read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_orders_tenant_status_active
  ON public.sales_orders (tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sales_quotes_tenant_status_active
  ON public.sales_quotes (tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant_status_active
  ON public.purchase_orders (tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bills_tenant_status_active
  ON public.bills (tenant_id, status) WHERE deleted_at IS NULL;
