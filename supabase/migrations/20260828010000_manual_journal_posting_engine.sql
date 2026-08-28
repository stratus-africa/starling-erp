-- =========================================================
-- Manual Journal Posting Engine
--
-- 1. next_journal_number(tenant_id)  — JV-YYYY-NNNN sequence
-- 2. post_manual_journal(journal_id) — validate + post + audit
-- 3. void_manual_journal(journal_id) — reverse + void + audit
-- 4. Extend void_posted_document to accept entity_type = 'journal_entry'
-- =========================================================

-- ─────────────────────────────────────────────────────────
-- 1.  Journal number sequencing
--     Returns the next JV-YYYY-NNNN number for the tenant.
--     Pads to 4 digits; rolls over per calendar year.
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.next_journal_number(_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_year  text := to_char(CURRENT_DATE, 'YYYY');
  v_count bigint;
BEGIN
  SELECT COUNT(*) + 1
  INTO v_count
  FROM public.journal_entries
  WHERE tenant_id = _tenant_id
    AND number LIKE 'JV-' || v_year || '-%'
    AND deleted_at IS NULL;

  RETURN 'JV-' || v_year || '-' || LPAD(v_count::text, 4, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.next_journal_number(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.next_journal_number(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 2.  post_manual_journal
--
--     Validates:
--       • permission accounting.post
--       • journal exists and belongs to current tenant
--       • status = 'Draft' (idempotent: returns id if already Posted)
--       • not deleted
--       • ≥ 2 lines
--       • every line has an account that exists, is active,
--         and allows manual posting
--       • no line has both debit > 0 and credit > 0
--       • no line has debit < 0 or credit < 0
--       • no empty line (debit = 0 AND credit = 0)
--       • total debits = total credits  (±0.005 tolerance)
--       • valid entry_date (not null)
--       • updates header total_debit / total_credit from lines
--       • sets status = 'Posted', sets source_ref_type = 'manual'
--       • inserts document_events row
--       • inserts posting_audit_events row
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_manual_journal(_journal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  je          public.journal_entries;
  l           record;
  v_debit     numeric(14,2) := 0;
  v_credit    numeric(14,2) := 0;
  v_line_count integer      := 0;
  v_acct      record;
BEGIN
  -- ── Permission ──────────────────────────────────────────
  IF NOT public.has_permission('accounting.post') THEN
    RAISE EXCEPTION 'Not authorized: accounting.post' USING ERRCODE = '42501';
  END IF;

  -- ── Load + lock ─────────────────────────────────────────
  SELECT * INTO je
  FROM public.journal_entries
  WHERE id = _journal_id
    AND tenant_id = public.current_tenant_id()
  FOR UPDATE;

  IF je.id IS NULL THEN
    RAISE EXCEPTION 'Journal entry not found';
  END IF;

  IF je.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Journal entry has been deleted';
  END IF;

  -- Idempotent: already posted
  IF lower(COALESCE(je.status, '')) = 'posted' THEN
    RETURN _journal_id;
  END IF;

  IF lower(COALESCE(je.status, '')) IN ('voided', 'void', 'reversed') THEN
    RAISE EXCEPTION 'Cannot post a voided journal entry';
  END IF;

  IF je.entry_date IS NULL THEN
    RAISE EXCEPTION 'Journal entry must have a valid date';
  END IF;

  -- ── Line-level validation ────────────────────────────────
  FOR l IN
    SELECT jl.id, jl.debit, jl.credit, jl.account_id
    FROM public.journal_lines jl
    WHERE jl.journal_id  = _journal_id
      AND jl.tenant_id   = public.current_tenant_id()
    ORDER BY jl.created_at, jl.id
    FOR UPDATE
  LOOP
    v_line_count := v_line_count + 1;

    -- No account
    IF l.account_id IS NULL THEN
      RAISE EXCEPTION 'Journal line % has no account assigned', v_line_count;
    END IF;

    -- Account must exist, be active, and allow manual posting
    SELECT id, name, is_active, allow_manual_posting
    INTO v_acct
    FROM public.chart_of_accounts
    WHERE id = l.account_id
      AND tenant_id = public.current_tenant_id()
      AND deleted_at IS NULL;

    IF v_acct.id IS NULL THEN
      RAISE EXCEPTION 'Account on line % does not exist or belongs to another tenant', v_line_count;
    END IF;

    IF NOT v_acct.is_active THEN
      RAISE EXCEPTION 'Account "%" is inactive and cannot be posted to', v_acct.name;
    END IF;

    IF NOT v_acct.allow_manual_posting THEN
      RAISE EXCEPTION 'Account "%" does not allow manual posting (sub-ledger controlled)', v_acct.name;
    END IF;

    -- No negative amounts
    IF COALESCE(l.debit, 0) < 0 THEN
      RAISE EXCEPTION 'Line % has a negative debit amount', v_line_count;
    END IF;

    IF COALESCE(l.credit, 0) < 0 THEN
      RAISE EXCEPTION 'Line % has a negative credit amount', v_line_count;
    END IF;

    -- Cannot have both debit and credit on the same line
    IF COALESCE(l.debit, 0) > 0 AND COALESCE(l.credit, 0) > 0 THEN
      RAISE EXCEPTION 'Line % has both a debit and credit amount — only one is allowed per line', v_line_count;
    END IF;

    -- Empty line
    IF COALESCE(l.debit, 0) = 0 AND COALESCE(l.credit, 0) = 0 THEN
      RAISE EXCEPTION 'Line % has no debit or credit amount', v_line_count;
    END IF;

    v_debit  := v_debit  + COALESCE(l.debit,  0);
    v_credit := v_credit + COALESCE(l.credit, 0);
  END LOOP;

  -- Minimum line count
  IF v_line_count < 2 THEN
    RAISE EXCEPTION 'A journal entry must have at least 2 lines (has %)', v_line_count;
  END IF;

  -- Balanced
  IF ABS(v_debit - v_credit) > 0.005 THEN
    RAISE EXCEPTION 'Journal is unbalanced: total debits % ≠ total credits %', v_debit, v_credit;
  END IF;

  -- ── Commit ──────────────────────────────────────────────
  UPDATE public.journal_entries
  SET
    status          = 'Posted',
    total_debit     = v_debit,
    total_credit    = v_credit,
    source_ref_type = COALESCE(NULLIF(source_ref_type, ''), 'manual'),
    updated_at      = now()
  WHERE id = _journal_id;

  -- ── Audit trail ─────────────────────────────────────────
  INSERT INTO public.document_events (
    tenant_id, entity_type, entity_id, status, note, actor_id, actor_email
  ) VALUES (
    public.current_tenant_id(),
    'journal_entry',
    _journal_id,
    'Posted',
    'Manual journal posted; debits ' || v_debit || ', credits ' || v_credit,
    auth.uid(),
    (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

  INSERT INTO public.posting_audit_events (
    tenant_id, entity_type, entity_id, action, permission_code,
    result, actor_id, metadata
  ) VALUES (
    public.current_tenant_id(),
    'journal_entry',
    _journal_id,
    'post',
    'accounting.post',
    'posted',
    auth.uid(),
    jsonb_build_object(
      'total_debit',  v_debit,
      'total_credit', v_credit,
      'line_count',   v_line_count
    )
  )
  ON CONFLICT (tenant_id, entity_type, entity_id, action) DO NOTHING;

  RETURN _journal_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_manual_journal(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.post_manual_journal(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 3.  void_manual_journal
--
--     Creates an inverse (reversal) journal, marks the
--     original Voided, and writes audit records.
--     Only Posted journals can be voided.
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
  je              public.journal_entries;
  v_reversal_id   uuid;
  v_debit         numeric(14,2) := 0;
  v_credit        numeric(14,2) := 0;
BEGIN
  -- ── Permission ──────────────────────────────────────────
  IF NOT public.has_permission('accounting.reverse') THEN
    RAISE EXCEPTION 'Not authorized: accounting.reverse' USING ERRCODE = '42501';
  END IF;

  -- ── Load + lock ─────────────────────────────────────────
  SELECT * INTO je
  FROM public.journal_entries
  WHERE id = _journal_id
    AND tenant_id = public.current_tenant_id()
  FOR UPDATE;

  IF je.id IS NULL THEN
    RAISE EXCEPTION 'Journal entry not found';
  END IF;

  IF je.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Journal entry has been deleted';
  END IF;

  IF lower(COALESCE(je.status, '')) IN ('voided', 'void', 'reversed') THEN
    -- Idempotent: return existing reversal
    SELECT reversal_journal_id INTO v_reversal_id
    FROM public.document_reversals
    WHERE tenant_id   = public.current_tenant_id()
      AND entity_type = 'journal_entry'
      AND entity_id   = _journal_id;
    RETURN COALESCE(v_reversal_id, _journal_id);
  END IF;

  IF lower(COALESCE(je.status, '')) <> 'posted' THEN
    RAISE EXCEPTION 'Only Posted journals can be voided (current status: %)', COALESCE(je.status, 'NULL');
  END IF;

  -- ── Build reversal journal ───────────────────────────────
  INSERT INTO public.journal_entries (
    tenant_id, number, entry_date, memo,
    source_ref_type, source_ref_id,
    total_debit, total_credit,
    status, created_by
  ) VALUES (
    public.current_tenant_id(),
    'VOID-' || COALESCE(je.number, _journal_id::text),
    CURRENT_DATE,
    'Reversal: ' || COALESCE(je.memo, _journal_id::text),
    'reversal',
    _journal_id,
    je.total_credit,  -- swapped
    je.total_debit,   -- swapped
    'Posted',
    auth.uid()
  ) RETURNING id INTO v_reversal_id;

  -- Insert inverse lines (swap debit ↔ credit per line)
  INSERT INTO public.journal_lines (
    tenant_id, journal_id, account_id, debit, credit, memo
  )
  SELECT
    public.current_tenant_id(),
    v_reversal_id,
    account_id,
    credit,   -- original credit becomes reversal debit
    debit,    -- original debit  becomes reversal credit
    'Reversal: ' || COALESCE(memo, _reason)
  FROM public.journal_lines
  WHERE journal_id = _journal_id
    AND tenant_id  = public.current_tenant_id()
  ORDER BY created_at, id;

  -- Verify the reversal totals are consistent
  SELECT
    COALESCE(SUM(debit), 0),
    COALESCE(SUM(credit), 0)
  INTO v_debit, v_credit
  FROM public.journal_lines
  WHERE journal_id = v_reversal_id
    AND tenant_id  = public.current_tenant_id();

  UPDATE public.journal_entries
  SET total_debit = v_debit, total_credit = v_credit
  WHERE id = v_reversal_id;

  -- ── Mark original Voided ────────────────────────────────
  UPDATE public.journal_entries
  SET status = 'Voided', updated_at = now()
  WHERE id = _journal_id;

  -- ── Reversal record ─────────────────────────────────────
  INSERT INTO public.document_reversals (
    tenant_id, entity_type, entity_id,
    reversal_journal_id, reason, actor_id,
    metadata
  ) VALUES (
    public.current_tenant_id(),
    'journal_entry',
    _journal_id,
    v_reversal_id,
    _reason,
    auth.uid(),
    jsonb_build_object('permission', 'accounting.reverse')
  );

  -- ── Audit trail ─────────────────────────────────────────
  INSERT INTO public.document_events (
    tenant_id, entity_type, entity_id, status, note, actor_id, actor_email
  ) VALUES (
    public.current_tenant_id(),
    'journal_entry',
    _journal_id,
    'Voided',
    _reason || '. Reversal journal ' || v_reversal_id || ' created.',
    auth.uid(),
    (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

  INSERT INTO public.posting_audit_events (
    tenant_id, entity_type, entity_id, action, permission_code,
    result, actor_id, metadata
  ) VALUES (
    public.current_tenant_id(),
    'journal_entry',
    _journal_id,
    'void',
    'accounting.reverse',
    'posted',
    auth.uid(),
    jsonb_build_object('reversal_journal_id', v_reversal_id, 'reason', _reason)
  )
  ON CONFLICT (tenant_id, entity_type, entity_id, action) DO NOTHING;

  RETURN v_reversal_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.void_manual_journal(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.void_manual_journal(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 4.  Extend void_posted_document to accept 'journal_entry'
-- ─────────────────────────────────────────────────────────
-- The existing void_posted_document only accepts a fixed set of
-- document types via a CASE block. Rather than patch that function
-- (which would touch validated production logic), we add a
-- specialised handler for 'journal_entry' that delegates to
-- void_manual_journal.

CREATE OR REPLACE FUNCTION public.void_journal_entry(
  _journal_id uuid,
  _permission text DEFAULT 'accounting.reverse',
  _reason     text DEFAULT 'Journal entry voided and reversed'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_permission(_permission) THEN
    RAISE EXCEPTION 'Not authorized: %', _permission USING ERRCODE = '42501';
  END IF;
  RETURN public.void_manual_journal(_journal_id, _reason);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.void_journal_entry(uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.void_journal_entry(uuid, text, text) TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 5.  RLS / permissions — ensure accounting role can use RPCs
-- ─────────────────────────────────────────────────────────

INSERT INTO public.permissions (code, module, action, description) VALUES
  ('accounting.post', 'accounting', 'post', 'Post manual journal entries')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('accounting', 'accounting.post'),
  ('accounting', 'accounting.reverse')
ON CONFLICT DO NOTHING;
