-- ============ Purchase Requisitions ============
CREATE TABLE public.purchase_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  number text,
  date date DEFAULT CURRENT_DATE,
  required_date date,
  department text,
  supplier_id uuid REFERENCES public.suppliers(id),
  requested_by uuid,
  currency text NOT NULL DEFAULT 'USD',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount_total numeric(14,2) NOT NULL DEFAULT 0,
  tax_total numeric(14,2) NOT NULL DEFAULT 0,
  grand_total numeric(14,2) NOT NULL DEFAULT 0,
  amount numeric(14,2) DEFAULT 0,
  status text DEFAULT 'Draft',
  notes text,
  converted_po_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);

CREATE TABLE public.purchase_requisition_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  document_id uuid NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  item_id uuid REFERENCES public.items(id),
  description text,
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  discount_pct numeric(6,2) NOT NULL DEFAULT 0,
  tax_pct numeric(6,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_requisitions TO authenticated;
GRANT ALL ON public.purchase_requisitions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_requisition_lines TO authenticated;
GRANT ALL ON public.purchase_requisition_lines TO service_role;

ALTER TABLE public.purchase_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_requisition_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "req_select" ON public.purchase_requisitions FOR SELECT TO authenticated
  USING ((tenant_id = public.current_tenant_id() OR public.is_super_admin()) AND deleted_at IS NULL);
CREATE POLICY "req_write" ON public.purchase_requisitions FOR ALL TO authenticated
  USING ((tenant_id = public.current_tenant_id() OR public.is_super_admin()) AND public.tenant_write_ok(ARRAY['purchasing']::app_role[]))
  WITH CHECK ((tenant_id = public.current_tenant_id() OR public.is_super_admin()) AND public.tenant_write_ok(ARRAY['purchasing']::app_role[]));

CREATE POLICY "req_lines_select" ON public.purchase_requisition_lines FOR SELECT TO authenticated
  USING ((tenant_id = public.current_tenant_id() OR public.is_super_admin()) AND deleted_at IS NULL);
CREATE POLICY "req_lines_write" ON public.purchase_requisition_lines FOR ALL TO authenticated
  USING ((tenant_id = public.current_tenant_id() OR public.is_super_admin()) AND public.tenant_write_ok(ARRAY['purchasing']::app_role[]))
  WITH CHECK ((tenant_id = public.current_tenant_id() OR public.is_super_admin()) AND public.tenant_write_ok(ARRAY['purchasing']::app_role[]));

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.purchase_requisitions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.purchase_requisition_lines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.purchase_requisitions FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- ============ Shipments posting support ============
ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS posted_at timestamptz;

-- ============ Post credit note ============
CREATE OR REPLACE FUNCTION public.post_credit_note(_credit_note_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cn credit_notes;
  j_id uuid;
  ar_acct uuid; rev_acct uuid; tax_acct uuid; cogs_acct uuid; inv_acct uuid;
  cogs_total numeric(14,2) := 0;
  line record;
  wh uuid;
BEGIN
  SELECT * INTO cn FROM credit_notes WHERE id = _credit_note_id AND deleted_at IS NULL;
  IF cn.id IS NULL THEN RAISE EXCEPTION 'Credit note not found'; END IF;
  IF cn.tenant_id <> current_tenant_id() AND NOT is_super_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF cn.posted_at IS NOT NULL THEN RAISE EXCEPTION 'Credit note already posted'; END IF;

  ar_acct   := _account_id(cn.tenant_id, '1100');
  rev_acct  := _account_id(cn.tenant_id, '4000');
  tax_acct  := _account_id(cn.tenant_id, '2000');
  cogs_acct := _account_id(cn.tenant_id, '5000');
  inv_acct  := _account_id(cn.tenant_id, '1200');

  SELECT id INTO wh FROM warehouses WHERE tenant_id = cn.tenant_id AND deleted_at IS NULL ORDER BY created_at LIMIT 1;

  -- Reverse revenue: debit revenue + tax, credit AR
  INSERT INTO journal_entries(tenant_id, entry_date, memo, source_ref_type, source_ref_id, total_debit, total_credit, created_by)
  VALUES (cn.tenant_id, CURRENT_DATE, 'Credit Note ' || COALESCE(cn.number,''), 'credit_note', cn.id, cn.grand_total, cn.grand_total, auth.uid())
  RETURNING id INTO j_id;

  INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
  VALUES (cn.tenant_id, j_id, rev_acct, cn.subtotal - cn.discount_total, 0, 'Sales returns');

  IF cn.tax_total > 0 THEN
    INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES (cn.tenant_id, j_id, tax_acct, cn.tax_total, 0, 'Tax reversed');
  END IF;

  INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
  VALUES (cn.tenant_id, j_id, ar_acct, 0, cn.grand_total, 'AR credited');

  -- Reverse inventory movements from the original sale
  FOR line IN
    SELECT cl.*, i.cost AS item_cost, i.type AS item_type
    FROM credit_note_lines cl LEFT JOIN items i ON i.id = cl.item_id
    WHERE cl.document_id = _credit_note_id AND cl.deleted_at IS NULL AND cl.item_id IS NOT NULL
  LOOP
    IF line.item_type IS NULL OR line.item_type <> 'Service' THEN
      INSERT INTO stock_movements(tenant_id, item_id, warehouse_id, quantity, unit_cost, ref_type, ref_id, note, created_by)
      VALUES (cn.tenant_id, line.item_id, wh, line.quantity, COALESCE(line.item_cost,0), 'credit_note', cn.id,
              'Return on credit note ' || COALESCE(cn.number,''), auth.uid());
      cogs_total := cogs_total + (COALESCE(line.item_cost,0) * line.quantity);
    END IF;
  END LOOP;

  IF cogs_total > 0 AND cogs_acct IS NOT NULL AND inv_acct IS NOT NULL THEN
    INSERT INTO journal_entries(tenant_id, entry_date, memo, source_ref_type, source_ref_id, total_debit, total_credit, created_by)
    VALUES (cn.tenant_id, CURRENT_DATE, 'COGS reversal for ' || COALESCE(cn.number,''), 'credit_note_cogs', cn.id, cogs_total, cogs_total, auth.uid())
    RETURNING id INTO j_id;
    INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES (cn.tenant_id, j_id, inv_acct, cogs_total, 0, 'Inventory returned');
    INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES (cn.tenant_id, j_id, cogs_acct, 0, cogs_total, 'COGS reversed');
  END IF;

  -- Reduce the linked invoice balance if present
  IF cn.invoice_id IS NOT NULL THEN
    UPDATE invoices
       SET amount_paid = LEAST(grand_total, amount_paid + cn.grand_total),
           balance_due = GREATEST(0, grand_total - (amount_paid + cn.grand_total)),
           balance     = GREATEST(0, grand_total - (amount_paid + cn.grand_total))
     WHERE id = cn.invoice_id;
  END IF;

  UPDATE credit_notes SET status = 'Issued', posted_at = now() WHERE id = _credit_note_id;

  INSERT INTO document_events(tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (cn.tenant_id, 'credit_note', cn.id, 'Issued',
          'Journal entry and inventory returns recorded', auth.uid(),
          (SELECT email FROM profiles WHERE id = auth.uid()));

  RETURN _credit_note_id;
END $$;

REVOKE ALL ON FUNCTION public.post_credit_note(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.post_credit_note(uuid) TO authenticated;

-- ============ Post shipment ============
CREATE OR REPLACE FUNCTION public.post_shipment(_shipment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sh shipments;
  pk packages;
BEGIN
  SELECT * INTO sh FROM shipments WHERE id = _shipment_id AND deleted_at IS NULL;
  IF sh.id IS NULL THEN RAISE EXCEPTION 'Shipment not found'; END IF;
  IF sh.tenant_id <> current_tenant_id() AND NOT is_super_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF sh.posted_at IS NOT NULL THEN RAISE EXCEPTION 'Shipment already confirmed'; END IF;

  IF sh.package_id IS NOT NULL THEN
    SELECT * INTO pk FROM packages WHERE id = sh.package_id AND deleted_at IS NULL;
    IF pk.id IS NOT NULL AND pk.posted_at IS NULL THEN
      PERFORM public.post_package(pk.id);
    END IF;
    UPDATE packages SET status = 'Shipped' WHERE id = sh.package_id;
  END IF;

  UPDATE shipments SET status = 'In Transit', posted_at = now() WHERE id = _shipment_id;

  INSERT INTO document_events(tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (sh.tenant_id, 'shipment', sh.id, 'In Transit',
          'Shipment confirmed; inventory movements recorded', auth.uid(),
          (SELECT email FROM profiles WHERE id = auth.uid()));

  IF sh.sales_order_id IS NOT NULL THEN
    UPDATE sales_orders SET status = 'Shipped'
     WHERE id = sh.sales_order_id AND status IN ('Draft','Confirmed','Processing','Packed');
    INSERT INTO document_events(tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
    VALUES (sh.tenant_id, 'order', sh.sales_order_id, 'Shipped',
            'Shipment ' || COALESCE(sh.number,'') || ' dispatched', auth.uid(),
            (SELECT email FROM profiles WHERE id = auth.uid()));
  END IF;

  RETURN _shipment_id;
END $$;

REVOKE ALL ON FUNCTION public.post_shipment(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.post_shipment(uuid) TO authenticated;