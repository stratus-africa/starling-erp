-- Phase 8 Sales dashboard and consistency tests.

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

BEGIN;
SELECT plan(5);

SELECT ok(has_function('public', 'get_sales_lifecycle_dashboard', ARRAY[]::text[]), 'Sales lifecycle dashboard RPC exists');

SELECT ok(
  (public.get_sales_lifecycle_dashboard())->'metrics' IS NOT NULL
    AND (public.get_sales_lifecycle_dashboard())->'trend' IS NOT NULL,
  'dashboard returns aggregated metrics and trends'
);

SELECT ok(
  ((public.get_sales_lifecycle_dashboard())->'metrics'->>'quotes_awaiting_response') IS NOT NULL
    AND ((public.get_sales_lifecycle_dashboard())->'metrics'->>'unallocated_payments') IS NOT NULL,
  'dashboard includes quote response and unallocated payment KPIs'
);

SELECT ok(
  (public.get_sales_lifecycle_dashboard())->'quote_funnel' IS NOT NULL
    AND (public.get_sales_lifecycle_dashboard())->'aging' IS NOT NULL,
  'dashboard includes quote funnel and AR aging aggregates'
);

SELECT ok(
  has_function('public', 'get_sales_overview', ARRAY['date', 'date', 'text']),
  'sales overview remains available alongside lifecycle dashboard'
);

SELECT * FROM finish();
ROLLBACK;
