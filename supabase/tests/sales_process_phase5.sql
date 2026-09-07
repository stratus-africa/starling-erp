-- Phase 5 database tests for transactional Sales Order invoicing.
-- The harness must provide an authenticated tenant and fixture UUID settings:
-- test.phase5.order_id, order_line_id, excess_quantity, valid_quantity.

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

BEGIN;
SELECT plan(5);

SELECT ok(
  has_function('public', 'get_sales_order_invoicing_status', ARRAY['uuid'])
    AND has_function('public', 'create_invoice_from_sales_order', ARRAY['uuid', 'jsonb']),
  'invoicing status and transactional invoice creation functions exist'
);

SELECT ok(
  (public.get_sales_order_invoicing_status(current_setting('test.phase5.order_id')::uuid)->'lines') IS NOT NULL,
  'invoicing status returns line-level remaining quantities'
);

SELECT lives_ok(
  format($sql$SELECT public.create_invoice_from_sales_order(%L, %L::jsonb)$sql$,
    current_setting('test.phase5.order_id')::uuid,
    jsonb_build_array(jsonb_build_object(
      'order_line_id', current_setting('test.phase5.order_line_id')::uuid,
      'quantity', current_setting('test.phase5.valid_quantity')::numeric
    ))),
  'a valid partial invoice request succeeds'
);

SELECT throws_ok(
  format($sql$SELECT public.create_invoice_from_sales_order(%L, %L::jsonb)$sql$,
    current_setting('test.phase5.order_id')::uuid,
    jsonb_build_array(jsonb_build_object(
      'order_line_id', current_setting('test.phase5.order_line_id')::uuid,
      'quantity', current_setting('test.phase5.excess_quantity')::numeric
    ))),
  'P0001', NULL,
  'invoice quantity above remaining quantity is rejected'
);

SELECT throws_ok(
  format($sql$SELECT public.create_invoice_from_sales_order(%L, %L::jsonb)$sql$,
    current_setting('test.phase5.order_id')::uuid,
    jsonb_build_array(jsonb_build_object(
      'order_line_id', current_setting('test.phase5.order_line_id')::uuid,
      'quantity', 0
    ))),
  'P0001', NULL,
  'zero invoice quantity is rejected'
);

SELECT * FROM finish();
ROLLBACK;
