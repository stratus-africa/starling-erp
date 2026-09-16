-- Authentication, RBAC, and tenant-isolation regression tests.
-- The harness must provide authenticated claims and fixture IDs:
--   test.security.user_id, tenant_id, other_tenant_id, own_customer_id,
--   other_customer_id, other_invoice_id, platform_delegate_id.
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

BEGIN;
SELECT plan(16);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.platform_admins pa ON pa.user_id = ur.user_id
    WHERE ur.tenant_id IS NULL
      AND ur.role = 'super_admin'::public.app_role
      AND pa.platform_role <> 'super_admin'
  ),
  'delegated platform roles do not receive global tenant super_admin membership'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'switch_tenant'),
  'tenant switch RPC exists'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_tenant_detail'),
  'tenant detail RPC exists'
);

SELECT set_config('request.jwt.claim.sub', current_setting('test.security.user_id'), true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', current_setting('test.security.user_id'))::text,
  true
);

SELECT lives_ok(
  format('SELECT public.switch_tenant(%L)', current_setting('test.security.tenant_id')),
  'member can switch to own tenant'
);
SELECT throws_ok(
  format('SELECT public.switch_tenant(%L)', current_setting('test.security.other_tenant_id')),
  '42501', NULL,
  'member cannot switch to another tenant'
);

SELECT is(
  (SELECT count(*)::text FROM public.customers WHERE id = current_setting('test.security.other_customer_id')::uuid),
  '0',
  'tenant RLS hides another tenant customer'
);
SELECT is(
  (SELECT count(*)::text FROM public.invoices WHERE id = current_setting('test.security.other_invoice_id')::uuid),
  '0',
  'tenant RLS hides another tenant invoice'
);

SELECT lives_ok(
  format('UPDATE public.customers SET name = name WHERE id = %L::uuid', current_setting('test.security.other_customer_id')),
  'cross-tenant customer update is filtered by RLS'
);
SELECT is(
  (SELECT count(*)::text FROM public.customers WHERE id = current_setting('test.security.other_customer_id')::uuid),
  '0',
  'cross-tenant customer update cannot expose or change the row'
);
SELECT lives_ok(
  format('DELETE FROM public.customers WHERE id = %L::uuid', current_setting('test.security.other_customer_id')),
  'cross-tenant customer delete is filtered by RLS'
);
SELECT is(
  (SELECT count(*)::text FROM public.customers WHERE id = current_setting('test.security.other_customer_id')::uuid),
  '0',
  'cross-tenant customer delete cannot expose or remove the row'
);

SELECT throws_ok(
  format('SELECT public.get_tenant_detail(%L::uuid)', current_setting('test.security.other_tenant_id')),
  '42501', NULL,
  'tenant detail is not available to ordinary tenant users'
);

SELECT throws_ok(
  format('SELECT public.post_invoice(%L::uuid)', current_setting('test.security.other_invoice_id')),
  NULL, NULL,
  'financial RPC cannot post another tenant document'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'has_permission'
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) IS FALSE,
  'permission helper catalog is present'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'customers'
      AND qual ILIKE '%current_tenant_id%'
  ),
  'customer RLS is tenant scoped'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invoices'
      AND qual ILIKE '%current_tenant_id%'
  ),
  'invoice RLS is tenant scoped'
);

SELECT * FROM finish();
ROLLBACK;
