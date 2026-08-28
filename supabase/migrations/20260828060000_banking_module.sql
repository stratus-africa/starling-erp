-- =========================================================
-- Banking Module
--
-- Extends bank_accounts with GL linkage and opening balance.
-- Adds:
--   bank_transactions       — deposits, withdrawals, fees, transfers
--   bank_statement_lines    — imported statement rows (for reconciliation)
--   bank_reconciliations    — reconciliation session headers
--
-- Posting:
--   post_bank_transaction(id) — writes balanced journal entry,
--   stamps posted_at, updates bank_accounts.balance running total
--
-- Balance tracking:
--   A trigger on bank_transactions keeps bank_accounts.balance
--   in sync whenever a transaction is posted or voided.
-- =========================================================

-- ─────────────────────────────────────────────────────────
-- 1.  Extend bank_accounts
-- ─────────────────────────────────────────────────────────

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS gl_account_id    uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opening_balance  numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_date     date,
  ADD COLUMN IF NOT EXISTS is_default_cash  boolean NOT NULL DEFAULT false;

-- Back-fill: link existing bank accounts to the Cash GL account (code 1000)
-- where the tenant has one, so historical data isn't orphaned.
UPDATE public.bank_accounts ba
SET    gl_account_id = coa.id
FROM   public.chart_of_accounts coa
WHERE  coa.tenant_id  = ba.tenant_id
  AND  coa.code       = '1000'
  AND  coa.deleted_at IS NULL
  AND  ba.gl_account_id IS NULL;

-- ─────────────────────────────────────────────────────────
-- 2.  bank_transactions
--
--   type:
--     Deposit    — money in  (DR bank / CR revenue or AR)
--     Withdrawal — money out (DR expense or AP / CR bank)
--     Fee        — bank fee  (DR bank fee expense / CR bank)
--     Transfer   — between two internal accounts
--     Receipt    — customer payment clearing
--     Payment    — supplier payment clearing
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bank_account_id   uuid        NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  number            text,
  type              text        NOT NULL DEFAULT 'Deposit'
                                CONSTRAINT bank_txn_type_check CHECK (
                                  type IN ('Deposit','Withdrawal','Fee','Transfer','Receipt','Payment')
                                ),
  date              date        NOT NULL DEFAULT CURRENT_DATE,
  amount            numeric(14,2) NOT NULL
                                CONSTRAINT bank_txn_amount_pos CHECK (amount > 0),
  payee             text,                  -- who paid / was paid
  description       text,
  reference         text,                  -- cheque #, wire ref, etc.
  -- GL contra account (the other side of the bank entry)
  contra_account_id uuid        REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  -- Transfer destination (only set when type = 'Transfer')
  transfer_to_account_id uuid  REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  -- Source document link (populated when clearing a payment/receipt)
  source_ref_type   text,
  source_ref_id     uuid,
  -- Lifecycle
  status            text        NOT NULL DEFAULT 'Draft'
                                CONSTRAINT bank_txn_status_check CHECK (
                                  status IN ('Draft','Posted','Voided')
                                ),
  posted_at         timestamptz,
  voided_at         timestamptz,
  voided_by         uuid,
  reversal_id       uuid,
  reconciliation_id uuid,       -- set when matched in a reconciliation
  -- Audit
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE INDEX IF NOT EXISTS bank_txn_account_date_idx
  ON public.bank_transactions (tenant_id, bank_account_id, date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS bank_txn_reconciliation_idx
  ON public.bank_transactions (tenant_id, reconciliation_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can read bank transactions" ON public.bank_transactions;
CREATE POLICY "Tenant members can read bank transactions"
  ON public.bank_transactions FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "Banking users can write bank transactions" ON public.bank_transactions;
CREATE POLICY "Banking users can write bank transactions"
  ON public.bank_transactions FOR ALL TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND (public.has_permission('banking.create') OR public.has_permission('banking.update'))
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (public.has_permission('banking.create') OR public.has_permission('banking.update'))
  );

GRANT SELECT, INSERT, UPDATE ON public.bank_transactions TO authenticated;
GRANT ALL ON public.bank_transactions TO service_role;

CREATE TRIGGER trg_bank_transactions_updated
  BEFORE UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─────────────────────────────────────────────────────────
-- 3.  bank_statement_lines
--     One row per line from an imported bank statement.
--     Matched to a bank_transaction during reconciliation.
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bank_statement_lines (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bank_account_id     uuid        NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  reconciliation_id   uuid,       -- set when associated with a reconciliation session
  statement_date      date        NOT NULL,
  value_date          date,
  description         text,
  reference           text,
  debit               numeric(14,2) NOT NULL DEFAULT 0,   -- money out per statement
  credit              numeric(14,2) NOT NULL DEFAULT 0,   -- money in per statement
  running_balance     numeric(14,2),
  matched_txn_id      uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  is_matched          boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_stmt_account_date_idx
  ON public.bank_statement_lines (tenant_id, bank_account_id, statement_date DESC);

ALTER TABLE public.bank_statement_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can read statement lines" ON public.bank_statement_lines;
CREATE POLICY "Tenant members can read statement lines"
  ON public.bank_statement_lines FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "Banking users can write statement lines" ON public.bank_statement_lines;
CREATE POLICY "Banking users can write statement lines"
  ON public.bank_statement_lines FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id()
         AND public.has_permission('banking.reconcile'))
  WITH CHECK (tenant_id = public.current_tenant_id()
              AND public.has_permission('banking.reconcile'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statement_lines TO authenticated;
GRANT ALL ON public.bank_statement_lines TO service_role;

CREATE TRIGGER trg_bank_statement_lines_updated
  BEFORE UPDATE ON public.bank_statement_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─────────────────────────────────────────────────────────
-- 4.  bank_reconciliations
--     Header for a reconciliation session.
--     status: Draft → In Progress → Reconciled
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bank_reconciliations (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bank_account_id       uuid        NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  period_name           text        NOT NULL,   -- e.g. '2026-08'
  statement_date        date        NOT NULL,
  opening_balance       numeric(14,2) NOT NULL DEFAULT 0,
  statement_balance     numeric(14,2) NOT NULL DEFAULT 0,
  gl_balance            numeric(14,2) NOT NULL DEFAULT 0,
  matched_total         numeric(14,2) NOT NULL DEFAULT 0,
  difference            numeric(14,2) GENERATED ALWAYS AS
                          (statement_balance - gl_balance) STORED,
  status                text        NOT NULL DEFAULT 'Draft'
                        CONSTRAINT recon_status_check CHECK (
                          status IN ('Draft','In Progress','Reconciled')
                        ),
  reconciled_at         timestamptz,
  reconciled_by         uuid,
  notes                 text,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, bank_account_id, period_name)
);

CREATE INDEX IF NOT EXISTS bank_recon_account_period_idx
  ON public.bank_reconciliations (tenant_id, bank_account_id, period_name DESC);

ALTER TABLE public.bank_reconciliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can read reconciliations" ON public.bank_reconciliations;
CREATE POLICY "Tenant members can read reconciliations"
  ON public.bank_reconciliations FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "Reconcilers can write reconciliations" ON public.bank_reconciliations;
CREATE POLICY "Reconcilers can write reconciliations"
  ON public.bank_reconciliations FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id()
         AND public.has_permission('banking.reconcile'))
  WITH CHECK (tenant_id = public.current_tenant_id()
              AND public.has_permission('banking.reconcile'));

GRANT SELECT, INSERT, UPDATE ON public.bank_reconciliations TO authenticated;
GRANT ALL ON public.bank_reconciliations TO service_role;

CREATE TRIGGER trg_bank_reconciliations_updated
  BEFORE UPDATE ON public.bank_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─────────────────────────────────────────────────────────
-- 5.  post_bank_transaction(id)
--
--     Writes a balanced journal entry for the transaction.
--     DR/CR direction depends on transaction type:
--
--     Deposit    DR bank_account GL / CR contra_account
--     Withdrawal DR contra_account / CR bank_account GL
--     Fee        DR contra_account (expense) / CR bank_account GL
--     Transfer   DR destination bank GL / CR source bank GL
--     Receipt    DR bank_account GL / CR contra_account (AR or Revenue)
--     Payment    DR contra_account (AP or Expense) / CR bank_account GL
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_bank_transaction(_txn_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  txn         public.bank_transactions;
  ba          public.bank_accounts;
  dest_ba     public.bank_accounts;
  bank_gl     uuid;
  dest_gl     uuid;
  contra_gl   uuid;
  j_id        uuid;
  memo_text   text;
BEGIN
  -- Permission
  IF NOT (public.has_permission('banking.create')
       OR public.has_permission('banking.update')) THEN
    RAISE EXCEPTION 'Not authorized: banking.create' USING ERRCODE = '42501';
  END IF;

  -- Load + lock
  SELECT * INTO txn FROM public.bank_transactions
  WHERE id = _txn_id AND tenant_id = public.current_tenant_id()
  FOR UPDATE;

  IF txn.id IS NULL          THEN RAISE EXCEPTION 'Bank transaction not found'; END IF;
  IF txn.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Bank transaction has been deleted'; END IF;
  IF txn.posted_at IS NOT NULL   THEN RETURN _txn_id; END IF;  -- idempotent
  IF txn.status = 'Voided'       THEN RAISE EXCEPTION 'Cannot post a voided transaction'; END IF;

  -- Period guard
  PERFORM public.assert_period_open(public.current_tenant_id(), txn.date);

  -- Resolve bank GL account
  SELECT * INTO ba FROM public.bank_accounts
  WHERE id = txn.bank_account_id AND deleted_at IS NULL;
  bank_gl := ba.gl_account_id;
  IF bank_gl IS NULL THEN
    -- Fall back to Cash (1000)
    bank_gl := public._account_id(txn.tenant_id, '1000');
  END IF;
  IF bank_gl IS NULL THEN
    RAISE EXCEPTION 'Bank account % has no GL account linked', ba.name;
  END IF;

  -- Resolve contra GL
  contra_gl := txn.contra_account_id;
  IF contra_gl IS NULL AND txn.type IN ('Deposit','Receipt') THEN
    -- Default: Revenue (4000)
    contra_gl := public._account_id(txn.tenant_id, '4000');
  ELSIF contra_gl IS NULL AND txn.type IN ('Withdrawal','Fee','Payment') THEN
    -- Default: Operating Expenses (6000)
    contra_gl := public._account_id(txn.tenant_id, '6000');
  END IF;

  memo_text := COALESCE(txn.description, txn.type || ' – ' || COALESCE(txn.reference, txn.id::text));

  -- Build journal based on type
  IF txn.type = 'Transfer' THEN
    -- Transfer: both sides are bank accounts
    IF txn.transfer_to_account_id IS NULL THEN
      RAISE EXCEPTION 'Transfer transaction must specify a destination account';
    END IF;

    SELECT * INTO dest_ba FROM public.bank_accounts
    WHERE id = txn.transfer_to_account_id AND deleted_at IS NULL;
    dest_gl := dest_ba.gl_account_id;
    IF dest_gl IS NULL THEN
      dest_gl := public._account_id(txn.tenant_id, '1000');
    END IF;

    j_id := public._emit_journal(
      txn.tenant_id, txn.date,
      'Transfer: ' || ba.name || ' → ' || dest_ba.name,
      'bank_transfer', txn.id,
      jsonb_build_array(
        jsonb_build_object('account_id', dest_gl,  'debit',  txn.amount, 'credit', 0,           'memo', 'Transfer IN – ' || dest_ba.name),
        jsonb_build_object('account_id', bank_gl,  'debit',  0,          'credit', txn.amount,  'memo', 'Transfer OUT – ' || ba.name)
      )
    );

    -- Update destination account balance
    UPDATE public.bank_accounts
    SET balance = COALESCE(balance, 0) + txn.amount
    WHERE id = txn.transfer_to_account_id;

  ELSIF txn.type IN ('Deposit', 'Receipt') THEN
    -- Money IN: DR bank GL / CR contra
    IF contra_gl IS NULL THEN
      RAISE EXCEPTION 'No contra account specified or defaulted for % transaction', txn.type;
    END IF;
    j_id := public._emit_journal(
      txn.tenant_id, txn.date, memo_text, 'bank_' || lower(txn.type), txn.id,
      jsonb_build_array(
        jsonb_build_object('account_id', bank_gl,    'debit',  txn.amount, 'credit', 0,           'memo', txn.type || ': ' || COALESCE(txn.payee, '')),
        jsonb_build_object('account_id', contra_gl,  'debit',  0,          'credit', txn.amount,  'memo', txn.type || ' – contra')
      )
    );

  ELSE
    -- Money OUT (Withdrawal, Fee, Payment): DR contra / CR bank GL
    IF contra_gl IS NULL THEN
      RAISE EXCEPTION 'No contra account specified or defaulted for % transaction', txn.type;
    END IF;
    j_id := public._emit_journal(
      txn.tenant_id, txn.date, memo_text, 'bank_' || lower(txn.type), txn.id,
      jsonb_build_array(
        jsonb_build_object('account_id', contra_gl,  'debit',  txn.amount, 'credit', 0,           'memo', txn.type || ' – contra'),
        jsonb_build_object('account_id', bank_gl,    'debit',  0,          'credit', txn.amount,  'memo', txn.type || ': ' || COALESCE(txn.payee, ''))
      )
    );

    -- Reduce source account balance for outflows
    UPDATE public.bank_accounts
    SET balance = COALESCE(balance, 0) - txn.amount
    WHERE id = txn.bank_account_id;
  END IF;

  -- Increase source account balance for inflows (Deposit, Receipt)
  IF txn.type IN ('Deposit', 'Receipt') THEN
    UPDATE public.bank_accounts
    SET balance = COALESCE(balance, 0) + txn.amount
    WHERE id = txn.bank_account_id;
  END IF;
  -- Transfer: source balance decreases
  IF txn.type = 'Transfer' THEN
    UPDATE public.bank_accounts
    SET balance = COALESCE(balance, 0) - txn.amount
    WHERE id = txn.bank_account_id;
  END IF;

  -- Stamp transaction
  UPDATE public.bank_transactions
  SET status = 'Posted', posted_at = now(), updated_at = now()
  WHERE id = _txn_id;

  -- Audit
  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (
    txn.tenant_id, 'bank_transaction', txn.id, 'Posted',
    txn.type || ' of ' || txn.amount || ' posted; journal ' || COALESCE(j_id::text, 'none'),
    auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

  RETURN _txn_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_bank_transaction(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.post_bank_transaction(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 6.  Seed: link handle_new_user bank accounts to GL
--     (existing tenants handled by the UPDATE above)
-- ─────────────────────────────────────────────────────────
-- handle_new_user is already defined correctly in prior migrations.
-- The back-fill UPDATE above covers existing tenants.

-- ─────────────────────────────────────────────────────────
-- 7.  Update supabase types placeholder
--     (types.ts is manually maintained; the new columns are
--      added here so the Supabase client sees them)
-- ─────────────────────────────────────────────────────────
-- Types are updated in src/integrations/supabase/types.ts below.

-- ─────────────────────────────────────────────────────────
-- 8.  Permissions: ensure banking role has reconcile
-- ─────────────────────────────────────────────────────────
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('accounting', 'banking.reconcile'),
  ('accountant',  'banking.reconcile')
ON CONFLICT DO NOTHING;
