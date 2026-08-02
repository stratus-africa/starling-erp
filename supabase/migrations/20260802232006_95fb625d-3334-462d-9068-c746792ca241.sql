CREATE TABLE public.packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  number text,
  sales_order_id uuid REFERENCES public.sales_orders(id),
  customer_id uuid REFERENCES public.customers(id),
  date date DEFAULT now(),
  weight numeric DEFAULT 0,
  tracking text,
  carrier text,
  status text DEFAULT 'Draft',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.packages TO authenticated;
GRANT ALL ON public.packages TO service_role;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "packages_select" ON public.packages FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY "packages_write" ON public.packages FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.tenant_write_ok(ARRAY['tenant_admin','sales']::app_role[]))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.tenant_write_ok(ARRAY['tenant_admin','sales']::app_role[]));

CREATE TABLE public.package_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  document_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  line_no integer NOT NULL DEFAULT 1,
  item_id uuid REFERENCES public.items(id),
  description text,
  quantity numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.package_lines TO authenticated;
GRANT ALL ON public.package_lines TO service_role;
ALTER TABLE public.package_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "package_lines_select" ON public.package_lines FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY "package_lines_write" ON public.package_lines FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.tenant_write_ok(ARRAY['tenant_admin','sales']::app_role[]))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.tenant_write_ok(ARRAY['tenant_admin','sales']::app_role[]));

CREATE TRIGGER update_packages_updated_at BEFORE UPDATE ON public.packages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_package_lines_updated_at BEFORE UPDATE ON public.package_lines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER audit_packages AFTER INSERT OR UPDATE OR DELETE ON public.packages FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();