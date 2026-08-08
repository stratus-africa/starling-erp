
-- 1. Document events (status timeline)
CREATE TABLE public.document_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  status text NOT NULL,
  note text,
  actor_id uuid,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_events_entity_idx ON public.document_events(entity_type, entity_id, created_at);
GRANT SELECT, INSERT ON public.document_events TO authenticated;
GRANT ALL ON public.document_events TO service_role;
ALTER TABLE public.document_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_events_select ON public.document_events FOR SELECT TO authenticated
  USING ((tenant_id = current_tenant_id()) OR is_super_admin());
CREATE POLICY document_events_insert ON public.document_events FOR INSERT TO authenticated
  WITH CHECK (tenant_id = current_tenant_id());

-- 2. PDF templates / branding
CREATE TABLE public.document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  accent_color text NOT NULL DEFAULT '#1E293B',
  logo_url text,
  company_address text,
  footer_text text,
  terms text,
  show_logo boolean NOT NULL DEFAULT true,
  applies_to text[] NOT NULL DEFAULT ARRAY['quote','order','invoice','package','credit_note'],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_templates TO authenticated;
GRANT ALL ON public.document_templates TO service_role;
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_templates_select ON public.document_templates FOR SELECT TO authenticated
  USING ((tenant_id = current_tenant_id()) OR is_super_admin());
CREATE POLICY document_templates_write ON public.document_templates FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id() AND tenant_write_ok(ARRAY['tenant_admin'::app_role]))
  WITH CHECK (tenant_id = current_tenant_id() AND tenant_write_ok(ARRAY['tenant_admin'::app_role]));
CREATE TRIGGER document_templates_updated_at BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 3. Email queue
CREATE TABLE public.email_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  entity_type text,
  entity_id uuid,
  to_email text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL DEFAULT '',
  filename text,
  pdf_base64 text,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  last_error text,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_jobs_entity_idx ON public.email_jobs(entity_type, entity_id, created_at DESC);
CREATE INDEX email_jobs_status_idx ON public.email_jobs(status);
GRANT SELECT, INSERT, UPDATE ON public.email_jobs TO authenticated;
GRANT ALL ON public.email_jobs TO service_role;
ALTER TABLE public.email_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_jobs_select ON public.email_jobs FOR SELECT TO authenticated
  USING ((tenant_id = current_tenant_id()) OR is_super_admin());
CREATE POLICY email_jobs_insert ON public.email_jobs FOR INSERT TO authenticated
  WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY email_jobs_update ON public.email_jobs FOR UPDATE TO authenticated
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE TRIGGER email_jobs_updated_at BEFORE UPDATE ON public.email_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 4. Credit notes
CREATE TABLE public.credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  number text,
  customer_id uuid REFERENCES public.customers(id),
  invoice_id uuid REFERENCES public.invoices(id),
  date date DEFAULT CURRENT_DATE,
  reason text,
  currency text NOT NULL DEFAULT 'USD',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount_total numeric(14,2) NOT NULL DEFAULT 0,
  tax_total numeric(14,2) NOT NULL DEFAULT 0,
  grand_total numeric(14,2) NOT NULL DEFAULT 0,
  amount numeric(14,2) DEFAULT 0,
  status text DEFAULT 'Draft',
  notes text,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_notes TO authenticated;
GRANT ALL ON public.credit_notes TO service_role;
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY credit_notes_select ON public.credit_notes FOR SELECT TO authenticated
  USING ((tenant_id = current_tenant_id()) OR is_super_admin());
CREATE POLICY credit_notes_write ON public.credit_notes FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id() AND tenant_write_ok(ARRAY['tenant_admin'::app_role,'sales'::app_role,'accounting'::app_role]))
  WITH CHECK (tenant_id = current_tenant_id() AND tenant_write_ok(ARRAY['tenant_admin'::app_role,'sales'::app_role,'accounting'::app_role]));
CREATE TRIGGER credit_notes_updated_at BEFORE UPDATE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE public.credit_note_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  document_id uuid NOT NULL REFERENCES public.credit_notes(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  item_id uuid REFERENCES public.items(id),
  description text NOT NULL DEFAULT '',
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  discount_pct numeric(6,2) NOT NULL DEFAULT 0,
  tax_pct numeric(6,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX credit_note_lines_doc_idx ON public.credit_note_lines(document_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_note_lines TO authenticated;
GRANT ALL ON public.credit_note_lines TO service_role;
ALTER TABLE public.credit_note_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY credit_note_lines_select ON public.credit_note_lines FOR SELECT TO authenticated
  USING ((tenant_id = current_tenant_id()) OR is_super_admin());
CREATE POLICY credit_note_lines_write ON public.credit_note_lines FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id() AND tenant_write_ok(ARRAY['tenant_admin'::app_role,'sales'::app_role,'accounting'::app_role]))
  WITH CHECK (tenant_id = current_tenant_id() AND tenant_write_ok(ARRAY['tenant_admin'::app_role,'sales'::app_role,'accounting'::app_role]));
CREATE TRIGGER credit_note_lines_updated_at BEFORE UPDATE ON public.credit_note_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 5. Shipments
CREATE TABLE public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  number text,
  package_id uuid REFERENCES public.packages(id),
  sales_order_id uuid REFERENCES public.sales_orders(id),
  customer_id uuid REFERENCES public.customers(id),
  carrier text,
  service_level text,
  tracking text,
  ship_date date DEFAULT CURRENT_DATE,
  delivery_date date,
  cost numeric(14,2) DEFAULT 0,
  status text DEFAULT 'Ready',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);
CREATE INDEX shipments_package_idx ON public.shipments(package_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipments TO authenticated;
GRANT ALL ON public.shipments TO service_role;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY shipments_select ON public.shipments FOR SELECT TO authenticated
  USING ((tenant_id = current_tenant_id()) OR is_super_admin());
CREATE POLICY shipments_write ON public.shipments FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id() AND tenant_write_ok(ARRAY['tenant_admin'::app_role,'sales'::app_role,'inventory'::app_role]))
  WITH CHECK (tenant_id = current_tenant_id() AND tenant_write_ok(ARRAY['tenant_admin'::app_role,'sales'::app_role,'inventory'::app_role]));
CREATE TRIGGER shipments_updated_at BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 6. post_package logs a status event
CREATE OR REPLACE FUNCTION public.post_package(_package_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  pk packages;
  j_id uuid;
  cogs_acct uuid; inv_acct uuid;
  cogs_total numeric(14,2) := 0;
  line record;
  wh uuid;
BEGIN
  SELECT * INTO pk FROM packages WHERE id = _package_id AND deleted_at IS NULL;
  IF pk.id IS NULL THEN RAISE EXCEPTION 'Package not found'; END IF;
  IF pk.tenant_id <> current_tenant_id() AND NOT is_super_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF pk.posted_at IS NOT NULL THEN RAISE EXCEPTION 'Package already confirmed'; END IF;

  cogs_acct := _account_id(pk.tenant_id, '5000');
  inv_acct  := _account_id(pk.tenant_id, '1200');

  wh := pk.warehouse_id;
  IF wh IS NULL THEN
    SELECT id INTO wh FROM warehouses WHERE tenant_id = pk.tenant_id AND deleted_at IS NULL ORDER BY created_at LIMIT 1;
  END IF;

  FOR line IN
    SELECT pl.*, i.cost AS item_cost, i.type AS item_type
    FROM package_lines pl LEFT JOIN items i ON i.id = pl.item_id
    WHERE pl.document_id = _package_id AND pl.deleted_at IS NULL AND pl.item_id IS NOT NULL
  LOOP
    IF line.item_type IS NULL OR line.item_type <> 'Service' THEN
      INSERT INTO stock_movements(tenant_id, item_id, warehouse_id, quantity, unit_cost, ref_type, ref_id, note, created_by)
      VALUES (pk.tenant_id, line.item_id, wh, -line.quantity, COALESCE(line.item_cost,0), 'package', pk.id, 'Package ' || COALESCE(pk.number,''), auth.uid());
      cogs_total := cogs_total + (COALESCE(line.item_cost,0) * line.quantity);
    END IF;
  END LOOP;

  IF cogs_total > 0 AND cogs_acct IS NOT NULL AND inv_acct IS NOT NULL THEN
    INSERT INTO journal_entries(tenant_id, entry_date, memo, source_ref_type, source_ref_id, total_debit, total_credit, created_by)
    VALUES (pk.tenant_id, CURRENT_DATE, 'Shipment ' || COALESCE(pk.number,''), 'package', pk.id, cogs_total, cogs_total, auth.uid())
    RETURNING id INTO j_id;
    INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES (pk.tenant_id, j_id, cogs_acct, cogs_total, 0, 'COGS');
    INSERT INTO journal_lines(tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES (pk.tenant_id, j_id, inv_acct, 0, cogs_total, 'Inventory');
  END IF;

  UPDATE packages SET status = 'Packed', posted_at = now() WHERE id = _package_id;

  INSERT INTO document_events(tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (pk.tenant_id, 'package', pk.id, 'Posted',
          'Inventory movements and journal entry recorded', auth.uid(),
          (SELECT email FROM profiles WHERE id = auth.uid()));

  IF pk.sales_order_id IS NOT NULL THEN
    UPDATE sales_orders SET status = 'Packed'
    WHERE id = pk.sales_order_id AND status IN ('Draft','Confirmed','Processing');
  END IF;

  RETURN _package_id;
END $function$;
