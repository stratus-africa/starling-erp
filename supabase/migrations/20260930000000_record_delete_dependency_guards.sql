-- Enforce document deletion dependencies at the database boundary.
-- Deletion remains a soft delete for records exposed by the application.

CREATE OR REPLACE FUNCTION public.guard_record_delete_dependencies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := OLD.id;
  v_tenant uuid := OLD.tenant_id;
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NULL) THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'sales_fulfillments'
     AND NOT public.has_permission('sales.delete')
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized to delete fulfilments' USING ERRCODE = '42501';
  END IF;

  IF TG_TABLE_NAME = 'sales_quotes' AND EXISTS (
    SELECT 1 FROM public.sales_orders
    WHERE tenant_id = v_tenant AND source_quote_id = v_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Quote cannot be deleted while an associated Sales Order exists. Delete the Sales Order first.' USING ERRCODE = '23503';
  END IF;

  IF TG_TABLE_NAME = 'sales_orders' AND (
    EXISTS (SELECT 1 FROM public.sales_fulfillments WHERE tenant_id = v_tenant AND sales_order_id = v_id AND deleted_at IS NULL)
    OR EXISTS (SELECT 1 FROM public.packages WHERE tenant_id = v_tenant AND sales_order_id = v_id AND deleted_at IS NULL)
    OR EXISTS (SELECT 1 FROM public.invoices WHERE tenant_id = v_tenant AND source_order_id = v_id AND deleted_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'Sales Order cannot be deleted while associated Fulfilments or Invoices exist. Delete them first.' USING ERRCODE = '23503';
  END IF;

  IF TG_TABLE_NAME = 'invoices' AND (
    EXISTS (SELECT 1 FROM public.payments_received WHERE tenant_id = v_tenant AND invoice_id = v_id AND deleted_at IS NULL)
    OR EXISTS (SELECT 1 FROM public.payment_allocations WHERE tenant_id = v_tenant AND invoice_id = v_id AND deleted_at IS NULL)
    OR EXISTS (SELECT 1 FROM public.credit_notes WHERE tenant_id = v_tenant AND invoice_id = v_id AND deleted_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'Invoice cannot be deleted while associated Payments or Credit Notes exist. Delete them first.' USING ERRCODE = '23503';
  END IF;

  IF TG_TABLE_NAME = 'payments_received' AND EXISTS (
    SELECT 1 FROM public.bank_transactions
    WHERE tenant_id = v_tenant AND source_ref_id = v_id AND reconciliation_id IS NOT NULL AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Payment cannot be deleted while it is reconciled in the bank. Undo the reconciliation first.' USING ERRCODE = '23503';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Preserve posted-document immutability while allowing a delete request to
-- change only deleted_at. Dependency triggers above still decide whether that
-- soft delete is permitted.
CREATE OR REPLACE FUNCTION public.assert_posted_document_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_posted_at timestamptz;
  old_status text;
BEGIN
  old_posted_at := (to_jsonb(OLD)->>'posted_at')::timestamptz;
  old_status := to_jsonb(OLD)->>'status';

  IF TG_OP = 'UPDATE'
     AND OLD.deleted_at IS NULL
     AND NEW.deleted_at IS NOT NULL
     AND (to_jsonb(NEW) - 'deleted_at') = (to_jsonb(OLD) - 'deleted_at') THEN
    RETURN NEW;
  END IF;

  IF current_setting('nimbus.allow_posted_mutation', true) IS DISTINCT FROM 'on' THEN
    IF TG_OP = 'DELETE' AND (old_posted_at IS NOT NULL OR lower(COALESCE(old_status, '')) IN ('voided','void','reversed','posted','completed')) THEN
      RAISE EXCEPTION 'Posted/voided % % is locked. Void it to create a reversal instead.', TG_TABLE_NAME, OLD.id
        USING ERRCODE = '55000';
    END IF;

    IF TG_OP = 'UPDATE' AND old_posted_at IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'Posted % % is locked. Void it to create a reversal instead.', TG_TABLE_NAME, OLD.id
        USING ERRCODE = '55000';
    END IF;

    IF TG_OP = 'UPDATE' AND lower(COALESCE(old_status, '')) IN ('voided','void','reversed') AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'Voided % % is locked.', TG_TABLE_NAME, OLD.id
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_quotes_delete_dependencies ON public.sales_quotes;
CREATE TRIGGER trg_sales_quotes_delete_dependencies
  BEFORE UPDATE OF deleted_at OR DELETE ON public.sales_quotes
  FOR EACH ROW EXECUTE FUNCTION public.guard_record_delete_dependencies();

DROP TRIGGER IF EXISTS trg_sales_orders_delete_dependencies ON public.sales_orders;
CREATE TRIGGER trg_sales_orders_delete_dependencies
  BEFORE UPDATE OF deleted_at OR DELETE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_record_delete_dependencies();

DROP TRIGGER IF EXISTS trg_invoices_delete_dependencies ON public.invoices;
CREATE TRIGGER trg_invoices_delete_dependencies
  BEFORE UPDATE OF deleted_at OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_record_delete_dependencies();

DROP TRIGGER IF EXISTS trg_payments_received_delete_dependencies ON public.payments_received;
CREATE TRIGGER trg_payments_received_delete_dependencies
  BEFORE UPDATE OF deleted_at OR DELETE ON public.payments_received
  FOR EACH ROW EXECUTE FUNCTION public.guard_record_delete_dependencies();

DROP TRIGGER IF EXISTS trg_sales_fulfillments_delete_dependencies ON public.sales_fulfillments;
CREATE TRIGGER trg_sales_fulfillments_delete_dependencies
  BEFORE UPDATE OF deleted_at OR DELETE ON public.sales_fulfillments
  FOR EACH ROW EXECUTE FUNCTION public.guard_record_delete_dependencies();

CREATE OR REPLACE FUNCTION public.delete_sales_fulfillment(_fulfillment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission('sales.delete') AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized to delete fulfilments' USING ERRCODE = '42501';
  END IF;

  UPDATE public.sales_fulfillments
  SET deleted_at = now(), updated_at = now(), updated_by = auth.uid()
  WHERE id = _fulfillment_id
    AND tenant_id = public.current_tenant_id()
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fulfilment not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_sales_fulfillment(uuid) TO authenticated;