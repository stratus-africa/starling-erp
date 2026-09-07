-- Phase 4 receiving and three-way matching tests.
-- The harness supplies authenticated fixture IDs under test.phase4.*.
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

BEGIN;
SELECT plan(29);

SELECT ok(has_function('public', 'create_purchase_receipt', ARRAY['uuid','uuid','text','jsonb','date','text','date','date','boolean']), 'receipt creation RPC exists');
SELECT ok(has_function('public', 'post_purchase_receipt', ARRAY['uuid']), 'receipt posting RPC exists');
SELECT ok(has_function('public', 'get_purchase_order_receiving_status', ARRAY['uuid']), 'PO receiving summary RPC exists');
SELECT ok(has_function('public', 'get_purchase_three_way_match', ARRAY['uuid']), 'three-way match RPC exists');
SELECT ok(has_function('public', 'validate_supplier_bill_against_po', ARRAY['uuid']), 'bill match validation RPC exists');
SELECT ok(has_table('public', 'procurement_match_tolerances'), 'match tolerances table exists');

SELECT lives_ok(format($sql$SELECT public.create_purchase_receipt(%L, %L, 'Goods', %L::jsonb)$sql$,
  current_setting('test.phase4.po_partial')::uuid,
  current_setting('test.phase4.warehouse_id')::uuid,
  jsonb_build_array(jsonb_build_object('purchase_order_line_id', current_setting('test.phase4.po_line')::uuid, 'accepted_quantity', 60, 'rejected_quantity', 0))), 'partial receipt is created');
SELECT is((SELECT status FROM public.goods_receipts WHERE purchase_order_id = current_setting('test.phase4.po_partial')::uuid ORDER BY created_at DESC LIMIT 1), 'Draft', 'receipt creation does not post inventory');
SELECT throws_ok(format($sql$SELECT public.create_purchase_receipt(%L, %L, 'Goods', %L::jsonb)$sql$,
  current_setting('test.phase4.po_partial')::uuid,
  current_setting('test.phase4.warehouse_id')::uuid,
  jsonb_build_array(jsonb_build_object('purchase_order_line_id', current_setting('test.phase4.po_line')::uuid, 'accepted_quantity', 1000, 'rejected_quantity', 0))), 'P0001', NULL, 'over-receipt is rejected');

SELECT lives_ok(format($sql$SELECT public.create_purchase_receipt(%L, NULL, 'Service', %L::jsonb, CURRENT_DATE, 'Monthly service', CURRENT_DATE, CURRENT_DATE)$sql$,
  current_setting('test.phase4.po_service')::uuid,
  jsonb_build_array(jsonb_build_object('purchase_order_line_id', current_setting('test.phase4.service_line')::uuid, 'accepted_quantity', 1, 'rejected_quantity', 0, 'service_amount', 5000))), 'service confirmation is created without a warehouse');
SELECT is((SELECT receipt_type FROM public.goods_receipts WHERE purchase_order_id = current_setting('test.phase4.po_service')::uuid ORDER BY created_at DESC LIMIT 1), 'Service', 'service receipt is distinct from goods receipt');

SELECT lives_ok(format($sql$SELECT public.post_purchase_receipt(%L)$sql$,
  current_setting('test.phase4.draft_receipt')::uuid), 'goods receipt posts transactionally');
SELECT ok(EXISTS (SELECT 1 FROM public.stock_movements WHERE ref_type = 'purchase_receipt' AND ref_id = current_setting('test.phase4.draft_receipt')::uuid AND quantity > 0), 'accepted receipt quantity uses existing stock movement ledger');
SELECT is((SELECT COUNT(*) FROM public.stock_movements WHERE ref_type = 'purchase_receipt' AND ref_id = current_setting('test.phase4.draft_receipt')::uuid AND quantity < 0), 0::bigint, 'receipt posting never creates outbound inventory');
SELECT is((SELECT receiving_status FROM public.purchase_orders WHERE id = current_setting('test.phase4.po_partial')::uuid), 'Partially Received', 'partial receipt updates PO receiving status');

SELECT throws_ok(format($sql$SELECT public.create_purchase_receipt(%L, %L, 'Goods', %L::jsonb)$sql$,
  current_setting('test.phase4.cancelled_po')::uuid,
  current_setting('test.phase4.warehouse_id')::uuid,
  jsonb_build_array(jsonb_build_object('purchase_order_line_id', current_setting('test.phase4.cancelled_line')::uuid, 'accepted_quantity', 1))), 'P0001', NULL, 'cancelled PO cannot receive');
SELECT throws_ok(format($sql$SELECT public.create_purchase_receipt(%L, %L, 'Goods', %L::jsonb)$sql$,
  current_setting('test.phase4.other_tenant_po')::uuid,
  current_setting('test.phase4.warehouse_id')::uuid,
  jsonb_build_array(jsonb_build_object('purchase_order_line_id', current_setting('test.phase4.other_tenant_line')::uuid, 'accepted_quantity', 1))), NULL, NULL, 'cross-tenant receipt is rejected');

SELECT lives_ok(format($sql$SELECT * FROM public.get_purchase_three_way_match(%L)$sql$, current_setting('test.phase4.matched_bill')::uuid), 'matched bill returns three-way rows');
SELECT is((SELECT match_status FROM public.validate_supplier_bill_against_po(current_setting('test.phase4.matched_bill')::uuid)), 'Matched', 'full three-way match is Matched');
SELECT is((SELECT match_status FROM public.validate_supplier_bill_against_po(current_setting('test.phase4.tolerance_bill')::uuid)), 'Within Tolerance', 'variance within tolerance is accepted');
SELECT is((SELECT match_status FROM public.validate_supplier_bill_against_po(current_setting('test.phase4.exception_bill')::uuid)), 'Exception', 'variance outside tolerance is an Exception');
SELECT ok((SELECT price_variance > 0 FROM public.validate_supplier_bill_against_po(current_setting('test.phase4.price_variance_bill')::uuid)), 'price variance is returned');
SELECT ok((SELECT quantity_variance > 0 FROM public.validate_supplier_bill_against_po(current_setting('test.phase4.quantity_variance_bill')::uuid)), 'quantity variance is returned');

SELECT throws_ok(format($sql$SELECT public.transition_supplier_bill(%L, 'Posted', 'Phase 4 match protection')$sql$,
  current_setting('test.phase4.exception_bill')::uuid), 'P0001', NULL, 'bill with exception cannot post without override');
SELECT lives_ok(format($sql$SELECT public.override_supplier_bill_match(%L, 'Approved Phase 4 variance')$sql$,
  current_setting('test.phase4.exception_bill')::uuid), 'authorized match override is recorded');

SELECT lives_ok(format($sql$SELECT public.create_purchase_receipt(%L, %L, 'Goods', %L::jsonb)$sql$,
  current_setting('test.phase4.po_rejected')::uuid,
  current_setting('test.phase4.warehouse_id')::uuid,
  jsonb_build_array(jsonb_build_object('purchase_order_line_id', current_setting('test.phase4.rejected_line')::uuid, 'accepted_quantity', 5, 'rejected_quantity', 5))), 'rejected quantity is supported');
SELECT is((SELECT rejected_quantity FROM public.goods_receipt_lines WHERE purchase_order_line_id = current_setting('test.phase4.rejected_line')::uuid ORDER BY created_at DESC LIMIT 1), 5::numeric, 'rejected quantity is stored separately');

SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_validate_supplier_bill_receipt_match'), 'bill posting match guard exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_refresh_purchase_order_after_receipt_change'), 'receipt changes refresh PO receiving status');

SELECT * FROM finish();
ROLLBACK;