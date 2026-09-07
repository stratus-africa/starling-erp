-- Phase 8 dashboard tests.
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

BEGIN;
SELECT plan(8);

SELECT ok(has_function('public', 'get_purchases_dashboard', ARRAY['date','date','text']), 'purchases dashboard RPC exists');
SELECT lives_ok($sql$SELECT public.get_purchases_dashboard(DATE '2026-01-01', DATE '2026-12-31', 'KES')$sql$, 'dashboard accepts reporting period and currency');
SELECT lives_ok($sql$SELECT public.get_purchases_dashboard(DATE '2026-09-01', DATE '2026-09-07', NULL)$sql$, 'dashboard supports mixed-currency grouping mode');
SELECT ok((public.get_purchases_dashboard(DATE '2026-01-01', DATE '2026-12-31', 'KES')->'kpis') IS NOT NULL, 'dashboard returns KPI payload');
SELECT ok((public.get_purchases_dashboard(DATE '2026-01-01', DATE '2026-12-31', 'KES')->'supplier_spend') IS NOT NULL, 'dashboard returns supplier spend dataset');
SELECT ok((public.get_purchases_dashboard(DATE '2026-01-01', DATE '2026-12-31', 'KES')->'ap_aging') IS NOT NULL, 'dashboard returns AP aging dataset');
SELECT ok((public.get_purchases_dashboard(DATE '2026-01-01', DATE '2026-12-31', 'KES')->'funnel') IS NOT NULL, 'dashboard returns procurement funnel dataset');
SELECT throws_ok($sql$SELECT public.get_purchases_dashboard(DATE '2026-01-01', DATE '2026-12-31', NULL)$sql$, '42501', NULL, 'dashboard requires reports permission');

SELECT * FROM finish();
ROLLBACK;