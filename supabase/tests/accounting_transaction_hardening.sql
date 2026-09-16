-- Accounting transaction hardening regression tests.
-- Fixture settings are supplied by the database test harness.
-- Required: tenant_id, invoice_id, posted_invoice_id, manual_journal_id,
-- open_period_date, closed_period_date, missing_config_invoice_id,
-- unauthorized_invoice_id, reversal_invoice_id.
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

BEGIN;
SELECT plan(16);

SELECT ok(EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'post_invoice'
    AND pg_get_function_identity_arguments(p.oid) = 'uuid'
), 'invoice posting wrapper exists');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'post_manual_journal'
    AND pg_get_function_identity_arguments(p.oid) = 'uuid'
), 'manual journal posting wrapper exists');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'void_manual_journal'
    AND pg_get_function_identity_arguments(p.oid) = 'uuid, text'
), 'manual journal reversal exists');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'assert_accounting_period_mutable'
    AND pg_get_function_identity_arguments(p.oid) = ''
), 'period mutation guard exists');
SELECT ok(
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'posted_by'),
  'invoices record posted_by'
);
SELECT ok(
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'reversal_reference'),
  'invoices record reversal_reference'
);

SELECT lives_ok(
  format('SELECT public.post_invoice(%L::uuid)', current_setting('test.accounting.posted_invoice_id')),
  'posting a valid document succeeds'
);
SELECT is(
  (SELECT count(*)::text FROM public.journal_entries WHERE source_ref_type = 'invoice' AND source_ref_id = current_setting('test.accounting.posted_invoice_id')::uuid AND deleted_at IS NULL),
  '1',
  'posting creates one journal'
);
SELECT lives_ok(
  format('SELECT public.post_invoice(%L::uuid)', current_setting('test.accounting.posted_invoice_id')),
  'duplicate posting is idempotent'
);
SELECT is(
  (SELECT count(*)::text FROM public.journal_entries WHERE source_ref_type = 'invoice' AND source_ref_id = current_setting('test.accounting.posted_invoice_id')::uuid AND deleted_at IS NULL),
  '1',
  'duplicate posting does not create another journal'
);

SELECT throws_ok(
  format('SELECT public.post_invoice(%L::uuid)', current_setting('test.accounting.closed_period_invoice_id')),
  'P0001', NULL,
  'closed accounting period rejects posting'
);
SELECT throws_ok(
  format('UPDATE public.invoices SET notes = COALESCE(notes, '''') || '' blocked'' WHERE id = %L::uuid', current_setting('test.accounting.posted_invoice_id')),
  '55000', NULL,
  'posted document edit is rejected'
);
SELECT throws_ok(
  format('SELECT public.post_invoice(%L::uuid)', current_setting('test.accounting.missing_config_invoice_id')),
  'P0001', NULL,
  'missing posting account configuration is rejected'
);
SELECT throws_ok(
  format('SELECT public.post_invoice(%L::uuid)', current_setting('test.accounting.unauthorized_invoice_id')),
  '42501', NULL,
  'unauthorized posting is rejected'
);
SELECT throws_ok(
  format('SELECT public._emit_journal(%L::uuid, CURRENT_DATE, ''bad'', ''test'', gen_random_uuid(), ''[{""account_id"": ""00000000-0000-0000-0000-000000000000"", ""debit"": 10, ""credit"": 0}]''::jsonb)', current_setting('test.accounting.tenant_id')),
  'P0001', NULL,
  'unbalanced journal is rejected'
);
SELECT lives_ok(
  format('SELECT public.void_manual_journal(%L::uuid, ''test reversal'')', current_setting('test.accounting.reversal_id')),
  'posted journal reversal succeeds'
);
SELECT ok(
  EXISTS (SELECT 1 FROM public.document_reversals WHERE entity_type = 'journal_entry' AND entity_id = current_setting('test.accounting.reversal_id')::uuid),
  'reversal is audited'
);
SELECT ok(
  EXISTS (SELECT 1 FROM public.journal_entries je JOIN public.journal_lines jl ON jl.journal_id = je.id WHERE je.source_ref_type = 'reversal' AND je.source_ref_id = current_setting('test.accounting.reversal_id')::uuid AND je.total_debit = je.total_credit),
  'reversal journal balances'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.post_invoice_unchecked(uuid)', 'EXECUTE'),
  'unchecked posting is inaccessible to normal users'
);

SELECT * FROM finish();
ROLLBACK;
