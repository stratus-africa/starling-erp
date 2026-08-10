CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  number text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  category text,
  supplier_id uuid REFERENCES public.suppliers(id),
  account_id uuid REFERENCES public.chart_of_accounts(id),
  bank_account_id uuid REFERENCES public.bank_accounts(id),
  mode text DEFAULT 'Cash',
  reference text,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  billable boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'Unbilled',
  notes text,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view expenses"
ON public.expenses FOR SELECT TO authenticated
USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());

CREATE POLICY "Authorized roles can insert expenses"
ON public.expenses FOR INSERT TO authenticated
WITH CHECK ((tenant_id = public.current_tenant_id() AND public.tenant_write_ok(ARRAY['purchasing','accounting']::app_role[])) OR public.is_super_admin());

CREATE POLICY "Authorized roles can update expenses"
ON public.expenses FOR UPDATE TO authenticated
USING ((tenant_id = public.current_tenant_id() AND public.tenant_write_ok(ARRAY['purchasing','accounting']::app_role[])) OR public.is_super_admin())
WITH CHECK ((tenant_id = public.current_tenant_id() AND public.tenant_write_ok(ARRAY['purchasing','accounting']::app_role[])) OR public.is_super_admin());

CREATE POLICY "Authorized roles can delete expenses"
ON public.expenses FOR DELETE TO authenticated
USING ((tenant_id = public.current_tenant_id() AND public.tenant_write_ok(ARRAY['purchasing','accounting']::app_role[])) OR public.is_super_admin());

CREATE INDEX idx_expenses_tenant_date ON public.expenses(tenant_id, date DESC);

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();