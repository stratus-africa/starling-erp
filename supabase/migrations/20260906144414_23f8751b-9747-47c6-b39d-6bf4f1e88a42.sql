DO $$
DECLARE
  target_tenant uuid := 'b265bcd7-191a-401a-a69e-8a3bf0aff98e';
  tenant_table record;
  deleted_count bigint;
  remaining_count bigint;
  made_progress boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = target_tenant AND name = 'Stratus ERP'
  ) THEN
    RAISE EXCEPTION 'Expected Stratus ERP workspace was not found; deletion cancelled';
  END IF;

  DELETE FROM public.bom_lines WHERE tenant_id = target_tenant;
  DELETE FROM public.credit_note_lines WHERE tenant_id = target_tenant;
  DELETE FROM public.credit_notes WHERE tenant_id = target_tenant;
  DELETE FROM public.document_events WHERE tenant_id = target_tenant;
  DELETE FROM public.document_templates WHERE tenant_id = target_tenant;
  DELETE FROM public.email_jobs WHERE tenant_id = target_tenant;
  DELETE FROM public.expenses WHERE tenant_id = target_tenant;
  DELETE FROM public.package_lines WHERE tenant_id = target_tenant;
  DELETE FROM public.packages WHERE tenant_id = target_tenant;
  DELETE FROM public.purchase_requisition_lines WHERE tenant_id = target_tenant;
  DELETE FROM public.purchase_requisitions WHERE tenant_id = target_tenant;
  DELETE FROM public.shipments WHERE tenant_id = target_tenant;

  ALTER TABLE public.bills DISABLE TRIGGER trg_bills_posted_immutable;
  ALTER TABLE public.chart_of_accounts DISABLE TRIGGER trg_guard_system_account_delete;
  ALTER TABLE public.credit_notes DISABLE TRIGGER trg_credit_notes_posted_immutable;
  ALTER TABLE public.expenses DISABLE TRIGGER trg_expenses_posted_immutable;
  ALTER TABLE public.inventory_adjustments DISABLE TRIGGER trg_inventory_adjustments_posted_immutable;
  ALTER TABLE public.inventory_transfers DISABLE TRIGGER trg_inventory_transfers_posted_immutable;
  ALTER TABLE public.invoices DISABLE TRIGGER trg_invoices_posted_immutable;
  ALTER TABLE public.journal_entries DISABLE TRIGGER trg_journal_entries_immutable;
  ALTER TABLE public.journal_lines DISABLE TRIGGER trg_journal_lines_immutable;
  ALTER TABLE public.packages DISABLE TRIGGER trg_packages_posted_immutable;
  ALTER TABLE public.payments_made DISABLE TRIGGER trg_payments_made_posted_immutable;
  ALTER TABLE public.payments_received DISABLE TRIGGER trg_payments_received_posted_immutable;
  ALTER TABLE public.production_orders DISABLE TRIGGER trg_production_orders_posted_immutable;
  ALTER TABLE public.shipments DISABLE TRIGGER trg_shipments_posted_immutable;
  ALTER TABLE public.stock_movements DISABLE TRIGGER trg_stock_movements_no_delete;

  FOR tenant_table IN
    SELECT DISTINCT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name <> 'tenants'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', tenant_table.table_name);
  END LOOP;

  LOOP
    made_progress := false;
    remaining_count := 0;

    FOR tenant_table IN
      SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema
       AND t.table_name = c.table_name
      WHERE c.table_schema = 'public'
        AND c.column_name = 'tenant_id'
        AND t.table_type = 'BASE TABLE'
        AND c.table_name NOT IN ('tenants', 'profiles')
      ORDER BY c.table_name
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1', tenant_table.table_name)
          USING target_tenant;
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        IF deleted_count > 0 THEN
          made_progress := true;
        END IF;
      EXCEPTION WHEN foreign_key_violation THEN
        NULL;
      END;
    END LOOP;

    EXIT WHEN NOT made_progress;
  END LOOP;

  DELETE FROM public.tenants WHERE id = target_tenant;

  FOR tenant_table IN
    SELECT DISTINCT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name <> 'tenants'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', tenant_table.table_name);
  END LOOP;
  ALTER TABLE public.stock_movements ENABLE TRIGGER trg_stock_movements_no_delete;
  ALTER TABLE public.shipments ENABLE TRIGGER trg_shipments_posted_immutable;
  ALTER TABLE public.production_orders ENABLE TRIGGER trg_production_orders_posted_immutable;
  ALTER TABLE public.payments_received ENABLE TRIGGER trg_payments_received_posted_immutable;
  ALTER TABLE public.payments_made ENABLE TRIGGER trg_payments_made_posted_immutable;
  ALTER TABLE public.packages ENABLE TRIGGER trg_packages_posted_immutable;
  ALTER TABLE public.journal_lines ENABLE TRIGGER trg_journal_lines_immutable;
  ALTER TABLE public.journal_entries ENABLE TRIGGER trg_journal_entries_immutable;
  ALTER TABLE public.invoices ENABLE TRIGGER trg_invoices_posted_immutable;
  ALTER TABLE public.inventory_transfers ENABLE TRIGGER trg_inventory_transfers_posted_immutable;
  ALTER TABLE public.inventory_adjustments ENABLE TRIGGER trg_inventory_adjustments_posted_immutable;
  ALTER TABLE public.expenses ENABLE TRIGGER trg_expenses_posted_immutable;
  ALTER TABLE public.credit_notes ENABLE TRIGGER trg_credit_notes_posted_immutable;
  ALTER TABLE public.chart_of_accounts ENABLE TRIGGER trg_guard_system_account_delete;
  ALTER TABLE public.bills ENABLE TRIGGER trg_bills_posted_immutable;
END
$$;