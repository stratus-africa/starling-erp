-- Phase 7 reporting tests.
-- The harness supplies authenticated fixture IDs under test.phase7.*.
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

BEGIN;
SELECT plan(16);

SELECT ok(has_function('public', 'get_procurement_report', ARRAY['text','date','date','uuid','text','text','date']), 'procurement report RPC exists');
SELECT ok(has_function('public', 'get_expense_report', ARRAY['text','date','date','uuid','text','text','text']), 'expense report RPC exists');
SELECT lives_ok($sql$SELECT public.get_procurement_report('summary', DATE '2026-01-01', DATE '2026-12-31', NULL, 'KES', NULL, DATE '2026-06-30')$sql$, 'purchase summary accepts date, currency, and as-of filters');
SELECT lives_ok($sql$SELECT public.get_procurement_report('suppliers', DATE '2026-01-01', DATE '2026-12-31', NULL, NULL, NULL, DATE '2026-12-31')$sql$, 'supplier purchase aggregation is database-driven');
SELECT lives_ok($sql$SELECT public.get_procurement_report('products', DATE '2026-01-01', DATE '2026-12-31', NULL, NULL, NULL, DATE '2026-12-31')$sql$, 'product purchase aggregation is database-driven');
SELECT lives_ok($sql$SELECT public.get_procurement_report('orders', DATE '2026-01-01', DATE '2026-12-31', NULL, NULL, 'Approved', DATE '2026-12-31')$sql$, 'purchase order register supports status filters');
SELECT lives_ok(format($sql$SELECT public.get_procurement_report('payables', NULL, NULL, %L, 'KES', NULL, DATE '2026-06-30')$sql$, current_setting('test.phase7.supplier_id')::uuid), 'AP aging uses an explicit as-of date');
SELECT lives_ok(format($sql$SELECT public.get_procurement_report('supplier_statement', NULL, NULL, %L, 'KES', NULL, DATE '2026-06-30')$sql$, current_setting('test.phase7.supplier_id')::uuid), 'supplier statement accepts supplier and as-of filters');
SELECT lives_ok($sql$SELECT public.get_procurement_report('matching', DATE '2026-01-01', DATE '2026-12-31', NULL, NULL, 'Exception', DATE '2026-12-31')$sql$, 'matching report supports exception status');
SELECT lives_ok(format($sql$SELECT public.get_expense_report('summary', DATE '2026-01-01', DATE '2026-12-31', %L, 'Finance', 'KES', NULL)$sql$, current_setting('test.phase7.employee_id')::uuid), 'expense summary supports employee, department, and currency filters');
SELECT lives_ok($sql$SELECT public.get_expense_report('employees', DATE '2026-01-01', DATE '2026-12-31', NULL, NULL, NULL, 'Posted')$sql$, 'expense employee report supports status filters');
SELECT lives_ok($sql$SELECT public.get_expense_report('categories', DATE '2026-01-01', DATE '2026-12-31', NULL, NULL, 'KES', NULL)$sql$, 'expense category report is database aggregated');
SELECT lives_ok($sql$SELECT public.get_expense_report('departments', DATE '2026-01-01', DATE '2026-12-31', NULL, 'Finance', NULL, NULL)$sql$, 'expense department report supports department filters');
SELECT lives_ok($sql$SELECT public.get_expense_report('reimbursements', NULL, NULL, NULL, NULL, 'KES', NULL)$sql$, 'reimbursement report is database aggregated');
SELECT is((public.get_procurement_report('payables', NULL, NULL, NULL, 'KES', NULL, DATE '2026-06-30')->>'as_of'), '2026-06-30', 'AP report preserves historical as-of date');
SELECT throws_ok($sql$SELECT public.get_procurement_report('summary', NULL, NULL, NULL, NULL, NULL, CURRENT_DATE)$sql$, '42501', NULL, 'report access requires reports.read permission');

SELECT * FROM finish();
ROLLBACK;