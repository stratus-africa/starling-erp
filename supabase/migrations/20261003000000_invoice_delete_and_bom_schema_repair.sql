-- Targeted repairs for invoice lifecycle and deployed BOM schema drift.

ALTER TABLE public.bom_headers
  ADD COLUMN IF NOT EXISTS uom text;

COMMENT ON COLUMN public.bom_headers.uom IS
  'Finished-product stock unit of measure for the BOM header.';

CREATE OR REPLACE FUNCTION public.delete_invoice(_invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_invoice public.invoices;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('sales.delete') THEN
    RAISE EXCEPTION 'Not authorized: sales.delete' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = _invoice_id
    AND tenant_id = public.current_tenant_id()
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_invoice.posted_at IS NOT NULL OR v_invoice.status::text IN ('Posted', 'Paid', 'Partially Paid', 'Overdue', 'Voided') THEN
    RAISE EXCEPTION 'Posted invoices cannot be deleted; use void and reverse' USING ERRCODE = '55000';
  END IF;

  PERFORM set_config('nimbus.allow_posted_mutation', 'on', true);
  UPDATE public.invoices
  SET deleted_at = now(), updated_at = now()
  WHERE id = _invoice_id AND tenant_id = public.current_tenant_id();
  PERFORM set_config('nimbus.allow_posted_mutation', 'off', true);

  INSERT INTO public.document_events (
    tenant_id, entity_type, entity_id, status, note, actor_id, actor_email
  ) VALUES (
    public.current_tenant_id(), 'invoice', _invoice_id, 'Deleted',
    'Draft invoice deleted', auth.uid(),
    (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

  RETURN _invoice_id;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('nimbus.allow_posted_mutation', 'off', true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_invoice(uuid) TO authenticated;

COMMENT ON FUNCTION public.delete_invoice(uuid)
IS 'Authoritative draft-invoice deletion path. Enforces tenant scope and sales.delete; posted invoices require void and reversal.';
