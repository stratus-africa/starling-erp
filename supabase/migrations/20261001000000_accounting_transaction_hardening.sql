-- Accounting transaction hardening.
-- This migration changes enforcement only; it does not change journal formulas.
-- Financial rows are posted through existing authoritative RPC wrappers, while
-- triggers enforce metadata, immutability, and closed-period mutation rules.

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'invoices', 'credit_notes', 'bills', 'payments_received', 'payments_made',
    'expenses', 'inventory_adjustments', 'inventory_transfers',
    'production_orders', 'bank_transactions'
  ] LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS posted_by uuid REFERENCES auth.users(id)', v_table);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS reversed_by uuid REFERENCES auth.users(id)', v_table);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS reversed_at timestamptz', v_table);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS reversal_reference text', v_table);
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS posted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reversed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversal_reference text;

ALTER TABLE public.document_reversals
  ADD COLUMN IF NOT EXISTS reversed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversal_reference text;

CREATE OR REPLACE FUNCTION public.stamp_accounting_post_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE')
     AND NEW.status::text IN ('Posted', 'Completed')
     AND (TG_OP = 'INSERT' OR OLD.status::text IS DISTINCT FROM NEW.status::text OR NEW.posted_at IS NULL) THEN
    NEW.posted_at := COALESCE(NEW.posted_at, now());
    NEW.posted_by := COALESCE(NEW.posted_by, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.stamp_journal_post_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.status::text IN ('Posted', 'Completed') THEN
    NEW.posted_at := COALESCE(NEW.posted_at, now());
    NEW.posted_by := COALESCE(NEW.posted_by, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_accounting_period_mutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_tenant uuid;
  v_date date;
  v_status text;
BEGIN
  v_tenant := COALESCE((to_jsonb(OLD)->>'tenant_id')::uuid, (to_jsonb(NEW)->>'tenant_id')::uuid);
  v_date := COALESCE(
    NULLIF(to_jsonb(OLD)->>'date', '')::date,
    NULLIF(to_jsonb(OLD)->>'entry_date', '')::date,
    NULLIF(to_jsonb(NEW)->>'date', '')::date,
    NULLIF(to_jsonb(NEW)->>'entry_date', '')::date
  );

  IF v_tenant IS NULL OR v_date IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT ap.status INTO v_status
  FROM public.accounting_periods ap
  WHERE ap.tenant_id = v_tenant
    AND ap.period_start = date_trunc('month', v_date)::date;

  IF v_status IN ('Closed', 'Locked')
     AND current_setting('nimbus.allow_period_mutation', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Accounting period for % is %. Posting, editing, deleting, and reversing are blocked.',
      to_char(v_date, 'YYYY-MM'), v_status USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_reversal_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_table text;
BEGIN
  v_table := CASE NEW.entity_type
    WHEN 'invoice' THEN 'invoices'
    WHEN 'credit_note' THEN 'credit_notes'
    WHEN 'bill' THEN 'bills'
    WHEN 'payment_received' THEN 'payments_received'
    WHEN 'payment_made' THEN 'payments_made'
    WHEN 'expense' THEN 'expenses'
    WHEN 'inventory_adjustment' THEN 'inventory_adjustments'
    WHEN 'inventory_transfer' THEN 'inventory_transfers'
    WHEN 'production_order' THEN 'production_orders'
    WHEN 'bank_transaction' THEN 'bank_transactions'
    ELSE NULL
  END;

  IF v_table IS NOT NULL THEN
    PERFORM set_config('nimbus.allow_posted_mutation', 'on', true);
    EXECUTE format(
      'UPDATE public.%I SET reversed_by = $1, reversed_at = COALESCE($2, now()), reversal_reference = $3, reversal_id = $4, voided_at = COALESCE(voided_at, $2), voided_by = COALESCE(voided_by, $1) WHERE id = $5 AND tenant_id = $6',
      v_table
    ) USING COALESCE(NEW.reversed_by, NEW.actor_id), NEW.reversed_at, NEW.reversal_reference, NEW.reversal_journal_id, NEW.entity_id, NEW.tenant_id;
    PERFORM set_config('nimbus.allow_posted_mutation', 'off', true);
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'invoices', 'credit_notes', 'bills', 'payments_received', 'payments_made',
    'expenses', 'inventory_adjustments', 'inventory_transfers',
    'production_orders', 'bank_transactions'
  ] LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_accounting_post_metadata ON public.%I', v_table, v_table);
      EXECUTE format('CREATE TRIGGER trg_%s_accounting_post_metadata BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.stamp_accounting_post_metadata()', v_table, v_table);
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_accounting_period_mutable ON public.%I', v_table, v_table);
      EXECUTE format('CREATE TRIGGER trg_%s_accounting_period_mutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.assert_accounting_period_mutable()', v_table, v_table);
    END IF;
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_journal_entries_accounting_post_metadata ON public.journal_entries;
CREATE TRIGGER trg_journal_entries_accounting_post_metadata
BEFORE INSERT OR UPDATE ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.stamp_journal_post_metadata();

DROP TRIGGER IF EXISTS trg_journal_entries_accounting_period_mutable ON public.journal_entries;
CREATE TRIGGER trg_journal_entries_accounting_period_mutable
BEFORE UPDATE OR DELETE ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.assert_accounting_period_mutable();

DROP TRIGGER IF EXISTS trg_document_reversals_sync_metadata ON public.document_reversals;
CREATE TRIGGER trg_document_reversals_sync_metadata
AFTER INSERT ON public.document_reversals
FOR EACH ROW EXECUTE FUNCTION public.sync_reversal_metadata();

-- Keep all internal posting primitives inaccessible to browser roles.
DO $$
DECLARE
  v_function text;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'post_invoice_unchecked(uuid)', 'post_bill_unchecked(uuid)',
    'post_credit_note_unchecked(uuid)', 'post_payment_received_unchecked(uuid)',
    'post_payment_made_unchecked(uuid)', 'post_expense_unchecked(uuid)',
    'post_adjustment_unchecked(uuid)', 'post_transfer_unchecked(uuid)',
    'post_production_order_unchecked(uuid)',
    'create_reversal_journal(uuid,text,text)', 'create_reversal_movements(uuid,text,uuid)',
    '_emit_journal(uuid,date,text,text,uuid,jsonb)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', v_function);
  END LOOP;
END $$;

COMMENT ON FUNCTION public.stamp_accounting_post_metadata()
IS 'Database boundary for posted_by and posted_at. Financial documents become posted only through their existing authoritative posting RPCs.';
COMMENT ON FUNCTION public.assert_accounting_period_mutable()
IS 'Rejects edits and deletes of accounting transactions in Closed or Locked periods unless an explicit controlled period-mutation capability is set.';
COMMENT ON FUNCTION public.sync_reversal_metadata()
IS 'Copies reversal actor, time, reference, and reversal journal linkage onto the original financial transaction without mutating its accounting values.';
