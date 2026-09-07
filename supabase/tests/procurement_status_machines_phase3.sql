-- Phase 3 state-machine tests.
-- The harness supplies authenticated fixture IDs under test.phase3.*.
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

BEGIN;
SELECT plan(34);

SELECT ok(has_function('public', 'transition_purchase_requisition', ARRAY['uuid','text','text']), 'requisition transition RPC exists');
SELECT ok(has_function('public', 'transition_purchase_order', ARRAY['uuid','text','text','boolean']), 'purchase order transition RPC exists');
SELECT ok(has_function('public', 'transition_supplier_bill', ARRAY['uuid','text','text']), 'supplier bill transition RPC exists');
SELECT ok(has_function('public', 'transition_supplier_payment', ARRAY['uuid','text','text']), 'supplier payment transition RPC exists');
SELECT ok(has_function('public', 'transition_expense', ARRAY['uuid','text','text']), 'expense transition RPC exists');
SELECT ok(has_function('public', 'convert_requisition_to_purchase_order', ARRAY['uuid','uuid','date','date','text','text','jsonb']), 'transactional requisition conversion RPC exists');

SELECT is(public.procurement_status_transition_allowed('purchase_requisition','Draft','Submitted'), true, 'requisition submission is valid');
SELECT is(public.procurement_status_transition_allowed('purchase_requisition','Submitted','Pending Approval'), true, 'requisition approval routing is valid');
SELECT is(public.procurement_status_transition_allowed('purchase_requisition','Pending Approval','Approved'), true, 'requisition approval is valid');
SELECT is(public.procurement_status_transition_allowed('purchase_requisition','Pending Approval','Rejected'), true, 'requisition rejection is valid');
SELECT is(public.procurement_status_transition_allowed('purchase_requisition','Approved','Converted'), true, 'requisition conversion is valid');
SELECT is(public.procurement_status_transition_allowed('purchase_requisition','Draft','Cancelled'), true, 'draft requisition cancellation is valid');
SELECT is(public.procurement_status_transition_allowed('purchase_requisition','Submitted','Approved'), false, 'requisition cannot skip pending approval');

SELECT is(public.procurement_status_transition_allowed('purchase_order','Draft','Pending Approval'), true, 'PO submission is valid');
SELECT is(public.procurement_status_transition_allowed('purchase_order','Pending Approval','Approved'), true, 'PO approval is valid');
SELECT is(public.procurement_status_transition_allowed('purchase_order','Approved','Sent'), true, 'PO sending is valid');
SELECT is(public.procurement_status_transition_allowed('purchase_order','Sent','Acknowledged'), true, 'PO acknowledgement is valid');
SELECT is(public.procurement_status_transition_allowed('purchase_order','Acknowledged','Closed'), true, 'PO closing is valid');
SELECT is(public.procurement_status_transition_allowed('purchase_order','Draft','Sent'), false, 'PO cannot be sent before approval');

SELECT is(public.procurement_status_transition_allowed('supplier_bill','Draft','Pending Approval'), true, 'bill submission is valid');
SELECT is(public.procurement_status_transition_allowed('supplier_bill','Approved','Posted'), true, 'bill posting is valid');
SELECT is(public.procurement_status_transition_allowed('supplier_bill','Draft','Posted'), false, 'bill cannot skip approval');
SELECT is(public.procurement_status_transition_allowed('supplier_payment','Draft','Posted'), true, 'payment posting is valid');
SELECT is(public.procurement_status_transition_allowed('supplier_payment','Posted','Voided'), true, 'payment void is valid');
SELECT is(public.procurement_status_transition_allowed('supplier_payment','Voided','Posted'), false, 'voided payment cannot be reposted');
SELECT is(public.procurement_status_transition_allowed('expense','Draft','Submitted'), true, 'expense submission is valid');
SELECT is(public.procurement_status_transition_allowed('expense','Pending Approval','Rejected'), true, 'expense rejection is valid');
SELECT is(public.procurement_status_transition_allowed('expense','Approved','Posted'), true, 'expense posting is valid');
SELECT is(public.procurement_status_transition_allowed('expense','Draft','Posted'), false, 'expense cannot skip approval');

SELECT lives_ok(format($sql$SELECT public.transition_purchase_requisition(%L, 'Submitted', 'Phase 3 test')$sql$,
  current_setting('test.phase3.draft_requisition')::uuid), 'requisition transition enforces tenant and state server-side');
SELECT lives_ok(format($sql$SELECT public.convert_requisition_to_purchase_order(%L, %L, CURRENT_DATE, NULL, 'KES', 'Phase 3 conversion', '[]'::jsonb)$sql$,
  current_setting('test.phase3.approved_requisition')::uuid,
  current_setting('test.phase3.supplier_id')::uuid), 'requisition conversion is transactional');
SELECT is((SELECT public.convert_requisition_to_purchase_order(current_setting('test.phase3.converted_requisition')::uuid, current_setting('test.phase3.supplier_id')::uuid, CURRENT_DATE, NULL, 'KES', NULL, '[]'::jsonb)), (SELECT converted_po_id FROM public.purchase_requisitions WHERE id = current_setting('test.phase3.converted_requisition')::uuid), 'duplicate conversion returns the existing PO');

SELECT ok(has_function('public', 'refresh_purchase_order_status', ARRAY['uuid']) AND has_function('public', 'refresh_supplier_bill_status', ARRAY['uuid']) AND has_function('public', 'refresh_supplier_payment_status', ARRAY['uuid']) AND has_function('public', 'refresh_expense_status', ARRAY['uuid']), 'derived status refresh functions exist');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_refresh_supplier_payment_dependents'), 'allocation changes refresh dependent statuses');

SELECT * FROM finish();
ROLLBACK;