DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_handle_new_user' AND tgrelid = 'auth.users'::regclass) THEN
    CREATE TRIGGER trg_handle_new_user
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

INSERT INTO public.tenants (name, slug, currency, status)
VALUES ('Stratus ERP', 'stratus-erp', 'USD', 'active')
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (id, email, tenant_id, full_name)
SELECT 'c783ae79-b4af-4cb5-b333-1d8480d16788', 'hello@stratus.africa', t.id, 'Stratus Admin'
FROM public.tenants t WHERE t.slug = 'stratus-erp'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, tenant_id, role)
SELECT 'c783ae79-b4af-4cb5-b333-1d8480d16788', t.id, 'tenant_admin'
FROM public.tenants t WHERE t.slug = 'stratus-erp'
ON CONFLICT DO NOTHING;

INSERT INTO public.chart_of_accounts (tenant_id, code, name, type, balance)
SELECT t.id, x.code, x.name, x.type, 0
FROM public.tenants t
CROSS JOIN (VALUES
  ('1000','Cash','asset'),
  ('1100','Accounts Receivable','asset'),
  ('1200','Inventory','asset'),
  ('1300','Work in Progress','asset'),
  ('2000','Accounts Payable','liability'),
  ('4000','Revenue','revenue'),
  ('5000','COGS','expense')
) AS x(code, name, type)
WHERE t.slug = 'stratus-erp'
ON CONFLICT DO NOTHING;