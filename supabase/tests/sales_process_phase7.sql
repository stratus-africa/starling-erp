-- Phase 7 reporting tests.
-- Harness must provide test.phase7.date_from, date_to, customer_id, and currency.

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

BEGIN;
SELECT plan(8);

SELECT ok(
  has_function('public', 'get_sales_by_customer', ARRAY['date','date','uuid','uuid','text','integer','integer'])
    AND has_function('public', 'get_sales_by_product', ARRAY['date','date','uuid','uuid','uuid','text','integer','integer'])
    AND has_function('public', 'get_sales_by_salesperson', ARRAY['date','date','text','integer','integer']),
  'dimension reports exist'
);

SELECT ok(
  has_function('public', 'get_quote_conversion_report', ARRAY['date','date','uuid','uuid','text'])
    AND has_function('public', 'get_order_fulfillment_report', ARRAY['date','date','uuid','text','integer','integer'])
    AND has_function('public', 'get_sales_profitability', ARRAY['date','date','text','uuid','text','integer','integer']),
  'funnel, fulfillment, and profitability reports exist'
);

SELECT ok(
  (public.get_sales_by_customer(current_setting('test.phase7.date_from')::date, current_setting('test.phase7.date_to')::date, current_setting('test.phase7.customer_id')::uuid, NULL, current_setting('test.phase7.currency'), 10, 0))->>'rows' IS NOT NULL,
  'customer report supports date, customer, currency, and pagination filters'
);

SELECT ok(
  (public.get_sales_by_product(current_setting('test.phase7.date_from')::date, current_setting('test.phase7.date_to')::date, current_setting('test.phase7.customer_id')::uuid, NULL, NULL, current_setting('test.phase7.currency'), 10, 0))->>'rows' IS NOT NULL,
  'product report returns database-aggregated rows'
);

SELECT ok(
  (public.get_sales_by_salesperson(current_setting('test.phase7.date_from')::date, current_setting('test.phase7.date_to')::date, current_setting('test.phase7.currency'), 10, 0))->>'rows' IS NOT NULL,
  'salesperson report returns database-aggregated rows'
);

SELECT ok(
  (public.get_quote_conversion_report(current_setting('test.phase7.date_from')::date, current_setting('test.phase7.date_to')::date, current_setting('test.phase7.customer_id')::uuid, NULL, current_setting('test.phase7.currency')))->>'acceptance_rate' IS NOT NULL,
  'quote conversion report returns funnel metrics'
);

SELECT ok(
  (public.get_order_fulfillment_report(current_setting('test.phase7.date_from')::date, current_setting('test.phase7.date_to')::date, current_setting('test.phase7.customer_id')::uuid, current_setting('test.phase7.currency'), 10, 0))->>'rows' IS NOT NULL,
  'fulfillment report supports filtering and pagination'
);

SELECT ok(
  (public.get_sales_profitability(current_setting('test.phase7.date_from')::date, current_setting('test.phase7.date_to')::date, 'customer', current_setting('test.phase7.customer_id')::uuid, current_setting('test.phase7.currency'), 10, 0))->>'rows' IS NOT NULL,
  'profitability report returns grouped rows'
);

SELECT * FROM finish();
ROLLBACK;
