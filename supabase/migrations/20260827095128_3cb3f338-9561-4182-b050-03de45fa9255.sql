ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS salesperson_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS billing_address text,
  ADD COLUMN IF NOT EXISTS shipping_address text,
  ADD COLUMN IF NOT EXISTS industry text;

CREATE INDEX IF NOT EXISTS customers_salesperson_idx ON public.customers(salesperson_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'Tenant members can view tenant profiles'
  ) THEN
    CREATE POLICY "Tenant members can view tenant profiles"
      ON public.profiles FOR SELECT TO authenticated
      USING (tenant_id IS NOT NULL AND tenant_id = public.current_tenant_id());
  END IF;
END $$;