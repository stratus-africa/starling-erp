-- Phase 6 AR, aging, collections, and statement tests.
-- The harness must provide test.phase6.customer_id, date_from, and date_to.

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

BEGIN;
SELECT plan(8);

SELECT ok(
  has_function('public', 'get_customer_ar_summary', ARRAY['uuid'])
    AND has_function('public', 'get_ar_aging', ARRAY['date', 'date', 'uuid', 'uuid'])
    AND has_function('public', 'get_collections_report', ARRAY['date', 'date', 'uuid'])
    AND has_function('public', 'get_customer_statement', ARRAY['uuid', 'date', 'date']),
  'AR reporting functions exist'
);

SELECT ok(
  (public.get_customer_ar_summary(current_setting('test.phase6.customer_id')::uuid))->>'outstanding' IS NOT NULL,
  'customer AR summary returns outstanding balance'
);

SELECT ok(
  (public.get_ar_aging(current_setting('test.phase6.date_from')::date, current_setting('test.phase6.date_to')::date, current_setting('test.phase6.customer_id')::uuid, NULL)->'buckets') IS NOT NULL,
  'AR aging returns current and overdue buckets'
);

SELECT ok(
  (public.get_ar_aging(current_setting('test.phase6.date_from')::date, current_setting('test.phase6.date_to')::date, current_setting('test.phase6.customer_id')::uuid, NULL)->'rows') IS NOT NULL,
  'AR aging supports customer filtering'
);

SELECT ok(
  (public.get_collections_report(current_setting('test.phase6.date_from')::date, current_setting('test.phase6.date_to')::date, current_setting('test.phase6.customer_id')::uuid))->>'opening_ar' IS NOT NULL,
  'collections returns opening AR and period totals'
);

SELECT ok(
  (public.get_collections_report(current_setting('test.phase6.date_from')::date, current_setting('test.phase6.date_to')::date, current_setting('test.phase6.customer_id')::uuid))->>'unallocated_payments' IS NOT NULL,
  'collections returns unallocated payments'
);

SELECT ok(
  (public.get_customer_statement(current_setting('test.phase6.customer_id')::uuid, current_setting('test.phase6.date_from')::date, current_setting('test.phase6.date_to')::date))->>'opening_balance' IS NOT NULL,
  'customer statement returns opening balance'
);

SELECT ok(
  ((public.get_customer_statement(current_setting('test.phase6.customer_id')::uuid, current_setting('test.phase6.date_from')::date, current_setting('test.phase6.date_to')::date))->>'closing_balance')::numeric =
  ((public.get_customer_statement(current_setting('test.phase6.customer_id')::uuid, current_setting('test.phase6.date_from')::date, current_setting('test.phase6.date_to')::date))->>'opening_balance')::numeric +
  ((public.get_customer_statement(current_setting('test.phase6.customer_id')::uuid, current_setting('test.phase6.date_from')::date, current_setting('test.phase6.date_to')::date))->>'total_debits')::numeric -
  ((public.get_customer_statement(current_setting('test.phase6.customer_id')::uuid, current_setting('test.phase6.date_from')::date, current_setting('test.phase6.date_to')::date))->>'total_credits')::numeric,
  'statement closing balance equals opening plus debits less credits'
);

SELECT * FROM finish();
ROLLBACK;
