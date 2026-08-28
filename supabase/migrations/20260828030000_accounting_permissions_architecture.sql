-- =========================================================
-- Accounting Permissions Architecture
--
-- Replaces the four coarse accounting.* permissions with a
-- granular matrix covering journals, accounts, reports,
-- periods, reconciliation, and settings.
--
-- Adds three new app_role values:
--   accountant     — full accounting capability, can post and void
--   finance_clerk  — can create and view, cannot post or void
--   auditor        — read-only across all accounting and reports
--
-- Role capability matrix (● = granted):
--
--   Permission                   tenant_admin  accountant  finance_clerk  auditor  accounting(legacy)
--   ─────────────────────────────────────────────────────────────────────────────────────────────────
--   accounting.view              ●             ●           ●              ●        ●
--   accounting.create            ●             ●           ●              —        ●
--   accounting.update            ●             ●           ●              —        ●
--   accounting.delete            ●             ●           —              —        ●
--   accounting.journal.create    ●             ●           ●              —        ●
--   accounting.journal.update    ●             ●           ●              —        ●
--   accounting.journal.post      ●             ●           —              —        ●
--   accounting.journal.void      ●             ●           —              —        ●
--   accounting.accounts.create   ●             ●           —              —        ●
--   accounting.accounts.update   ●             ●           ●              —        ●
--   accounting.accounts.delete   ●             ●           —              —        —
--   accounting.reports.view      ●             ●           ●              ●        ●
--   accounting.periods.manage    ●             ●           —              —        —
--   accounting.reconciliation.view    ●        ●           ●              ●        ●
--   accounting.reconciliation.manage  ●        ●           —              —        ●
--   accounting.settings.manage   ●             ●           —              —        —
-- =========================================================

-- ─────────────────────────────────────────────────────────
-- 0.  Add new app_role enum values (idempotent guard)
-- ─────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'accountant'
  ) THEN ALTER TYPE public.app_role ADD VALUE 'accountant'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'finance_clerk'
  ) THEN ALTER TYPE public.app_role ADD VALUE 'finance_clerk'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'auditor'
  ) THEN ALTER TYPE public.app_role ADD VALUE 'auditor'; END IF;
END $$;

-- ─────────────────────────────────────────────────────────
-- 1.  Permissions table — insert all granular codes
--
--     The constraint on the permissions table enforces
--     code = module || '.' || action, so we must use the
--     dotted sub-path as the action value.
--
--     NOTE: The existing coarse codes (accounting.read,
--     accounting.create, accounting.update, accounting.post)
--     remain in the table so older role grants and any
--     external integrations don't break — we simply add the
--     granular codes alongside them.
-- ─────────────────────────────────────────────────────────

-- The permissions constraint is code = module || '.' || action.
-- For sub-namespaced codes like 'accounting.journal.create' we
-- need module='accounting.journal', action='create'.

INSERT INTO public.permissions (code, module, action, description) VALUES
  -- Core accounting
  ('accounting.view',               'accounting',               'view',               'View accounting module (GL, reports, chart of accounts)'),
  ('accounting.delete',             'accounting',               'delete',             'Delete accounting records'),

  -- Journal permissions
  ('accounting.journal.create',     'accounting.journal',       'create',             'Create manual journal entries'),
  ('accounting.journal.update',     'accounting.journal',       'update',             'Edit draft journal entries'),
  ('accounting.journal.post',       'accounting.journal',       'post',               'Post journal entries to the general ledger'),
  ('accounting.journal.void',       'accounting.journal',       'void',               'Void and reverse posted journal entries'),

  -- Chart of accounts permissions
  ('accounting.accounts.create',    'accounting.accounts',      'create',             'Create new accounts in the chart of accounts'),
  ('accounting.accounts.update',    'accounting.accounts',      'update',             'Edit existing accounts in the chart of accounts'),
  ('accounting.accounts.delete',    'accounting.accounts',      'delete',             'Delete (soft-delete) accounts from the chart of accounts'),

  -- Reports
  ('accounting.reports.view',       'accounting.reports',       'view',               'View financial reports: P&L, Balance Sheet, Trial Balance, GL'),

  -- Accounting periods
  ('accounting.periods.manage',     'accounting.periods',       'manage',             'Open, close, and lock accounting periods'),

  -- Reconciliation
  ('accounting.reconciliation.view',   'accounting.reconciliation', 'view',            'View bank reconciliation screens'),
  ('accounting.reconciliation.manage', 'accounting.reconciliation', 'manage',          'Perform and approve bank reconciliations'),

  -- Settings
  ('accounting.settings.manage',    'accounting.settings',      'manage',             'Manage accounting configuration and system account mappings')

ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

-- ─────────────────────────────────────────────────────────
-- 2.  Revoke the old bulk grant that gave the 'accounting'
--     role every permission whose module = 'accounting'.
--     We replace it with an explicit set below.
-- ─────────────────────────────────────────────────────────

DELETE FROM public.role_permissions
WHERE role = 'accounting'
  AND permission_code IN (
    'accounting.read', 'accounting.create', 'accounting.update',
    'accounting.post', 'accounting.reverse'
  );

-- ─────────────────────────────────────────────────────────
-- 3.  Grant matrix
-- ─────────────────────────────────────────────────────────

-- Helper: all granular accounting codes to grant to a role
-- We use an explicit VALUES list so the grants are auditable.

-- ── tenant_admin and super_admin ──────────────────────────
-- These roles bypass has_permission() via the ur.role IN (...) check,
-- so no explicit grants are needed. They always pass.

-- ── accountant ────────────────────────────────────────────
-- Full accounting capability. Can create, post, void, manage accounts,
-- manage periods, reconcile, and adjust settings.
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('accountant', 'accounting.read'),
  ('accountant', 'accounting.view'),
  ('accountant', 'accounting.create'),
  ('accountant', 'accounting.update'),
  ('accountant', 'accounting.delete'),
  ('accountant', 'accounting.post'),
  ('accountant', 'accounting.reverse'),
  ('accountant', 'accounting.journal.create'),
  ('accountant', 'accounting.journal.update'),
  ('accountant', 'accounting.journal.post'),
  ('accountant', 'accounting.journal.void'),
  ('accountant', 'accounting.accounts.create'),
  ('accountant', 'accounting.accounts.update'),
  ('accountant', 'accounting.accounts.delete'),
  ('accountant', 'accounting.reports.view'),
  ('accountant', 'accounting.periods.manage'),
  ('accountant', 'accounting.reconciliation.view'),
  ('accountant', 'accounting.reconciliation.manage'),
  ('accountant', 'accounting.settings.manage'),
  -- Accountants also need to read reports and handle banking
  ('accountant', 'banking.read'),
  ('accountant', 'banking.create'),
  ('accountant', 'banking.update'),
  ('accountant', 'banking.reconcile'),
  ('accountant', 'banking.void'),
  ('accountant', 'payments.read'),
  ('accountant', 'payments.post'),
  ('accountant', 'payments.void'),
  ('accountant', 'reports.read'),
  ('accountant', 'reports.export')
ON CONFLICT DO NOTHING;

-- ── accounting (legacy role — maps to same capability as accountant) ──
-- We preserve backward compat so existing users assigned 'accounting' role
-- continue to work. The legacy role gets everything the accountant gets.
INSERT INTO public.role_permissions (role, permission_code)
SELECT 'accounting', permission_code
FROM public.role_permissions
WHERE role = 'accountant'
ON CONFLICT DO NOTHING;

-- ── finance_clerk ─────────────────────────────────────────
-- Can create and update journals and accounts. Can view reports and
-- reconciliation. Cannot post, void, delete accounts, manage periods,
-- or change settings.
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('finance_clerk', 'accounting.read'),
  ('finance_clerk', 'accounting.view'),
  ('finance_clerk', 'accounting.create'),
  ('finance_clerk', 'accounting.update'),
  ('finance_clerk', 'accounting.journal.create'),
  ('finance_clerk', 'accounting.journal.update'),
  ('finance_clerk', 'accounting.accounts.update'),
  ('finance_clerk', 'accounting.reports.view'),
  ('finance_clerk', 'accounting.reconciliation.view'),
  ('finance_clerk', 'banking.read'),
  ('finance_clerk', 'payments.read'),
  ('finance_clerk', 'reports.read')
ON CONFLICT DO NOTHING;

-- ── auditor ───────────────────────────────────────────────
-- Read-only. Can view everything accounting-related including reports,
-- GL, trial balance, and reconciliation status. Cannot write anything.
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('auditor', 'accounting.read'),
  ('auditor', 'accounting.view'),
  ('auditor', 'accounting.reports.view'),
  ('auditor', 'accounting.reconciliation.view'),
  ('auditor', 'banking.read'),
  ('auditor', 'payments.read'),
  ('auditor', 'reports.read'),
  ('auditor', 'reports.export'),
  -- Auditors also get read access to other modules for cross-referencing
  ('auditor', 'sales.read'),
  ('auditor', 'purchasing.read'),
  ('auditor', 'inventory.read'),
  ('auditor', 'manufacturing.read')
ON CONFLICT DO NOTHING;

-- ── viewer ────────────────────────────────────────────────
-- The viewer role already has all *.read permissions from the
-- centralized_permissions migration. Add the new granular view codes.
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('viewer', 'accounting.view'),
  ('viewer', 'accounting.reports.view'),
  ('viewer', 'accounting.reconciliation.view')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────
-- 4.  Update post_manual_journal to check the new granular
--     permission while keeping the legacy code as fallback
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_manual_journal(_journal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  je           public.journal_entries;
  l            record;
  v_debit      numeric(14,2) := 0;
  v_credit     numeric(14,2) := 0;
  v_line_count integer       := 0;
  v_acct       record;
BEGIN
  -- Accept either the granular or the legacy permission code
  IF NOT (public.has_permission('accounting.journal.post')
          OR public.has_permission('accounting.post')) THEN
    RAISE EXCEPTION 'Not authorized: accounting.journal.post' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO je
  FROM public.journal_entries
  WHERE id = _journal_id AND tenant_id = public.current_tenant_id()
  FOR UPDATE;

  IF je.id IS NULL      THEN RAISE EXCEPTION 'Journal entry not found'; END IF;
  IF je.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Journal entry has been deleted'; END IF;
  IF lower(COALESCE(je.status,'')) = 'posted'                          THEN RETURN _journal_id; END IF;
  IF lower(COALESCE(je.status,'')) IN ('voided','void','reversed')     THEN RAISE EXCEPTION 'Cannot post a voided journal entry'; END IF;
  IF je.entry_date IS NULL THEN RAISE EXCEPTION 'Journal entry must have a valid date'; END IF;

  FOR l IN
    SELECT jl.id, jl.debit, jl.credit, jl.account_id
    FROM public.journal_lines jl
    WHERE jl.journal_id = _journal_id AND jl.tenant_id = public.current_tenant_id()
    ORDER BY jl.created_at, jl.id
    FOR UPDATE
  LOOP
    v_line_count := v_line_count + 1;

    IF l.account_id IS NULL THEN
      RAISE EXCEPTION 'Journal line % has no account assigned', v_line_count;
    END IF;

    SELECT id, name, is_active, allow_manual_posting
    INTO v_acct
    FROM public.chart_of_accounts
    WHERE id = l.account_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL;

    IF v_acct.id IS NULL THEN
      RAISE EXCEPTION 'Account on line % does not exist or belongs to another tenant', v_line_count;
    END IF;
    IF NOT v_acct.is_active THEN
      RAISE EXCEPTION 'Account "%" is inactive and cannot be posted to', v_acct.name;
    END IF;
    IF NOT v_acct.allow_manual_posting THEN
      RAISE EXCEPTION 'Account "%" does not allow manual posting (sub-ledger controlled)', v_acct.name;
    END IF;
    IF COALESCE(l.debit,  0) < 0 THEN RAISE EXCEPTION 'Line % has a negative debit amount',  v_line_count; END IF;
    IF COALESCE(l.credit, 0) < 0 THEN RAISE EXCEPTION 'Line % has a negative credit amount', v_line_count; END IF;
    IF COALESCE(l.debit,0) > 0 AND COALESCE(l.credit,0) > 0 THEN
      RAISE EXCEPTION 'Line % has both a debit and credit amount — only one is allowed per line', v_line_count;
    END IF;
    IF COALESCE(l.debit,0) = 0 AND COALESCE(l.credit,0) = 0 THEN
      RAISE EXCEPTION 'Line % has no debit or credit amount', v_line_count;
    END IF;

    v_debit  := v_debit  + COALESCE(l.debit,  0);
    v_credit := v_credit + COALESCE(l.credit, 0);
  END LOOP;

  IF v_line_count < 2 THEN
    RAISE EXCEPTION 'A journal entry must have at least 2 lines (has %)', v_line_count;
  END IF;
  IF ABS(v_debit - v_credit) > 0.005 THEN
    RAISE EXCEPTION 'Journal is unbalanced: total debits % ≠ total credits %', v_debit, v_credit;
  END IF;

  UPDATE public.journal_entries
  SET status = 'Posted', total_debit = v_debit, total_credit = v_credit,
      source_ref_type = COALESCE(NULLIF(source_ref_type,''), 'manual'),
      updated_at = now()
  WHERE id = _journal_id;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (public.current_tenant_id(), 'journal_entry', _journal_id, 'Posted',
          'Manual journal posted; debits ' || v_debit || ', credits ' || v_credit,
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));

  INSERT INTO public.posting_audit_events
    (tenant_id, entity_type, entity_id, action, permission_code, result, actor_id, metadata)
  VALUES (
    public.current_tenant_id(), 'journal_entry', _journal_id, 'post',
    'accounting.journal.post', 'posted', auth.uid(),
    jsonb_build_object('total_debit', v_debit, 'total_credit', v_credit, 'line_count', v_line_count)
  ) ON CONFLICT (tenant_id, entity_type, entity_id, action) DO NOTHING;

  RETURN _journal_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_manual_journal(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.post_manual_journal(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 5.  Update void_manual_journal to check the new code
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.void_manual_journal(
  _journal_id uuid,
  _reason     text DEFAULT 'Manual journal voided'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  je            public.journal_entries;
  v_reversal_id uuid;
  v_debit       numeric(14,2) := 0;
  v_credit      numeric(14,2) := 0;
BEGIN
  -- Accept either the granular or the legacy code
  IF NOT (public.has_permission('accounting.journal.void')
          OR public.has_permission('accounting.reverse')) THEN
    RAISE EXCEPTION 'Not authorized: accounting.journal.void' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO je
  FROM public.journal_entries
  WHERE id = _journal_id AND tenant_id = public.current_tenant_id()
  FOR UPDATE;

  IF je.id IS NULL THEN RAISE EXCEPTION 'Journal entry not found'; END IF;
  IF je.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Journal entry has been deleted'; END IF;

  IF lower(COALESCE(je.status,'')) IN ('voided','void','reversed') THEN
    SELECT reversal_journal_id INTO v_reversal_id
    FROM public.document_reversals
    WHERE tenant_id = public.current_tenant_id()
      AND entity_type = 'journal_entry' AND entity_id = _journal_id;
    RETURN COALESCE(v_reversal_id, _journal_id);
  END IF;

  IF lower(COALESCE(je.status,'')) <> 'posted' THEN
    RAISE EXCEPTION 'Only Posted journals can be voided (current status: %)', COALESCE(je.status,'NULL');
  END IF;

  INSERT INTO public.journal_entries (
    tenant_id, number, entry_date, memo,
    source_ref_type, source_ref_id, total_debit, total_credit, status, created_by
  ) VALUES (
    public.current_tenant_id(),
    'VOID-' || COALESCE(je.number, _journal_id::text),
    CURRENT_DATE,
    'Reversal: ' || COALESCE(je.memo, _journal_id::text),
    'reversal', _journal_id, je.total_credit, je.total_debit, 'Posted', auth.uid()
  ) RETURNING id INTO v_reversal_id;

  INSERT INTO public.journal_lines (tenant_id, journal_id, account_id, debit, credit, memo)
  SELECT public.current_tenant_id(), v_reversal_id, account_id,
         credit, debit, 'Reversal: ' || COALESCE(memo, _reason)
  FROM public.journal_lines
  WHERE journal_id = _journal_id AND tenant_id = public.current_tenant_id()
  ORDER BY created_at, id;

  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
  INTO v_debit, v_credit
  FROM public.journal_lines
  WHERE journal_id = v_reversal_id AND tenant_id = public.current_tenant_id();

  UPDATE public.journal_entries SET total_debit = v_debit, total_credit = v_credit WHERE id = v_reversal_id;
  UPDATE public.journal_entries SET status = 'Voided', updated_at = now()               WHERE id = _journal_id;

  INSERT INTO public.document_reversals
    (tenant_id, entity_type, entity_id, reversal_journal_id, reason, actor_id, metadata)
  VALUES (
    public.current_tenant_id(), 'journal_entry', _journal_id, v_reversal_id,
    _reason, auth.uid(), jsonb_build_object('permission', 'accounting.journal.void')
  );

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (public.current_tenant_id(), 'journal_entry', _journal_id, 'Voided',
          _reason || '. Reversal journal ' || v_reversal_id || ' created.',
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));

  INSERT INTO public.posting_audit_events
    (tenant_id, entity_type, entity_id, action, permission_code, result, actor_id, metadata)
  VALUES (
    public.current_tenant_id(), 'journal_entry', _journal_id, 'void',
    'accounting.journal.void', 'posted', auth.uid(),
    jsonb_build_object('reversal_journal_id', v_reversal_id, 'reason', _reason)
  ) ON CONFLICT (tenant_id, entity_type, entity_id, action) DO NOTHING;

  RETURN v_reversal_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.void_manual_journal(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.void_manual_journal(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 6.  Update RLS policies on chart_of_accounts and
--     journal_entries to check the granular permissions
--     alongside the legacy module-level ones
-- ─────────────────────────────────────────────────────────

-- Chart of accounts: replace the centralized write policies so they
-- check the accounts-specific codes (or legacy fallback)
DO $$
BEGIN
  -- INSERT
  DROP POLICY IF EXISTS centralized_chart_of_accounts_insert ON public.chart_of_accounts;
  CREATE POLICY centralized_chart_of_accounts_insert
    ON public.chart_of_accounts FOR INSERT TO authenticated
    WITH CHECK (
      tenant_id = public.current_tenant_id()
      AND (
        public.has_permission('accounting.accounts.create')
        OR public.has_permission('accounting.create')
      )
    );

  -- UPDATE
  DROP POLICY IF EXISTS centralized_chart_of_accounts_update ON public.chart_of_accounts;
  CREATE POLICY centralized_chart_of_accounts_update
    ON public.chart_of_accounts FOR UPDATE TO authenticated
    USING (
      tenant_id = public.current_tenant_id()
      AND (
        public.has_permission('accounting.accounts.update')
        OR public.has_permission('accounting.update')
      )
    )
    WITH CHECK (
      tenant_id = public.current_tenant_id()
      AND (
        public.has_permission('accounting.accounts.update')
        OR public.has_permission('accounting.update')
      )
    );

  -- DELETE
  DROP POLICY IF EXISTS centralized_chart_of_accounts_delete ON public.chart_of_accounts;
  CREATE POLICY centralized_chart_of_accounts_delete
    ON public.chart_of_accounts FOR DELETE TO authenticated
    USING (
      tenant_id = public.current_tenant_id()
      AND (
        public.has_permission('accounting.accounts.delete')
        OR public.has_permission('accounting.delete')
      )
    );
END $$;

-- Journal entries: INSERT requires journal.create, UPDATE requires journal.update
DO $$
BEGIN
  DROP POLICY IF EXISTS centralized_journal_entries_insert ON public.journal_entries;
  CREATE POLICY centralized_journal_entries_insert
    ON public.journal_entries FOR INSERT TO authenticated
    WITH CHECK (
      tenant_id = public.current_tenant_id()
      AND (
        public.has_permission('accounting.journal.create')
        OR public.has_permission('accounting.create')
      )
    );

  DROP POLICY IF EXISTS centralized_journal_entries_update ON public.journal_entries;
  CREATE POLICY centralized_journal_entries_update
    ON public.journal_entries FOR UPDATE TO authenticated
    USING (
      tenant_id = public.current_tenant_id()
      AND (
        public.has_permission('accounting.journal.update')
        OR public.has_permission('accounting.update')
      )
    )
    WITH CHECK (
      tenant_id = public.current_tenant_id()
      AND (
        public.has_permission('accounting.journal.update')
        OR public.has_permission('accounting.update')
      )
    );

  DROP POLICY IF EXISTS centralized_journal_entries_delete ON public.journal_entries;
  CREATE POLICY centralized_journal_entries_delete
    ON public.journal_entries FOR DELETE TO authenticated
    USING (
      tenant_id = public.current_tenant_id()
      AND (
        public.has_permission('accounting.delete')
        OR public.has_permission('accounting.journal.void')
      )
    );
END $$;
