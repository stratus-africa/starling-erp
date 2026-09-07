-- Phase 5 supplier bill/AP workflow tests.
-- The harness supplies authenticated fixture IDs under test.phase5.*.
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

BEGIN;
SELECT plan(27);

SELECT ok(has_function('public', 'create_supplier_bill', ARRAY['uuid','date','date','text','text','uuid','uuid','jsonb','text','text']), 'supplier bill creation RPC exists');
SELECT ok(has_function('public', 'get_supplier_bill_ap_detail', ARRAY['uuid']), 'authoritative bill AP detail RPC exists');
SELECT ok(has_function('public', 'apply_supplier_credit_note', ARRAY['uuid','uuid','numeric']), 'supplier credit application RPC exists');
SELECT ok(has_function('public', 'transition_supplier_bill', ARRAY['uuid','text','text']), 'bill approval/post transition RPC exists');
SELECT ok(has_function('public', 'validate_supplier_bill_against_po', ARRAY['uuid']), 'bill matching validation exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'bills_supplier_invoice_new_unique_idx'), 'duplicate invoice concurrency index exists');

SELECT lives_ok(format($sql$SELECT public.create_supplier_bill(%L, CURRENT_DATE, CURRENT_DATE + 30, 'KES', 'STANDALONE-1', NULL, NULL, %L::jsonb, 'Standalone bill', NULL)$sql$,
  current_setting('test.phase5.supplier_id')::uuid,
  jsonb_build_array(jsonb_build_object('description','Consulting','quantity',1,'unit_price',10000,'tax_pct',0)), 'standalone bill can be created');
SELECT is((SELECT status FROM public.bills WHERE supplier_invoice_number = 'STANDALONE-1'), 'Draft', 'new bill starts Draft');

SELECT lives_ok(format($sql$SELECT public.create_supplier_bill(%L, CURRENT_DATE, CURRENT_DATE + 30, 'KES', 'PO-BILL-1', %L, NULL, %L::jsonb, NULL, NULL)$sql$,
  current_setting('test.phase5.supplier_id')::uuid,
  current_setting('test.phase5.po_id')::uuid,
  jsonb_build_array(jsonb_build_object('item_id', current_setting('test.phase5.item_id')::uuid, 'description','PO item','quantity',5,'unit_price',1000,'tax_pct',0)), 'PO bill preserves source relationship');
SELECT is((SELECT source_po_id FROM public.bills WHERE supplier_invoice_number = 'PO-BILL-1'), current_setting('test.phase5.po_id')::uuid, 'PO source relationship is preserved');

SELECT lives_ok(format($sql$SELECT public.create_supplier_bill(%L, CURRENT_DATE, CURRENT_DATE + 30, 'KES', 'RECEIPT-BILL-1', NULL, %L, %L::jsonb, NULL, NULL)$sql$,
  current_setting('test.phase5.supplier_id')::uuid,
  current_setting('test.phase5.receipt_id')::uuid,
  jsonb_build_array(jsonb_build_object('item_id', current_setting('test.phase5.item_id')::uuid, 'description','Received item','quantity',1,'unit_price',1000,'tax_pct',0)), 'receipt bill preserves source relationship');
SELECT is((SELECT source_receipt_id FROM public.bills WHERE supplier_invoice_number = 'RECEIPT-BILL-1'), current_setting('test.phase5.receipt_id')::uuid, 'receipt source relationship is preserved');

SELECT throws_ok(format($sql$SELECT public.create_supplier_bill(%L, CURRENT_DATE, CURRENT_DATE + 30, 'KES', %L, NULL, NULL, %L::jsonb, NULL, NULL)$sql$,
  current_setting('test.phase5.supplier_id')::uuid,
  'STANDALONE-1',
  jsonb_build_array(jsonb_build_object('description','Duplicate','quantity',1,'unit_price',10000))), 'P0001', NULL, 'duplicate supplier invoice is blocked');
SELECT lives_ok(format($sql$SELECT public.create_supplier_bill(%L, CURRENT_DATE, CURRENT_DATE + 30, 'KES', 'STANDALONE-1', NULL, NULL, %L::jsonb, NULL, 'Approved duplicate for test')$sql$,
  current_setting('test.phase5.supplier_id')::uuid,
  jsonb_build_array(jsonb_build_object('description','Duplicate override','quantity',1,'unit_price',10000))), 'authorized duplicate override is recorded');

SELECT lives_ok(format($sql$SELECT public.transition_supplier_bill(%L, 'Pending Approval', 'Submit bill')$sql$, current_setting('test.phase5.draft_bill')::uuid), 'bill enters approval');
SELECT lives_ok(format($sql$SELECT public.transition_supplier_bill(%L, 'Approved', 'Approve bill')$sql$, current_setting('test.phase5.pending_bill')::uuid), 'bill approval succeeds');
SELECT lives_ok(format($sql$SELECT public.transition_supplier_bill(%L, 'Posted', 'Post bill')$sql$, current_setting('test.phase5.approved_bill')::uuid), 'approved bill posts through accounting engine');
SELECT ok(EXISTS (SELECT 1 FROM public.journal_entries WHERE source_ref_type = 'bill' AND source_ref_id = current_setting('test.phase5.approved_bill')::uuid AND deleted_at IS NULL), 'bill posting creates accounting journal');
SELECT throws_ok(format($sql$SELECT public.transition_supplier_bill(%L, 'Posted', 'Invalid post')$sql$, current_setting('test.phase5.draft_bill')::uuid), 'P0001', NULL, 'invalid bill posting transition is rejected');

SELECT lives_ok(format($sql$SELECT * FROM public.get_supplier_bill_ap_detail(%L)$sql$, current_setting('test.phase5.posted_bill')::uuid), 'bill AP detail returns authoritative financial summary');
SELECT is((SELECT payment_status FROM public.get_supplier_bill_ap_detail(current_setting('test.phase5.overdue_bill')::uuid)), 'Overdue', 'overdue requires due date and posted outstanding bill');
SELECT is((SELECT days_overdue > 0 FROM public.get_supplier_bill_ap_detail(current_setting('test.phase5.overdue_bill')::uuid)), true, 'days overdue is calculated server-side');

SELECT lives_ok(format($sql$SELECT public.apply_supplier_credit_note(%L, %L, 100)$sql$,
  current_setting('test.phase5.credit_note_id')::uuid,
  current_setting('test.phase5.posted_bill')::uuid), 'supplier credit can be applied');
SELECT ok((SELECT credit_applied >= 100 FROM public.get_supplier_bill_ap_detail(current_setting('test.phase5.posted_bill')::uuid)), 'credit application reduces authoritative outstanding balance');

SELECT is((SELECT match_status FROM public.validate_supplier_bill_against_po(current_setting('test.phase5.exception_bill')::uuid)), 'Exception', 'matching exception is visible to AP');
SELECT throws_ok(format($sql$SELECT public.transition_supplier_bill(%L, 'Posted', 'Exception should block')$sql$, current_setting('test.phase5.exception_bill')::uuid), 'P0001', NULL, 'matching exception blocks posting');
SELECT throws_ok(format($sql$SELECT public.create_supplier_bill(%L, CURRENT_DATE, NULL, 'KES', 'OTHER-TENANT', NULL, NULL, %L::jsonb, NULL, NULL)$sql$,
  current_setting('test.phase5.other_tenant_supplier')::uuid,
  jsonb_build_array(jsonb_build_object('description','Invalid tenant','quantity',1,'unit_price',1))), NULL, NULL, 'cross-tenant bill creation is rejected');

SELECT * FROM finish();
ROLLBACK;