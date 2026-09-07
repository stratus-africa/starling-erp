-- Phase 2 supplier payment lifecycle tests.
-- The harness supplies authenticated tenant fixtures under test.phase2.*.
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

BEGIN;
SELECT plan(29);

SELECT ok(has_function('public', 'create_supplier_payment', ARRAY['uuid','numeric','date','text','uuid','text','text','text']), 'supplier payment creation RPC exists');
SELECT ok(has_function('public', 'post_supplier_payment', ARRAY['uuid']), 'supplier payment posting RPC exists');
SELECT ok(has_function('public', 'allocate_supplier_payment', ARRAY['uuid','uuid','numeric']), 'single-bill allocation RPC exists');
SELECT ok(has_function('public', 'void_supplier_payment', ARRAY['uuid','text']), 'supplier payment void RPC exists');
SELECT ok(EXISTS (SELECT 1 FROM public.permissions WHERE code = 'payments.allocate'), 'allocation permission exists');

SELECT lives_ok(format($sql$SELECT public.create_supplier_payment(%L, 1250, CURRENT_DATE, 'KES', NULL, 'Bank Transfer', 'PH2-DRAFT', 'Draft lifecycle test')$sql$,
  current_setting('test.phase2.supplier_id')::uuid), 'draft payment creation succeeds');
SELECT is((SELECT status FROM public.payments_made WHERE reference = 'PH2-DRAFT'), 'Draft', 'new supplier payment remains Draft');

SELECT lives_ok(format($sql$SELECT public.post_supplier_payment(%L)$sql$,
  current_setting('test.phase2.payment_to_post')::uuid), 'supplier payment posts through existing posting engine');
SELECT is((SELECT status FROM public.payments_made WHERE id = current_setting('test.phase2.payment_to_post')::uuid), 'Posted', 'posted payment status is authoritative');
SELECT ok((SELECT COUNT(*) = 1 FROM public.journal_entries WHERE source_ref_type = 'payment_made' AND source_ref_id = current_setting('test.phase2.payment_to_post')::uuid AND deleted_at IS NULL), 'posting creates one accounting journal');
SELECT lives_ok(format($sql$SELECT public.post_supplier_payment(%L)$sql$,
  current_setting('test.phase2.payment_to_post')::uuid), 'duplicate post submission is idempotent');
SELECT ok((SELECT COUNT(*) = 1 FROM public.journal_entries WHERE source_ref_type = 'payment_made' AND source_ref_id = current_setting('test.phase2.payment_to_post')::uuid AND deleted_at IS NULL), 'duplicate post does not create another journal');

SELECT throws_ok(format($sql$SELECT public.create_supplier_payment(%L, -1, CURRENT_DATE, 'KES')$sql$,
  current_setting('test.phase2.supplier_id')::uuid), 'P0001', NULL, 'negative payment creation is rejected');
SELECT throws_ok(format($sql$SELECT public.create_supplier_payment(%L, 10, CURRENT_DATE, 'USD')$sql$,
  current_setting('test.phase2.supplier_kes_id')::uuid), 'P0001', NULL, 'supplier currency mismatch is rejected');

SELECT lives_ok(format($sql$SELECT public.allocate_supplier_payment(%L, %L, 600)$sql$,
  current_setting('test.phase2.payment_multi')::uuid,
  current_setting('test.phase2.bill_a')::uuid), 'single bill allocation succeeds');
SELECT lives_ok(format($sql$SELECT public.allocate_supplier_payment(%L, %L, 250)$sql$,
  current_setting('test.phase2.payment_multi')::uuid,
  current_setting('test.phase2.bill_b')::uuid), 'multi-bill allocation succeeds');
SELECT is((SELECT unallocated_amount FROM public.get_supplier_payment_allocation_summary(current_setting('test.phase2.payment_multi')::uuid)), 150::numeric, 'multi-bill remainder stays unallocated');

SELECT lives_ok(format($sql$SELECT public.allocate_supplier_payment(%L, %L, 100)$sql$,
  current_setting('test.phase2.payment_overpayment')::uuid,
  current_setting('test.phase2.bill_100')::uuid), 'overpayment allocates only the bill balance');
SELECT is((SELECT unallocated_amount FROM public.get_supplier_payment_allocation_summary(current_setting('test.phase2.payment_overpayment')::uuid)), 20::numeric, 'overpayment remains unallocated');

SELECT lives_ok(format($sql$SELECT public.unallocate_supplier_payment((SELECT id FROM public.supplier_payment_allocations WHERE payment_id = %L AND bill_id = %L AND deleted_at IS NULL LIMIT 1))$sql$,
  current_setting('test.phase2.payment_multi')::uuid, current_setting('test.phase2.bill_b')::uuid), 'allocation can be unallocated');
SELECT is((SELECT unallocated_amount FROM public.get_supplier_payment_allocation_summary(current_setting('test.phase2.payment_multi')::uuid)), 400::numeric, 'unallocation restores payment remainder');
SELECT lives_ok(format($sql$SELECT public.allocate_supplier_payment(%L, %L, 400)$sql$,
  current_setting('test.phase2.payment_multi')::uuid,
  current_setting('test.phase2.bill_c')::uuid), 'unallocated amount can be reallocated');

SELECT throws_ok(format($sql$SELECT public.allocate_supplier_payment(%L, %L, 999999)$sql$,
  current_setting('test.phase2.payment_multi')::uuid, current_setting('test.phase2.bill_a')::uuid), 'P0001', NULL, 'allocation above payment balance is rejected');
SELECT throws_ok(format($sql$SELECT public.allocate_supplier_payment(%L, %L, 999999)$sql$,
  current_setting('test.phase2.payment_small')::uuid, current_setting('test.phase2.bill_100')::uuid), 'P0001', NULL, 'allocation above bill balance is rejected');
SELECT throws_ok(format($sql$SELECT public.allocate_supplier_payment(%L, %L, 1)$sql$,
  current_setting('test.phase2.payment_multi')::uuid, current_setting('test.phase2.other_tenant_bill')::uuid), 'P0001', NULL, 'cross-tenant allocation is rejected');

SELECT lives_ok(format($sql$SELECT public.void_supplier_payment(%L, 'Phase 2 test void')$sql$,
  current_setting('test.phase2.payment_to_void')::uuid), 'void uses reversal workflow');
SELECT is((SELECT status FROM public.payments_made WHERE id = current_setting('test.phase2.payment_to_void')::uuid), 'Voided', 'voided payment is retained and marked Voided');
SELECT is((SELECT COUNT(*) FROM public.supplier_payment_allocations WHERE payment_id = current_setting('test.phase2.payment_to_void')::uuid AND deleted_at IS NULL), 0::bigint, 'voided payment allocations are unapplied');

SELECT throws_ok(format($sql$SELECT public.allocate_supplier_payment(%L, %L, 1)$sql$,
  current_setting('test.phase2.payment_to_void')::uuid, current_setting('test.phase2.bill_100')::uuid), 'P0001', NULL, 'voided payment cannot be allocated');

SELECT * FROM finish();
ROLLBACK;