-- Phase 3 canonical status and transition tests.
-- Fixture UUIDs are supplied by the database test harness via test.phase3.*.

BEGIN;
SELECT plan(17);

SELECT is(
  (SELECT status FROM public.sales_quotes WHERE id = current_setting('test.phase3.draft_quote')::uuid),
  'Draft', 'quotes use Draft as the initial lifecycle state'
);

SELECT lives_ok(
  format($sql$UPDATE public.sales_quotes SET status = 'Sent' WHERE id = %L$sql$, current_setting('test.phase3.draft_quote')),
  'Draft quote can transition to Sent'
);

SELECT lives_ok(
  format($sql$UPDATE public.sales_quotes SET status = 'Accepted' WHERE id = %L$sql$, current_setting('test.phase3.accepted_quote')),
  'quote can transition to Accepted'
);

SELECT throws_ok(
  format($sql$SELECT public.convert_quote_to_order(%L)$sql$, current_setting('test.phase3.expired_quote')),
  'P0001', NULL, 'expired quote cannot be converted'
);

SELECT lives_ok(
  format($sql$SELECT public.convert_quote_to_order(%L)$sql$, current_setting('test.phase3.accepted_quote')),
  'accepted quote converts to an order'
);

SELECT lives_ok(
  format($sql$SELECT public.convert_quote_to_order(%L)$sql$, current_setting('test.phase3.accepted_quote')),
  'quote conversion is idempotent'
);

SELECT throws_ok(
  format($sql$UPDATE public.sales_quotes SET status = 'open' WHERE id = %L$sql$, current_setting('test.phase3.draft_quote')),
  '23514', NULL, 'legacy quote lifecycle values are rejected'
);

SELECT throws_ok(
  format($sql$UPDATE public.sales_orders SET status = 'invoiced' WHERE id = %L$sql$, current_setting('test.phase3.order_id')),
  '23514', NULL, 'invoicing is not stored in order lifecycle status'
);

SELECT lives_ok(
  format($sql$UPDATE public.sales_orders SET fulfillment_status = 'Partially Fulfilled' WHERE id = %L$sql$, current_setting('test.phase3.order_id')),
  'partial fulfillment is an independent order dimension'
);

SELECT lives_ok(
  format($sql$UPDATE public.sales_orders SET invoice_status = 'Partially Invoiced' WHERE id = %L$sql$, current_setting('test.phase3.order_id')),
  'partial invoicing is an independent order dimension'
);

SELECT lives_ok(
  format($sql$UPDATE public.sales_orders SET payment_status = 'Partially Paid' WHERE id = %L$sql$, current_setting('test.phase3.order_id')),
  'partial payment is an independent order dimension'
);

SELECT lives_ok(
  format($sql$UPDATE public.invoices SET status = 'Overdue' WHERE id = %L$sql$, current_setting('test.phase3.invoice_id')),
  'overdue is a valid invoice lifecycle state'
);

SELECT lives_ok(
  format($sql$UPDATE public.invoices SET payment_status = 'Partially Allocated' WHERE id = %L$sql$, current_setting('test.phase3.invoice_id')),
  'partial allocation is an independent invoice payment state'
);

SELECT lives_ok(
  format($sql$UPDATE public.payments_received SET allocation_status = 'Fully Allocated' WHERE id = %L$sql$, current_setting('test.phase3.payment_id')),
  'fully allocated is a valid payment allocation state'
);

SELECT throws_ok(
  format($sql$UPDATE public.invoices SET payment_status = 'Paid' WHERE id = %L$sql$, current_setting('test.phase3.invoice_id')),
  '23514', NULL, 'invoice lifecycle values cannot be used as allocation states'
);

SELECT throws_ok(
  format($sql$UPDATE public.payments_received SET status = 'Partially Paid' WHERE id = %L$sql$, current_setting('test.phase3.payment_id')),
  '23514', NULL, 'payment allocation values cannot be used as lifecycle states'
);

SELECT ok(
  has_table('public', 'payment_allocations')
    AND has_function('public', 'refresh_invoice_payment_status', ARRAY['uuid']),
  'allocation refresh infrastructure exists'
);

SELECT * FROM finish();
ROLLBACK;
