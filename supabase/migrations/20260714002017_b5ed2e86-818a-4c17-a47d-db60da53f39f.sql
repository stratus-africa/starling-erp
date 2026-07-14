
-- =====================================================
-- ROLES ENUM
-- =====================================================
CREATE TYPE public.app_role AS ENUM (
  'super_admin','tenant_admin','sales','purchasing',
  'inventory','accounting','manufacturing','viewer'
);

-- =====================================================
-- TENANTS
-- =====================================================
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'Active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PROFILES
-- =====================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  email text,
  full_name text,
  avatar_url text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- USER ROLES
-- =====================================================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, tenant_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- SECURITY DEFINER HELPERS
-- =====================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT tenant_id FROM public.profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin') $$;

-- =====================================================
-- POLICIES: tenants, profiles, user_roles
-- =====================================================
CREATE POLICY "members see own tenant" ON public.tenants FOR SELECT TO authenticated
  USING (id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY "tenant_admin updates own tenant" ON public.tenants FOR UPDATE TO authenticated
  USING ((id = public.current_tenant_id() AND public.has_role(auth.uid(), 'tenant_admin')) OR public.is_super_admin());
CREATE POLICY "super_admin manages tenants" ON public.tenants FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "users read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "read tenant roles" ON public.user_roles FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR user_id = auth.uid() OR public.is_super_admin());
CREATE POLICY "tenant_admin manages roles" ON public.user_roles FOR ALL TO authenticated
  USING ((tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(),'tenant_admin')) OR public.is_super_admin())
  WITH CHECK ((tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(),'tenant_admin')) OR public.is_super_admin());

-- =====================================================
-- UPDATED_AT TRIGGER FN
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =====================================================
-- SIGNUP TRIGGER: create tenant + profile + admin role
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_tenant_id uuid;
  tenant_name text;
  tenant_slug text;
BEGIN
  tenant_name := COALESCE(NEW.raw_user_meta_data->>'company', split_part(NEW.email,'@',1) || '''s Workspace');
  tenant_slug := lower(regexp_replace(tenant_name || '-' || substr(NEW.id::text,1,8),'[^a-z0-9]+','-','g'));

  INSERT INTO public.tenants (name, slug) VALUES (tenant_name, tenant_slug) RETURNING id INTO new_tenant_id;

  INSERT INTO public.profiles (id, tenant_id, email, full_name)
  VALUES (NEW.id, new_tenant_id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  INSERT INTO public.user_roles (user_id, tenant_id, role) VALUES (NEW.id, new_tenant_id, 'tenant_admin');

  -- Seed default chart of accounts for the new tenant
  INSERT INTO public.chart_of_accounts (tenant_id, code, name, type, created_by) VALUES
    (new_tenant_id,'1000','Cash','Asset',NEW.id),
    (new_tenant_id,'1100','Accounts Receivable','Asset',NEW.id),
    (new_tenant_id,'1200','Inventory','Asset',NEW.id),
    (new_tenant_id,'2000','Accounts Payable','Liability',NEW.id),
    (new_tenant_id,'3000','Owner Equity','Equity',NEW.id),
    (new_tenant_id,'4000','Sales Revenue','Income',NEW.id),
    (new_tenant_id,'5000','Cost of Goods Sold','Expense',NEW.id),
    (new_tenant_id,'6000','Operating Expenses','Expense',NEW.id);

  RETURN NEW;
END; $$;

-- Trigger created after chart_of_accounts exists (below).

-- =====================================================
-- MACRO: generic function to add standard columns + policies
-- inlined per table for clarity
-- =====================================================

-- CUSTOMERS
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text, name text NOT NULL, email text, phone text,
  currency text DEFAULT 'USD', credit_limit numeric DEFAULT 0, balance numeric DEFAULT 0,
  status text DEFAULT 'Active', notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  deleted_at timestamptz
);

-- SUPPLIERS
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text, name text NOT NULL, category text, email text, phone text,
  currency text DEFAULT 'USD', balance numeric DEFAULT 0,
  status text DEFAULT 'Active', notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  deleted_at timestamptz
);

-- WAREHOUSES
CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text, name text NOT NULL, location text,
  status text DEFAULT 'Active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  deleted_at timestamptz
);

-- ITEMS
CREATE TABLE public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sku text, name text NOT NULL, type text DEFAULT 'Finished Good', uom text DEFAULT 'pc',
  stock numeric DEFAULT 0, reorder numeric DEFAULT 0, cost numeric DEFAULT 0, price numeric DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  deleted_at timestamptz
);

-- SALES QUOTES
CREATE TABLE public.sales_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  number text, customer_id uuid REFERENCES public.customers(id),
  date date DEFAULT current_date, expiry date, amount numeric DEFAULT 0,
  status text DEFAULT 'Draft', notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  deleted_at timestamptz
);

-- SALES ORDERS
CREATE TABLE public.sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  number text, customer_id uuid REFERENCES public.customers(id),
  date date DEFAULT current_date, items_count int DEFAULT 0, amount numeric DEFAULT 0,
  status text DEFAULT 'Confirmed', notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  deleted_at timestamptz
);

-- INVOICES
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  number text, customer_id uuid REFERENCES public.customers(id),
  date date DEFAULT current_date, due_date date,
  amount numeric DEFAULT 0, balance numeric DEFAULT 0,
  status text DEFAULT 'Draft', notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  deleted_at timestamptz
);

-- PAYMENTS RECEIVED
CREATE TABLE public.payments_received (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  number text, customer_id uuid REFERENCES public.customers(id),
  date date DEFAULT current_date, mode text, reference text, amount numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  deleted_at timestamptz
);

-- PURCHASE ORDERS
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  number text, supplier_id uuid REFERENCES public.suppliers(id),
  date date DEFAULT current_date, expected_date date, amount numeric DEFAULT 0,
  status text DEFAULT 'Draft', notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  deleted_at timestamptz
);

-- BILLS
CREATE TABLE public.bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  number text, supplier_id uuid REFERENCES public.suppliers(id),
  date date DEFAULT current_date, due_date date,
  amount numeric DEFAULT 0, balance numeric DEFAULT 0,
  status text DEFAULT 'Pending', notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  deleted_at timestamptz
);

-- PAYMENTS MADE
CREATE TABLE public.payments_made (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  number text, supplier_id uuid REFERENCES public.suppliers(id),
  date date DEFAULT current_date, mode text, amount numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  deleted_at timestamptz
);

-- CHART OF ACCOUNTS
CREATE TABLE public.chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text, name text NOT NULL, type text DEFAULT 'Asset',
  balance numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  deleted_at timestamptz
);

-- ATTACHMENTS
CREATE TABLE public.attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  size_bytes bigint,
  mime_type text,
  uploaded_by uuid DEFAULT auth.uid(),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Grants + RLS + policies + triggers for all business tables
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'customers','suppliers','warehouses','items',
    'sales_quotes','sales_orders','invoices','payments_received',
    'purchase_orders','bills','payments_made','chart_of_accounts','attachments'
  ]) LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY "tenant read %1$s" ON public.%1$I FOR SELECT TO authenticated
      USING ((tenant_id = public.current_tenant_id() OR public.is_super_admin()) AND deleted_at IS NULL)$f$, t);
    EXECUTE format($f$CREATE POLICY "tenant insert %1$s" ON public.%1$I FOR INSERT TO authenticated
      WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_super_admin())$f$, t);
    EXECUTE format($f$CREATE POLICY "tenant update %1$s" ON public.%1$I FOR UPDATE TO authenticated
      USING (tenant_id = public.current_tenant_id() OR public.is_super_admin())
      WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_super_admin())$f$, t);
    EXECUTE format($f$CREATE POLICY "tenant delete %1$s" ON public.%1$I FOR DELETE TO authenticated
      USING (tenant_id = public.current_tenant_id() OR public.is_super_admin())$f$, t);
    IF t <> 'attachments' THEN
      EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at()', t);
    END IF;
  END LOOP;
END $$;

-- Register signup trigger now that chart_of_accounts exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
