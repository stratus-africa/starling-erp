ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'field_sales';

INSERT INTO public.role_permissions(role, permission_code)
SELECT 'field_sales', p FROM unnest(ARRAY['crm.read','crm.create','crm.update','sales.read','sales.create','sales.update','payments.read','payments.create','payments.update','payments.post','payments.allocate']) p
WHERE EXISTS (SELECT 1 FROM public.permissions WHERE code = p)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  company text,
  phone text,
  email text,
  source text,
  status text NOT NULL DEFAULT 'New' CHECK (status IN ('New','Contacted','Qualified','Unqualified','Converted','Lost')),
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  converted_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS crm_leads_tenant_idx ON public.crm_leads(tenant_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.crm_leads TO authenticated;
GRANT ALL ON public.crm_leads TO service_role;
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.tenant_crm_enabled()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.get_my_features() f WHERE f.feature = 'crm')
$$;
REVOKE EXECUTE ON FUNCTION public.tenant_crm_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_crm_enabled() TO authenticated, service_role;

CREATE POLICY "leads read" ON public.crm_leads FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_permission('crm.read', auth.uid()) AND public.tenant_crm_enabled());
CREATE POLICY "leads insert" ON public.crm_leads FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission('crm.create', auth.uid()) AND public.tenant_crm_enabled());
CREATE POLICY "leads update" ON public.crm_leads FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_permission('crm.update', auth.uid()) AND public.tenant_crm_enabled())
  WITH CHECK (tenant_id = public.current_tenant_id());

CREATE OR REPLACE FUNCTION public.crm_leads_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.last_activity_at := now();
  IF NEW.assigned_to IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN
    INSERT INTO public.notifications(tenant_id, user_id, type, title, message, entity_type, entity_id, severity)
    VALUES (NEW.tenant_id, NEW.assigned_to, 'lead_assigned', 'Lead assigned', 'You were assigned lead ' || NEW.name, 'crm_lead', NEW.id, 'info');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS crm_leads_touch ON public.crm_leads;
CREATE TRIGGER crm_leads_touch BEFORE INSERT OR UPDATE ON public.crm_leads FOR EACH ROW EXECUTE FUNCTION public.crm_leads_touch();

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['crm_leads','customers','sales_quotes','sales_orders','payments_received'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()', t);
  END LOOP;
END $$;