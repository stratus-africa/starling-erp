-- Phase 6 expense and employee reimbursement tests.
-- The harness supplies authenticated fixture IDs under test.phase6.*.
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

BEGIN;
SELECT plan(30);

SELECT ok(has_function('public', 'create_expense', ARRAY['date','numeric','numeric','numeric','text','text','uuid','uuid','text','text','text','text','text','text','text','text','text','text','boolean','uuid','text']), 'expense creation RPC exists');
SELECT ok(has_function('public', 'submit_expense', ARRAY['uuid']), 'expense submission RPC exists');
SELECT ok(has_function('public', 'approve_expense', ARRAY['uuid','text']) AND has_function('public', 'reject_expense', ARRAY['uuid','text']), 'expense approval RPCs exist');
SELECT ok(has_function('public', 'create_reimbursement', ARRAY['uuid','text','jsonb','date','uuid','text']) AND has_function('public', 'post_reimbursement', ARRAY['uuid']), 'reimbursement RPCs exist');
SELECT ok(has_function('public', 'get_expense_summary', ARRAY['uuid']) AND has_function('public', 'get_employee_reimbursement_summary', ARRAY['uuid']), 'expense summary RPCs exist');
SELECT ok(has_table('public', 'expense_reimbursement_allocations'), 'reimbursement allocation table exists');

SELECT lives_ok(format($sql$SELECT public.create_expense(CURRENT_DATE, 200, 20, 220, 'KES', 'Travel', %L, %L, 'Airport Taxi', 'Cash', 'EXP-PH6-1', 'Finance', 'CC-100', 'Project A', NULL, 'Client travel', 'Business trip', 'Missing', false, NULL, NULL)$sql$,
  current_setting('test.phase6.expense_account')::uuid, current_setting('test.phase6.employee_id')::uuid), 'expense creation succeeds');
SELECT is((SELECT status FROM public.expenses WHERE reference = 'EXP-PH6-1'), 'Draft', 'expense starts Draft');
SELECT is((SELECT department FROM public.expenses WHERE reference = 'EXP-PH6-1'), 'Finance', 'department dimension is stored');
SELECT is((SELECT cost_center FROM public.expenses WHERE reference = 'EXP-PH6-1'), 'CC-100', 'cost center dimension is stored');
SELECT is((SELECT project FROM public.expenses WHERE reference = 'EXP-PH6-1'), 'Project A', 'project dimension is stored');

SELECT throws_ok(format($sql$SELECT public.create_expense(CURRENT_DATE, 100, 0, 100, 'KES', 'Travel', %L, %L, 'Receipt Required Merchant', 'Cash', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Missing', true, NULL, NULL)$sql$,
  current_setting('test.phase6.expense_account')::uuid, current_setting('test.phase6.employee_id')::uuid), 'P0001', NULL, 'required receipt blocks invalid creation');
SELECT throws_ok(format($sql$SELECT public.create_expense(CURRENT_DATE, 200, 0, 200, 'KES', 'Travel', %L, %L, 'Airport Taxi', 'Cash', 'EXP-PH6-1', NULL, NULL, NULL, NULL, NULL, NULL, 'Attached', false, NULL, NULL)$sql$,
  current_setting('test.phase6.expense_account')::uuid, current_setting('test.phase6.employee_id')::uuid), 'P0001', NULL, 'duplicate expense is blocked');

SELECT lives_ok(format($sql$SELECT public.submit_expense(%L)$sql$, current_setting('test.phase6.draft_expense')::uuid), 'expense submission succeeds');
SELECT is((SELECT status FROM public.expenses WHERE id = current_setting('test.phase6.draft_expense')::uuid), 'Pending Approval', 'submission enters approval state');
SELECT lives_ok(format($sql$SELECT public.approve_expense(%L, 'Phase 6 approved')$sql$, current_setting('test.phase6.pending_expense')::uuid), 'expense approval succeeds');
SELECT lives_ok(format($sql$SELECT public.transition_expense(%L, 'Posted', 'Phase 6 posted')$sql$, current_setting('test.phase6.approved_expense')::uuid), 'approved expense posts through accounting engine');
SELECT ok(EXISTS (SELECT 1 FROM public.journal_entries WHERE source_ref_type = 'expense' AND source_ref_id = current_setting('test.phase6.approved_expense')::uuid AND deleted_at IS NULL), 'expense posting creates accounting journal');
SELECT throws_ok(format($sql$SELECT public.transition_expense(%L, 'Posted', 'Invalid post')$sql$, current_setting('test.phase6.draft_expense')::uuid), 'P0001', NULL, 'unapproved expense posting rolls back');

SELECT lives_ok(format($sql$SELECT public.create_reimbursement(%L, 'KES', %L::jsonb, CURRENT_DATE, NULL, 'Phase 6 reimbursement')$sql$,
  current_setting('test.phase6.employee_id')::uuid,
  jsonb_build_array(jsonb_build_object('expense_id', current_setting('test.phase6.expense_a')::uuid, 'amount', 20000), jsonb_build_object('expense_id', current_setting('test.phase6.expense_b')::uuid, 'amount', 15000))), 'one reimbursement can allocate multiple expenses');
SELECT is((SELECT status FROM public.employee_reimbursements WHERE notes = 'Phase 6 reimbursement'), 'Pending', 'reimbursement starts Pending');
SELECT ok((SELECT total = 35000 FROM public.employee_reimbursements WHERE notes = 'Phase 6 reimbursement'), 'reimbursement total aggregates allocations');
SELECT lives_ok(format($sql$SELECT public.approve_reimbursement(%L)$sql$, current_setting('test.phase6.reimbursement_id')::uuid), 'reimbursement approval succeeds');
SELECT lives_ok(format($sql$SELECT public.post_reimbursement(%L)$sql$, current_setting('test.phase6.reimbursement_id')::uuid), 'reimbursement payment posts transactionally');
SELECT is((SELECT status FROM public.employee_reimbursements WHERE id = current_setting('test.phase6.reimbursement_id')::uuid), 'Paid', 'reimbursement becomes Paid only after posting');
SELECT ok((SELECT reimbursement_status IN ('Partially Reimbursed','Reimbursed') FROM public.expenses WHERE id = current_setting('test.phase6.expense_a')::uuid), 'expense reimbursement state is refreshed after payment');

SELECT throws_ok(format($sql$SELECT public.create_reimbursement(%L, 'KES', %L::jsonb, CURRENT_DATE, NULL, 'Duplicate reimbursement')$sql$,
  current_setting('test.phase6.employee_id')::uuid,
  jsonb_build_array(jsonb_build_object('expense_id', current_setting('test.phase6.expense_a')::uuid, 'amount', 1))), 'P0001', NULL, 'duplicate reimbursement allocation is rejected');
SELECT throws_ok(format($sql$SELECT public.create_expense(CURRENT_DATE, 10, 0, 10, 'KES', 'Travel', %L, %L, 'Other Tenant', 'Cash', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Attached', false, NULL, NULL)$sql$,
  current_setting('test.phase6.expense_account')::uuid, current_setting('test.phase6.other_tenant_employee')::uuid), NULL, NULL, 'cross-tenant employee expense is rejected');

SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mark_expense_receipt_attached'), 'receipt attachment status trigger exists');
SELECT ok((SELECT accounting_status = 'Posted' FROM public.expenses WHERE id = current_setting('test.phase6.approved_expense')::uuid), 'posted expense accounting status is authoritative');

SELECT * FROM finish();
ROLLBACK;