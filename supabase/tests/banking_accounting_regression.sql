-- Regression contract for the Banking/Accounting boundary.
-- Run with the Supabase database test harness after applying migrations.

BEGIN;

DO $$
DECLARE
  relationship_count integer;
  account_id_column_count integer;
  unsafe_status_check_count integer;
BEGIN
  SELECT count(*) INTO relationship_count
  FROM information_schema.constraint_column_usage ccu
  JOIN information_schema.table_constraints tc ON tc.constraint_name = ccu.constraint_name
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'bank_accounts'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = 'chart_of_accounts'
    AND ccu.column_name = 'id';
  IF relationship_count < 1 THEN
    RAISE EXCEPTION 'Bank account must link to chart_of_accounts through gl_account_id';
  END IF;

  SELECT count(*) INTO account_id_column_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'bank_accounts' AND column_name = 'account_id';
  IF account_id_column_count <> 0 THEN
    RAISE EXCEPTION 'bank_accounts.account_id must not be used';
  END IF;

  SELECT count(*) INTO unsafe_status_check_count
  FROM pg_proc p
  WHERE p.proname = 'post_manual_journal'
    AND pg_get_functiondef(p.oid) LIKE '%lower(COALESCE(je.status%';
  IF unsafe_status_check_count <> 0 THEN
    RAISE EXCEPTION 'manual journal posting must not lower/coalesce enum status';
  END IF;
END;
$$;

-- Application integration scenarios covered by the authenticated test suite:
-- 1. create a Bank account with gl_account_id
-- 2. edit its name and gl_account_id
-- 3. deactivate it without deleting history
-- 4. post a bank transaction in an Open period
-- 5. reject the same post in a Closed period
-- 6. allow a tenant_admin/super_admin to reopen a period and audit it
-- 7. reject a non-owner reopening a period

ROLLBACK;