
-- ============================================================
-- 1. AUDIT LOGS
-- ============================================================
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  actor_id uuid,
  actor_email text,
  action text NOT NULL, -- INSERT / UPDATE / DELETE / SOFT_DELETE / RESTORE
  table_name text NOT NULL,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_read_tenant" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(),'tenant_admin')));

CREATE INDEX idx_audit_tenant_created ON public.audit_logs (tenant_id, created_at DESC);
CREATE INDEX idx_audit_table_record ON public.audit_logs (table_name, record_id);

-- Generic audit trigger
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action text;
  v_tenant uuid;
  v_record uuid;
  v_email text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'INSERT';
    v_tenant := (row_to_json(NEW)::jsonb ->> 'tenant_id')::uuid;
    v_record := (row_to_json(NEW)::jsonb ->> 'id')::uuid;
  ELSIF TG_OP = 'UPDATE' THEN
    v_tenant := (row_to_json(NEW)::jsonb ->> 'tenant_id')::uuid;
    v_record := (row_to_json(NEW)::jsonb ->> 'id')::uuid;
    IF (row_to_json(OLD)::jsonb ->> 'deleted_at') IS NULL AND (row_to_json(NEW)::jsonb ->> 'deleted_at') IS NOT NULL THEN
      v_action := 'SOFT_DELETE';
    ELSIF (row_to_json(OLD)::jsonb ->> 'deleted_at') IS NOT NULL AND (row_to_json(NEW)::jsonb ->> 'deleted_at') IS NULL THEN
      v_action := 'RESTORE';
    ELSE
      v_action := 'UPDATE';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_tenant := (row_to_json(OLD)::jsonb ->> 'tenant_id')::uuid;
    v_record := (row_to_json(OLD)::jsonb ->> 'id')::uuid;
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.audit_logs(tenant_id, actor_id, actor_email, action, table_name, record_id, old_data, new_data)
  VALUES (
    v_tenant, auth.uid(), v_email, v_action, TG_TABLE_NAME, v_record,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN row_to_json(OLD)::jsonb END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN row_to_json(NEW)::jsonb END
  );
  RETURN COALESCE(NEW, OLD);
END; $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers','suppliers','items','warehouses','chart_of_accounts',
    'sales_quotes','sales_orders','invoices','payments_received',
    'purchase_orders','bills','payments_made'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()', t);
  END LOOP;
END $$;

-- ============================================================
-- 2. TENANT SWITCH (super admin) + role management
-- ============================================================
CREATE OR REPLACE FUNCTION public.switch_tenant(target_tenant uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can switch tenants';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = target_tenant AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;
  UPDATE public.profiles SET tenant_id = target_tenant, updated_at = now() WHERE id = auth.uid();
  RETURN target_tenant;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_user_roles(target_user uuid, new_roles app_role[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid := public.current_tenant_id();
  r app_role;
BEGIN
  IF NOT (public.is_super_admin() OR public.has_role(auth.uid(),'tenant_admin')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF NOT public.is_super_admin() THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user AND tenant_id = v_tenant) THEN
      RAISE EXCEPTION 'User is not in your tenant';
    END IF;
    IF 'super_admin' = ANY(new_roles) THEN
      RAISE EXCEPTION 'Only super admins can grant super_admin';
    END IF;
  END IF;
  DELETE FROM public.user_roles WHERE user_id = target_user AND tenant_id = COALESCE((SELECT tenant_id FROM public.profiles WHERE id = target_user), v_tenant);
  FOREACH r IN ARRAY new_roles LOOP
    INSERT INTO public.user_roles(user_id, tenant_id, role)
    VALUES (target_user, COALESCE((SELECT tenant_id FROM public.profiles WHERE id = target_user), v_tenant), r)
    ON CONFLICT DO NOTHING;
  END LOOP;
END; $$;

-- Allow tenant admins to see profiles in their tenant (RBAC screen)
CREATE POLICY "profiles_tenant_admin_read" ON public.profiles FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(),'tenant_admin')));

-- Allow tenant admins to read tenant roles
CREATE POLICY "user_roles_tenant_admin_read" ON public.user_roles FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(),'tenant_admin')));

-- Super admin can read tenants list
CREATE POLICY "tenants_super_admin_read" ON public.tenants FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- ============================================================
-- 3. FULL-TEXT SEARCH
-- ============================================================
DO $$
DECLARE t text; cols text;
BEGIN
  FOR t, cols IN VALUES
    ('customers',     'coalesce(name,'''')||'' ''||coalesce(code,'''')||'' ''||coalesce(email,'''')||'' ''||coalesce(phone,'''')'),
    ('suppliers',     'coalesce(name,'''')||'' ''||coalesce(code,'''')||'' ''||coalesce(email,'''')||'' ''||coalesce(category,'''')'),
    ('items',         'coalesce(name,'''')||'' ''||coalesce(sku,'''')||'' ''||coalesce(description,'''')'),
    ('invoices',      'coalesce(number,'''')||'' ''||coalesce(notes,'''')'),
    ('sales_orders',  'coalesce(number,'''')||'' ''||coalesce(notes,'''')'),
    ('sales_quotes',  'coalesce(number,'''')||'' ''||coalesce(notes,'''')'),
    ('purchase_orders','coalesce(number,'''')||'' ''||coalesce(notes,'''')'),
    ('bills',         'coalesce(number,'''')||'' ''||coalesce(notes,'''')')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS search_vec tsvector GENERATED ALWAYS AS (to_tsvector(''simple'', %s)) STORED', t, cols);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_search ON public.%I USING gin(search_vec)', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.global_search(q text, modules text[] DEFAULT NULL, date_from date DEFAULT NULL, date_to date DEFAULT NULL, max_per_module int DEFAULT 10)
RETURNS TABLE(module text, id uuid, title text, subtitle text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  qry tsquery := plainto_tsquery('simple', q);
BEGIN
  IF q IS NULL OR length(trim(q)) = 0 THEN RETURN; END IF;

  IF modules IS NULL OR 'customers' = ANY(modules) THEN
    RETURN QUERY SELECT 'customers'::text, c.id, c.name, c.email, c.created_at
      FROM customers c WHERE c.deleted_at IS NULL AND c.search_vec @@ qry
      AND (date_from IS NULL OR c.created_at::date >= date_from)
      AND (date_to IS NULL OR c.created_at::date <= date_to)
      ORDER BY c.created_at DESC LIMIT max_per_module;
  END IF;
  IF modules IS NULL OR 'suppliers' = ANY(modules) THEN
    RETURN QUERY SELECT 'suppliers'::text, s.id, s.name, s.email, s.created_at
      FROM suppliers s WHERE s.deleted_at IS NULL AND s.search_vec @@ qry
      AND (date_from IS NULL OR s.created_at::date >= date_from)
      AND (date_to IS NULL OR s.created_at::date <= date_to)
      ORDER BY s.created_at DESC LIMIT max_per_module;
  END IF;
  IF modules IS NULL OR 'items' = ANY(modules) THEN
    RETURN QUERY SELECT 'items'::text, i.id, i.name, i.sku, i.created_at
      FROM items i WHERE i.deleted_at IS NULL AND i.search_vec @@ qry
      AND (date_from IS NULL OR i.created_at::date >= date_from)
      AND (date_to IS NULL OR i.created_at::date <= date_to)
      ORDER BY i.created_at DESC LIMIT max_per_module;
  END IF;
  IF modules IS NULL OR 'invoices' = ANY(modules) THEN
    RETURN QUERY SELECT 'invoices'::text, x.id, x.number, x.status, x.created_at
      FROM invoices x WHERE x.deleted_at IS NULL AND x.search_vec @@ qry
      AND (date_from IS NULL OR x.created_at::date >= date_from)
      AND (date_to IS NULL OR x.created_at::date <= date_to)
      ORDER BY x.created_at DESC LIMIT max_per_module;
  END IF;
  IF modules IS NULL OR 'sales_orders' = ANY(modules) THEN
    RETURN QUERY SELECT 'sales_orders'::text, x.id, x.number, x.status, x.created_at
      FROM sales_orders x WHERE x.deleted_at IS NULL AND x.search_vec @@ qry
      AND (date_from IS NULL OR x.created_at::date >= date_from)
      AND (date_to IS NULL OR x.created_at::date <= date_to)
      ORDER BY x.created_at DESC LIMIT max_per_module;
  END IF;
  IF modules IS NULL OR 'sales_quotes' = ANY(modules) THEN
    RETURN QUERY SELECT 'sales_quotes'::text, x.id, x.number, x.status, x.created_at
      FROM sales_quotes x WHERE x.deleted_at IS NULL AND x.search_vec @@ qry
      AND (date_from IS NULL OR x.created_at::date >= date_from)
      AND (date_to IS NULL OR x.created_at::date <= date_to)
      ORDER BY x.created_at DESC LIMIT max_per_module;
  END IF;
  IF modules IS NULL OR 'purchase_orders' = ANY(modules) THEN
    RETURN QUERY SELECT 'purchase_orders'::text, x.id, x.number, x.status, x.created_at
      FROM purchase_orders x WHERE x.deleted_at IS NULL AND x.search_vec @@ qry
      AND (date_from IS NULL OR x.created_at::date >= date_from)
      AND (date_to IS NULL OR x.created_at::date <= date_to)
      ORDER BY x.created_at DESC LIMIT max_per_module;
  END IF;
  IF modules IS NULL OR 'bills' = ANY(modules) THEN
    RETURN QUERY SELECT 'bills'::text, x.id, x.number, x.status, x.created_at
      FROM bills x WHERE x.deleted_at IS NULL AND x.search_vec @@ qry
      AND (date_from IS NULL OR x.created_at::date >= date_from)
      AND (date_to IS NULL OR x.created_at::date <= date_to)
      ORDER BY x.created_at DESC LIMIT max_per_module;
  END IF;
END; $$;

-- ============================================================
-- 4. ADDITIONAL ERP TABLES
-- ============================================================
CREATE OR REPLACE FUNCTION public.tenant_write_ok(_roles app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND tenant_id = public.current_tenant_id()
      AND (role = ANY(_roles) OR role IN ('tenant_admin','super_admin'))
  );
$$;

-- Helper macro pattern via DO block for each new table
CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  bank text,
  account_number text,
  currency text DEFAULT 'USD',
  balance numeric DEFAULT 0,
  status text DEFAULT 'Active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ba_read" ON public.bank_accounts FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY "ba_write" ON public.bank_accounts FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id() AND public.tenant_write_ok(ARRAY['accounting']::app_role[])) WITH CHECK (tenant_id = public.current_tenant_id());

CREATE TABLE public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  number text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  memo text,
  debit numeric DEFAULT 0,
  credit numeric DEFAULT 0,
  status text DEFAULT 'Draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;
GRANT ALL ON public.journal_entries TO service_role;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "je_read" ON public.journal_entries FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY "je_write" ON public.journal_entries FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id() AND public.tenant_write_ok(ARRAY['accounting']::app_role[])) WITH CHECK (tenant_id = public.current_tenant_id());

CREATE TABLE public.inventory_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  number text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  item_id uuid REFERENCES public.items(id),
  warehouse_id uuid REFERENCES public.warehouses(id),
  quantity numeric NOT NULL DEFAULT 0,
  reason text,
  status text DEFAULT 'Posted',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_adjustments TO authenticated;
GRANT ALL ON public.inventory_adjustments TO service_role;
ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ia_read" ON public.inventory_adjustments FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY "ia_write" ON public.inventory_adjustments FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id() AND public.tenant_write_ok(ARRAY['inventory']::app_role[])) WITH CHECK (tenant_id = public.current_tenant_id());

CREATE TABLE public.inventory_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  number text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  item_id uuid REFERENCES public.items(id),
  from_warehouse_id uuid REFERENCES public.warehouses(id),
  to_warehouse_id uuid REFERENCES public.warehouses(id),
  quantity numeric NOT NULL DEFAULT 0,
  status text DEFAULT 'Draft',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_transfers TO authenticated;
GRANT ALL ON public.inventory_transfers TO service_role;
ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "it_read" ON public.inventory_transfers FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY "it_write" ON public.inventory_transfers FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id() AND public.tenant_write_ok(ARRAY['inventory']::app_role[])) WITH CHECK (tenant_id = public.current_tenant_id());

CREATE TABLE public.bom_headers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  code text NOT NULL,
  product_id uuid REFERENCES public.items(id),
  version text DEFAULT '1.0',
  yield_qty numeric DEFAULT 1,
  status text DEFAULT 'Active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bom_headers TO authenticated;
GRANT ALL ON public.bom_headers TO service_role;
ALTER TABLE public.bom_headers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bom_read" ON public.bom_headers FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY "bom_write" ON public.bom_headers FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id() AND public.tenant_write_ok(ARRAY['manufacturing']::app_role[])) WITH CHECK (tenant_id = public.current_tenant_id());

CREATE TABLE public.production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  number text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  bom_id uuid REFERENCES public.bom_headers(id),
  quantity numeric NOT NULL DEFAULT 0,
  status text DEFAULT 'Planned',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_orders TO authenticated;
GRANT ALL ON public.production_orders TO service_role;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_prod_read" ON public.production_orders FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY "po_prod_write" ON public.production_orders FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id() AND public.tenant_write_ok(ARRAY['manufacturing']::app_role[])) WITH CHECK (tenant_id = public.current_tenant_id());

-- Attach audit triggers to the new tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bank_accounts','journal_entries','inventory_adjustments','inventory_transfers','bom_headers','production_orders']
  LOOP
    EXECUTE format('CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()', t);
    EXECUTE format('CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at()', t);
  END LOOP;
END $$;
