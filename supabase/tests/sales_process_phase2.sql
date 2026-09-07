-- Phase 2 payment lifecycle tests.
-- The harness must provide fixture UUIDs through test.phase2.* settings.

BEGIN;
SELECT plan(13);

SELECT lives_ok(
  $$SELECT public.create_customer_payment(
    current_setting('test.phase2.customer_id')::uuid, 100, CURRENT_DATE,
    'Bank Transfer', 'PHASE2-DRAFT', 'draft test', current_setting('test.phase2.currency')
  )$$,
  'customer payment creation returns a Draft payment'
);

SELECT lives_ok(
  format($sql$SELECT public.post_payment_received(%L)$sql$,
    current_setting('test.phase2.postable_payment_id')::uuid),
  'payment posting uses the existing posting RPC'
);

SELECT lives_ok(
  format($sql$SELECT public.allocate_customer_payment(%L, %L::jsonb)$sql$,
    current_setting('test.phase2.postable_payment_id'),
    '[{"invoice_id":"' || current_setting('test.phase2.invoice_id') || '","amount":100}]'),
  'full allocation succeeds'
);

SELECT lives_ok(
  format($sql$SELECT public.allocate_customer_payment(%L, %L::jsonb)$sql$,
    current_setting('test.phase2.partial_payment_id'),
    '[{"invoice_id":"' || current_setting('test.phase2.partial_invoice_id') || '","amount":40}]'),
  'partial allocation succeeds'
);

SELECT lives_ok(
  format($sql$SELECT public.allocate_customer_payment(%L, %L::jsonb)$sql$,
    current_setting('test.phase2.multi_payment_id'),
    '[{"invoice_id":"' || current_setting('test.phase2.invoice_id') || '","amount":25},{"invoice_id":"' || current_setting('test.phase2.second_invoice_id') || '","amount":25}]'),
  'multi-invoice allocation succeeds atomically'
);

SELECT is(
  (SELECT unallocated_amount FROM public.get_payment_allocation_summary(current_setting('test.phase2.unallocated_payment_id')::uuid)),
  (SELECT amount FROM public.payments_received WHERE id = current_setting('test.phase2.unallocated_payment_id')::uuid),
  'unallocated payment remains available'
);

SELECT throws_ok(
  format($sql$SELECT public.allocate_customer_payment(%L, %L::jsonb)$sql$,
    current_setting('test.phase2.partial_payment_id'),
    '[{"invoice_id":"' || current_setting('test.phase2.partial_invoice_id') || '","amount":10000}]'),
  'P0001', NULL, 'over-allocation is rejected'
);

SELECT lives_ok(
  format($sql$SELECT public.unallocate_customer_payment(%L)$sql$,
    current_setting('test.phase2.allocation_id')),
  'unallocation soft-deletes the allocation and preserves history'
);

SELECT throws_ok(
  $$SELECT public.create_customer_payment(
    '00000000-0000-0000-0000-000000000000', 100, CURRENT_DATE,
    'Cash', NULL, NULL, 'USD'
  )$$,
  'P0001', NULL, 'invalid customer is rejected'
);

SELECT throws_ok(
  format($sql$SELECT public.create_customer_payment(%L, 100, CURRENT_DATE, 'Cash', NULL, NULL, 'ZZZ')$sql$,
    current_setting('test.phase2.customer_id')),
  'P0001', NULL, 'invalid currency is rejected'
);

SELECT throws_ok(
  format($sql$SELECT public.allocate_customer_payment(%L, %L::jsonb)$sql$,
    current_setting('test.phase2.postable_payment_id'),
    '[{"invoice_id":"' || current_setting('test.phase2.invoice_id') || '","amount":1}]'),
  NULL, NULL, 'duplicate allocation is rejected'
);

SELECT throws_ok(
  format($sql$SELECT public.allocate_customer_payment(%L, %L::jsonb)$sql$,
    current_setting('test.phase2.voided_payment_id'),
    '[{"invoice_id":"' || current_setting('test.phase2.invoice_id') || '","amount":1}]'),
  'P0001', NULL, 'voided payment is rejected'
);

SELECT throws_ok(
  format($sql$SELECT public.allocate_customer_payment(%L, %L::jsonb)$sql$,
    current_setting('test.phase2.postable_payment_id'),
    '[{"invoice_id":"' || current_setting('test.phase2.voided_invoice_id') || '","amount":1}]'),
  'P0001', NULL, 'voided invoice is rejected'
);

SELECT * FROM finish();
ROLLBACK;
