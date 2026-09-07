-- Phase 1 database tests.
-- The test harness must provide UUID settings for the fixture rows below. This
-- keeps the suite independent of production data and lets the same cases run
-- against a disposable tenant under an authenticated database role.
--
-- Required settings:
-- test.phase1.tenant_id, customer_a, customer_b, other_tenant,
-- payment_full, payment_partial, payment_multi_invoice, payment_unallocated,
-- invoice_full, invoice_partial, invoice_second, invoice_other_customer,
-- invoice_other_currency, invoice_voided, payment_deleted.

BEGIN;

SELECT plan(15);

SELECT lives_ok(
  format($sql$INSERT INTO public.payment_allocations (tenant_id, payment_id, invoice_id, amount)
         VALUES (%L, %L, %L, 100)$sql$,
    current_setting('test.phase1.tenant_id')::uuid,
    current_setting('test.phase1.payment_partial')::uuid,
    current_setting('test.phase1.invoice_partial')::uuid),
  'full payment allocation is accepted'
);

SELECT lives_ok(
  format($sql$INSERT INTO public.payment_allocations (tenant_id, payment_id, invoice_id, amount)
         VALUES (%L, %L, %L, 40)$sql$,
    current_setting('test.phase1.tenant_id')::uuid,
    current_setting('test.phase1.payment_partial')::uuid,
    current_setting('test.phase1.invoice_partial')::uuid),
  'partial payment allocation is accepted'
);

SELECT lives_ok(
  format($sql$INSERT INTO public.payment_allocations (tenant_id, payment_id, invoice_id, amount)
         VALUES (%L, %L, %L, 25)$sql$,
    current_setting('test.phase1.tenant_id')::uuid,
    current_setting('test.phase1.payment_multi_invoice')::uuid,
    current_setting('test.phase1.invoice_partial')::uuid),
  'multiple payments can target one invoice'
);

SELECT lives_ok(
  format($sql$INSERT INTO public.payment_allocations (tenant_id, payment_id, invoice_id, amount)
         VALUES (%L, %L, %L, 25)$sql$,
    current_setting('test.phase1.tenant_id')::uuid,
    current_setting('test.phase1.payment_multi_invoice')::uuid,
    current_setting('test.phase1.invoice_second')::uuid),
  'one payment can target multiple invoices'
);

SELECT is(
  (SELECT unallocated_amount FROM public.get_payment_allocation_summary(current_setting('test.phase1.payment_unallocated')::uuid)),
  (SELECT amount FROM public.payments_received WHERE id = current_setting('test.phase1.payment_unallocated')::uuid),
  'unallocated payment retains its full unallocated balance'
);

SELECT throws_ok(
  format($sql$INSERT INTO public.payment_allocations (tenant_id, payment_id, invoice_id, amount)
         VALUES (%L, %L, %L, 1000)$sql$,
    current_setting('test.phase1.tenant_id')::uuid,
    current_setting('test.phase1.payment_partial')::uuid,
    current_setting('test.phase1.invoice_partial')::uuid),
  'P0001', NULL, 'overpayment is rejected'
);

SELECT throws_ok(
  format($sql$INSERT INTO public.payment_allocations (tenant_id, payment_id, invoice_id, amount)
         VALUES (%L, %L, %L, 1000)$sql$,
    current_setting('test.phase1.tenant_id')::uuid,
    current_setting('test.phase1.payment_full')::uuid,
    current_setting('test.phase1.invoice_partial')::uuid),
  'P0001', NULL, 'allocation above invoice balance is rejected'
);

SELECT throws_ok(
  format($sql$INSERT INTO public.payment_allocations (tenant_id, payment_id, invoice_id, amount)
         VALUES (%L, %L, %L, 1)$sql$,
    current_setting('test.phase1.tenant_id')::uuid,
    current_setting('test.phase1.payment_full')::uuid,
    current_setting('test.phase1.invoice_full')::uuid),
  '23505', NULL, 'allocation above payment balance or duplicate allocation is rejected'
);

SELECT throws_ok(
  format($sql$INSERT INTO public.payment_allocations (tenant_id, payment_id, invoice_id, amount)
         VALUES (%L, %L, %L, 1)$sql$,
    current_setting('test.phase1.tenant_id')::uuid,
    current_setting('test.phase1.payment_full')::uuid,
    current_setting('test.phase1.invoice_other_customer')::uuid),
  'P0001', NULL, 'cross-customer allocation is rejected'
);

SELECT throws_ok(
  format($sql$INSERT INTO public.payment_allocations (tenant_id, payment_id, invoice_id, amount)
         VALUES (%L, %L, %L, 1)$sql$,
    current_setting('test.phase1.tenant_id')::uuid,
    current_setting('test.phase1.payment_full')::uuid,
    current_setting('test.phase1.invoice_other_currency')::uuid),
  'P0001', NULL, 'cross-currency allocation is rejected'
);

SELECT throws_ok(
  format($sql$INSERT INTO public.payment_allocations (tenant_id, payment_id, invoice_id, amount)
         VALUES (%L, %L, %L, 1)$sql$,
    current_setting('test.phase1.other_tenant')::uuid,
    current_setting('test.phase1.payment_full')::uuid,
    current_setting('test.phase1.invoice_full')::uuid),
  NULL, NULL, 'cross-tenant allocation is rejected by RLS or validation'
);

SELECT throws_ok(
  format($sql$INSERT INTO public.payment_allocations (tenant_id, payment_id, invoice_id, amount)
         VALUES (%L, %L, %L, 1)$sql$,
    current_setting('test.phase1.tenant_id')::uuid,
    current_setting('test.phase1.payment_full')::uuid,
    current_setting('test.phase1.invoice_voided')::uuid),
  'P0001', NULL, 'voided or cancelled invoice allocation is rejected'
);

SELECT throws_ok(
  format($sql$INSERT INTO public.payment_allocations (tenant_id, payment_id, invoice_id, amount)
         VALUES (%L, %L, %L, 1)$sql$,
    current_setting('test.phase1.tenant_id')::uuid,
    current_setting('test.phase1.payment_deleted')::uuid,
    current_setting('test.phase1.invoice_full')::uuid),
  'P0001', NULL, 'deleted payment allocation is rejected'
);

SELECT ok(
  has_table('public', 'payment_allocations'),
  'payment allocations table exists and is tenant scoped'
);

SELECT ok(
  has_function('public', 'get_invoice_payment_summary', ARRAY['uuid'])
    AND has_function('public', 'get_payment_allocation_summary', ARRAY['uuid'])
    AND has_function('public', 'get_sales_order_financial_summary', ARRAY['uuid']),
  'authoritative payment and sales order summary functions exist'
);

SELECT * FROM finish();
ROLLBACK;