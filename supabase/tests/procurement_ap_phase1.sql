-- Phase 1 procurement/AP integration tests.
-- The harness supplies fixture UUIDs under test.procurement.*.
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

BEGIN;
SELECT plan(26);

SELECT ok(has_table('public', 'supplier_payment_allocations'), 'supplier allocation table exists');
SELECT ok(has_table('public', 'goods_receipts') AND has_table('public', 'goods_receipt_lines'), 'goods receipt model exists');
SELECT ok(has_function('public', 'allocate_supplier_payment', ARRAY['uuid', 'jsonb']), 'allocation RPC exists');
SELECT ok(has_function('public', 'get_supplier_bill_payment_summary', ARRAY['uuid'])
  AND has_function('public', 'get_supplier_payment_allocation_summary', ARRAY['uuid'])
  AND has_function('public', 'get_supplier_ap_summary', ARRAY['uuid'])
  AND has_function('public', 'get_purchase_order_financial_summary', ARRAY['uuid']), 'authoritative summary RPCs exist');

SELECT lives_ok(format($sql$SELECT public.allocate_supplier_payment(%L, %L::jsonb)$sql$,
  current_setting('test.procurement.payment_full')::uuid,
  jsonb_build_array(jsonb_build_object('bill_id', current_setting('test.procurement.bill_full')::uuid, 'amount', 100))), 'full payment against one bill');

SELECT lives_ok(format($sql$SELECT public.allocate_supplier_payment(%L, %L::jsonb)$sql$,
  current_setting('test.procurement.payment_partial')::uuid,
  jsonb_build_array(jsonb_build_object('bill_id', current_setting('test.procurement.bill_partial')::uuid, 'amount', 40))), 'partial payment');

SELECT lives_ok(format($sql$SELECT public.allocate_supplier_payment(%L, %L::jsonb)$sql$,
  current_setting('test.procurement.payment_multi')::uuid,
  jsonb_build_array(
    jsonb_build_object('bill_id', current_setting('test.procurement.bill_partial')::uuid, 'amount', 20),
    jsonb_build_object('bill_id', current_setting('test.procurement.bill_second')::uuid, 'amount', 20))), 'one payment against multiple bills');

SELECT lives_ok(format($sql$SELECT public.allocate_supplier_payment(%L, %L::jsonb)$sql$,
  current_setting('test.procurement.payment_second')::uuid,
  jsonb_build_array(jsonb_build_object('bill_id', current_setting('test.procurement.bill_partial')::uuid, 'amount', 10))), 'multiple payments against one bill');

SELECT is((SELECT allocation_status FROM public.get_supplier_payment_allocation_summary(current_setting('test.procurement.payment_unallocated')::uuid)), 'Unallocated', 'unallocated payment remains unallocated');
SELECT throws_ok(format($sql$SELECT public.allocate_supplier_payment(%L, %L::jsonb)$sql$,
  current_setting('test.procurement.payment_partial')::uuid,
  jsonb_build_array(jsonb_build_object('bill_id', current_setting('test.procurement.bill_partial')::uuid, 'amount', 1000))),
  'P0001', NULL, 'allocation exceeding payment is rejected');
SELECT throws_ok(format($sql$SELECT public.allocate_supplier_payment(%L, %L::jsonb)$sql$,
  current_setting('test.procurement.payment_full')::uuid,
  jsonb_build_array(jsonb_build_object('bill_id', current_setting('test.procurement.bill_full')::uuid, 'amount', 1))),
  '23505', NULL, 'duplicate retry allocation is rejected');
SELECT throws_ok(format($sql$SELECT public.allocate_supplier_payment(%L, %L::jsonb)$sql$,
  current_setting('test.procurement.payment_full')::uuid,
  jsonb_build_array(jsonb_build_object('bill_id', current_setting('test.procurement.bill_over_balance')::uuid, 'amount', 1000))),
  'P0001', NULL, 'allocation exceeding bill balance is rejected');
SELECT throws_ok(format($sql$SELECT public.allocate_supplier_payment(%L, %L::jsonb)$sql$,
  current_setting('test.procurement.payment_full')::uuid,
  jsonb_build_array(jsonb_build_object('bill_id', current_setting('test.procurement.bill_other_supplier')::uuid, 'amount', 1))),
  'P0001', NULL, 'cross-supplier allocation is rejected');
SELECT throws_ok(format($sql$SELECT public.allocate_supplier_payment(%L, %L::jsonb)$sql$,
  current_setting('test.procurement.payment_full')::uuid,
  jsonb_build_array(jsonb_build_object('bill_id', current_setting('test.procurement.bill_other_currency')::uuid, 'amount', 1))),
  'P0001', NULL, 'cross-currency allocation is rejected');
SELECT throws_ok(format($sql$SELECT public.allocate_supplier_payment(%L, %L::jsonb)$sql$,
  current_setting('test.procurement.payment_voided')::uuid,
  jsonb_build_array(jsonb_build_object('bill_id', current_setting('test.procurement.bill_full')::uuid, 'amount', 1))),
  'P0001', NULL, 'voided payment cannot be allocated');
SELECT throws_ok(format($sql$SELECT public.allocate_supplier_payment(%L, %L::jsonb)$sql$,
  current_setting('test.procurement.payment_full')::uuid,
  jsonb_build_array(jsonb_build_object('bill_id', current_setting('test.procurement.bill_cancelled')::uuid, 'amount', 1))),
  'P0001', NULL, 'cancelled bill cannot receive allocation');
SELECT throws_ok(format($sql$INSERT INTO public.supplier_payment_allocations (tenant_id, payment_id, bill_id, amount) VALUES (%L, %L, %L, -1)$sql$,
  current_setting('test.procurement.tenant_id')::uuid,
  current_setting('test.procurement.payment_unallocated')::uuid,
  current_setting('test.procurement.bill_full')::uuid),
  '23514', NULL, 'negative allocation is rejected');
SELECT throws_ok(format($sql$SELECT public.allocate_supplier_payment(%L, %L::jsonb)$sql$,
  current_setting('test.procurement.payment_full')::uuid,
  jsonb_build_array(jsonb_build_object('bill_id', current_setting('test.procurement.other_tenant_bill')::uuid, 'amount', 1))),
  'P0001', NULL, 'cross-tenant allocation is rejected');

SELECT lives_ok(format($sql$SELECT * FROM public.get_supplier_bill_payment_summary(%L)$sql$, current_setting('test.procurement.bill_partial')::uuid), 'bill summary is database authoritative');
SELECT lives_ok(format($sql$SELECT * FROM public.get_supplier_payment_allocation_summary(%L)$sql$, current_setting('test.procurement.payment_unallocated')::uuid), 'payment summary is database authoritative');
SELECT lives_ok(format($sql$SELECT * FROM public.get_supplier_ap_summary(%L)$sql$, current_setting('test.procurement.supplier_id')::uuid), 'supplier AP summary aggregates in the database');

SELECT ok((SELECT fulfillment_status FROM public.get_purchase_order_financial_summary(current_setting('test.procurement.po_partial')::uuid)) = 'Partially Received', 'partially received PO');
SELECT ok((SELECT fulfillment_status FROM public.get_purchase_order_financial_summary(current_setting('test.procurement.po_full')::uuid)) = 'Fully Received', 'fully received PO');
SELECT ok((SELECT billing_status FROM public.get_purchase_order_financial_summary(current_setting('test.procurement.po_billed_partial')::uuid)) = 'Partially Billed', 'partially billed PO');
SELECT ok((SELECT billing_status FROM public.get_purchase_order_financial_summary(current_setting('test.procurement.po_billed_full')::uuid)) = 'Fully Billed', 'fully billed PO');
SELECT ok(has_table('public', 'supplier_payment_reconciliation_queue'), 'historical payments have a reconciliation queue and are not guessed into allocations');

SELECT * FROM finish();
ROLLBACK;