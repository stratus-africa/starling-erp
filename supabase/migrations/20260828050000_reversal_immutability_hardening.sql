-- =========================================================
-- Reversal & Immutability Hardening
--
-- Closes the remaining gaps in the void/reversal accounting:
--
-- 1. journal_entries immutability trigger — posted and voided
--    journal headers cannot be edited or deleted except by the
--    controlled void pathway (nimbus.allow_posted_mutation = 'on')
--
-- 2. journal_lines immutability trigger — lines of a posted
--    journal cannot be added, modified, or removed
--
-- 3. create_reversal_journal hardening — adds period check
--    (reversal must land in an open period = today's period)
--    and verifies the reversal is perfectly balanced
--
-- 4. void_posted_document — update reversal journal number to
--    use the canonical VOID-<original_ref> pattern consistently
--
-- 5. Reversal number format: VOID-<original_number> so it is
--    immediately identifiable in reports and the GL
-- =========================================================

-- ─────────────────────────────────────────────────────────
-- 1.  journal_entries immutability trigger
--
--     Blocks UPDATE and DELETE on posted / voided entries.
--     The void pathway sets nimbus.allow_posted_mutation = 'on'
--     for the duration of the transaction to bypass this.
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assert_journal_entry_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_status    text;
  v_old_posted_at timestamptz;
BEGIN
  v_old_status    := lower(COALESCE(OLD.status, ''));
  v_old_posted_at := OLD.posted_at;  -- NULL: this column added by earlier migrations

  -- Allow the void pathway to mutate (it sets status = 'Voided' on the original)
  IF current_setting('nimbus.allow_posted_mutation', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- Block hard-delete of any posted or voided journal
  IF TG_OP = 'DELETE' THEN
    IF v_old_status IN ('posted', 'voided', 'void', 'reversed') THEN
      RAISE EXCEPTION
        'Posted/voided journal entry % is immutable. Create a reversal instead.',
        OLD.id
        USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  -- Block UPDATE of a posted journal — the ONLY allowed mutation is
  -- status → 'Voided' which is written by the void pathway.
  IF TG_OP = 'UPDATE' THEN
    -- If it's already voided/reversed, lock completely
    IF v_old_status IN ('voided', 'void', 'reversed') THEN
      RAISE EXCEPTION
        'Voided journal entry % is locked.',
        OLD.id
        USING ERRCODE = '55000';
    END IF;

    -- If it's posted, the only permitted change is status → 'Voided' (by void RPC)
    IF v_old_status = 'posted' THEN
      IF NEW.status NOT IN ('Voided', 'voided', 'void', 'reversed') THEN
        RAISE EXCEPTION
          'Posted journal entry % is immutable. Void it to create a reversal.',
          OLD.id
          USING ERRCODE = '55000';
      END IF;
      -- Allow only the status + updated_at fields to change
      IF NEW.entry_date    IS DISTINCT FROM OLD.entry_date    OR
         NEW.memo          IS DISTINCT FROM OLD.memo          OR
         NEW.total_debit   IS DISTINCT FROM OLD.total_debit   OR
         NEW.total_credit  IS DISTINCT FROM OLD.total_credit  OR
         NEW.number        IS DISTINCT FROM OLD.number
      THEN
        RAISE EXCEPTION
          'Posted journal entry % header fields are immutable.',
          OLD.id
          USING ERRCODE = '55000';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_entries_immutable ON public.journal_entries;
CREATE TRIGGER trg_journal_entries_immutable
  BEFORE UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.assert_journal_entry_immutable();

-- ─────────────────────────────────────────────────────────
-- 2.  journal_lines immutability trigger
--
--     Once a journal is Posted or Voided, its lines are sealed.
--     New lines cannot be inserted; existing lines cannot be
--     updated or deleted.
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assert_journal_line_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry_status text;
BEGIN
  -- Void pathway bypasses this check
  IF current_setting('nimbus.allow_posted_mutation', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- Determine parent journal status
  SELECT lower(COALESCE(status, ''))
  INTO   v_entry_status
  FROM   public.journal_entries
  WHERE  id = CASE WHEN TG_OP = 'DELETE' THEN OLD.journal_id ELSE NEW.journal_id END;

  IF v_entry_status IN ('posted', 'voided', 'void', 'reversed') THEN
    RAISE EXCEPTION
      'Journal lines of a % entry are immutable. Void and reverse the journal instead.',
      v_entry_status
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_lines_immutable ON public.journal_lines;
CREATE TRIGGER trg_journal_lines_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.assert_journal_line_immutable();

-- ─────────────────────────────────────────────────────────
-- 3.  Harden create_reversal_journal
--
--     a) The reversal always uses CURRENT_DATE as entry_date
--        so it lands in the currently open period.
--     b) Period is asserted open before inserting.
--     c) Reversal header number is set to VOID-<original_number>
--        so it is immediately identifiable.
--     d) Final balance assertion ensures the reversal is perfect.
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_reversal_journal(
  _entity_id   uuid,
  _entity_type text,
  _reason      text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  j             record;
  l             record;
  v_reversal_id uuid;
  v_count       integer      := 0;
  v_debit       numeric(14,2) := 0;
  v_credit      numeric(14,2) := 0;
  v_orig_number text;
  v_orig_memo   text;
BEGIN
  -- Period guard — reversal must land in the current (open) period
  PERFORM public.assert_period_open(public.current_tenant_id(), CURRENT_DATE);

  -- Derive a canonical reversal number from the source document's journal number
  SELECT je.number, je.memo
  INTO   v_orig_number, v_orig_memo
  FROM   public.journal_entries je
  WHERE  je.tenant_id      = public.current_tenant_id()
    AND  je.source_ref_id  = _entity_id
    AND  je.source_ref_type = _entity_type
    AND  je.deleted_at IS NULL
  ORDER  BY je.created_at
  LIMIT  1;

  -- Allow the void pathway to insert the reversal header (bypasses journal trigger)
  PERFORM set_config('nimbus.allow_posted_mutation', 'on', true);

  INSERT INTO public.journal_entries (
    tenant_id, number, entry_date, memo,
    source_ref_type, source_ref_id,
    total_debit, total_credit, status, created_by
  ) VALUES (
    public.current_tenant_id(),
    CASE WHEN v_orig_number IS NOT NULL THEN 'VOID-' || v_orig_number
         ELSE 'VOID-' || _entity_type || '-' || _entity_id::text
    END,
    CURRENT_DATE,
    'Reversal: ' || COALESCE(v_orig_memo, _reason),
    'reversal',
    _entity_id,
    0, 0,
    'Posted',
    auth.uid()
  ) RETURNING id INTO v_reversal_id;

  -- Mirror-invert every line from every journal belonging to the source document
  FOR j IN
    SELECT id, number
    FROM   public.journal_entries
    WHERE  tenant_id      = public.current_tenant_id()
      AND  source_ref_id  = _entity_id
      AND  source_ref_type = _entity_type
      AND  deleted_at IS NULL
      AND  status = 'Posted'   -- only reverse posted journals, not previously voided ones
    ORDER  BY created_at, id
    FOR UPDATE
  LOOP
    v_count := v_count + 1;
    FOR l IN
      SELECT account_id, debit, credit, memo
      FROM   public.journal_lines
      WHERE  tenant_id  = public.current_tenant_id()
        AND  journal_id = j.id
      ORDER  BY created_at, id
    LOOP
      -- Swap: original debit becomes reversal credit, original credit becomes reversal debit
      v_debit  := v_debit  + COALESCE(l.credit, 0);
      v_credit := v_credit + COALESCE(l.debit,  0);

      INSERT INTO public.journal_lines (
        tenant_id, journal_id, account_id, debit, credit, memo
      ) VALUES (
        public.current_tenant_id(),
        v_reversal_id,
        l.account_id,
        COALESCE(l.credit, 0),                             -- original credit → reversal debit
        COALESCE(l.debit,  0),                             -- original debit  → reversal credit
        'Reversal: ' || COALESCE(l.memo, _reason)
      );
    END LOOP;
  END LOOP;

  PERFORM set_config('nimbus.allow_posted_mutation', 'off', true);

  IF v_count = 0 THEN
    RAISE EXCEPTION
      'Cannot void % %. No posted journal entry exists to reverse.',
      _entity_type, _entity_id;
  END IF;

  -- Sanity check — must be perfectly balanced
  IF ABS(v_debit - v_credit) > 0.005 THEN
    RAISE EXCEPTION
      'Generated reversal is unbalanced: debit %, credit %', v_debit, v_credit;
  END IF;

  -- Set header totals on the reversal journal
  PERFORM set_config('nimbus.allow_posted_mutation', 'on', true);
  UPDATE public.journal_entries
  SET    total_debit  = v_debit,
         total_credit = v_credit
  WHERE  id = v_reversal_id;
  PERFORM set_config('nimbus.allow_posted_mutation', 'off', true);

  RETURN v_reversal_id;
END;
$$;

-- create_reversal_journal is internal — no public grant
REVOKE ALL ON FUNCTION public.create_reversal_journal(uuid, text, text) FROM PUBLIC;

-- ─────────────────────────────────────────────────────────
-- 4.  Harden void_manual_journal with the same period guard
--     and canonical VOID- number format (already mostly done
--     in earlier migrations, just ensure consistency)
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
  -- Permission
  IF NOT (public.has_permission('accounting.journal.void')
          OR public.has_permission('accounting.reverse')) THEN
    RAISE EXCEPTION 'Not authorized: accounting.journal.void' USING ERRCODE = '42501';
  END IF;

  -- Load + row-lock
  SELECT * INTO je
  FROM   public.journal_entries
  WHERE  id        = _journal_id
    AND  tenant_id = public.current_tenant_id()
  FOR UPDATE;

  IF je.id IS NULL         THEN RAISE EXCEPTION 'Journal entry not found'; END IF;
  IF je.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Journal entry has been deleted'; END IF;

  -- Idempotent: already voided
  IF lower(COALESCE(je.status,'')) IN ('voided','void','reversed') THEN
    SELECT reversal_journal_id INTO v_reversal_id
    FROM   public.document_reversals
    WHERE  tenant_id   = public.current_tenant_id()
      AND  entity_type = 'journal_entry'
      AND  entity_id   = _journal_id;
    RETURN COALESCE(v_reversal_id, _journal_id);
  END IF;

  IF lower(COALESCE(je.status,'')) <> 'posted' THEN
    RAISE EXCEPTION
      'Only Posted journals can be voided (current status: %)',
      COALESCE(je.status, 'NULL');
  END IF;

  -- Period guard — reversal must land in an open period
  PERFORM public.assert_period_open(public.current_tenant_id(), CURRENT_DATE);

  -- Build reversal journal (allow_posted_mutation on so the INSERT + line trigger passes)
  PERFORM set_config('nimbus.allow_posted_mutation', 'on', true);

  INSERT INTO public.journal_entries (
    tenant_id, number, entry_date, memo,
    source_ref_type, source_ref_id,
    total_debit, total_credit, status, created_by
  ) VALUES (
    public.current_tenant_id(),
    'VOID-' || COALESCE(je.number, _journal_id::text),
    CURRENT_DATE,
    'Reversal: ' || COALESCE(je.memo, _journal_id::text),
    'reversal',
    _journal_id,
    je.total_credit,   -- swapped: original credit total becomes reversal debit
    je.total_debit,    -- swapped: original debit  total becomes reversal credit
    'Posted',
    auth.uid()
  ) RETURNING id INTO v_reversal_id;

  -- Mirror-invert every line (swap debit ↔ credit)
  INSERT INTO public.journal_lines (
    tenant_id, journal_id, account_id, debit, credit, memo
  )
  SELECT
    public.current_tenant_id(),
    v_reversal_id,
    account_id,
    credit,                                              -- original credit → reversal debit
    debit,                                               -- original debit  → reversal credit
    'Reversal: ' || COALESCE(memo, _reason)
  FROM   public.journal_lines
  WHERE  journal_id = _journal_id
    AND  tenant_id  = public.current_tenant_id()
  ORDER  BY created_at, id;

  -- Recompute totals from actual inserted lines (guards against floating-point drift)
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
  INTO   v_debit, v_credit
  FROM   public.journal_lines
  WHERE  journal_id = v_reversal_id
    AND  tenant_id  = public.current_tenant_id();

  UPDATE public.journal_entries
  SET    total_debit = v_debit, total_credit = v_credit
  WHERE  id = v_reversal_id;

  -- Mark original Voided (allowed because allow_posted_mutation = 'on')
  UPDATE public.journal_entries
  SET    status = 'Voided', updated_at = now()
  WHERE  id = _journal_id;

  PERFORM set_config('nimbus.allow_posted_mutation', 'off', true);

  -- Balance assertion
  IF ABS(v_debit - v_credit) > 0.005 THEN
    RAISE EXCEPTION
      'Reversal journal is unbalanced: debit %, credit %', v_debit, v_credit;
  END IF;

  -- Audit records
  INSERT INTO public.document_reversals (
    tenant_id, entity_type, entity_id,
    reversal_journal_id, reason, actor_id, metadata
  ) VALUES (
    public.current_tenant_id(),
    'journal_entry', _journal_id, v_reversal_id,
    _reason, auth.uid(),
    jsonb_build_object('permission', 'accounting.journal.void')
  );

  INSERT INTO public.document_events (
    tenant_id, entity_type, entity_id, status, note, actor_id, actor_email
  ) VALUES (
    public.current_tenant_id(),
    'journal_entry', _journal_id, 'Voided',
    _reason || '. Reversal journal ' || v_reversal_id || ' created.',
    auth.uid(),
    (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

  INSERT INTO public.posting_audit_events (
    tenant_id, entity_type, entity_id, action, permission_code,
    result, actor_id, metadata
  ) VALUES (
    public.current_tenant_id(),
    'journal_entry', _journal_id, 'void', 'accounting.journal.void',
    'posted', auth.uid(),
    jsonb_build_object(
      'reversal_journal_id', v_reversal_id,
      'reversal_debit',  v_debit,
      'reversal_credit', v_credit,
      'reason',          _reason
    )
  ) ON CONFLICT (tenant_id, entity_type, entity_id, action) DO NOTHING;

  RETURN v_reversal_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.void_manual_journal(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.void_manual_journal(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 5.  Add posted_at to journal_entries if missing
--     (used by the immutability trigger and UI)
-- ─────────────────────────────────────────────────────────

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS posted_at timestamptz;

-- Back-fill: all rows currently marked Posted get posted_at = updated_at
UPDATE public.journal_entries
SET    posted_at = COALESCE(updated_at, created_at)
WHERE  lower(COALESCE(status,'')) = 'posted'
  AND  posted_at IS NULL;

-- Back-fill: all Voided rows get posted_at from their created_at
-- (they were posted before being voided)
UPDATE public.journal_entries
SET    posted_at = COALESCE(updated_at, created_at)
WHERE  lower(COALESCE(status,'')) IN ('voided','void','reversed')
  AND  posted_at IS NULL;

-- ─────────────────────────────────────────────────────────
-- 6.  Set posted_at on new Post writes
--     The post_manual_journal function sets status = 'Posted',
--     so we can set posted_at via a trigger instead of patching
--     every post_ function individually.
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.stamp_journal_posted_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'Posted' AND OLD.status IS DISTINCT FROM 'Posted' THEN
    NEW.posted_at := COALESCE(NEW.posted_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_entries_stamp_posted ON public.journal_entries;
CREATE TRIGGER trg_journal_entries_stamp_posted
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.stamp_journal_posted_at();

-- Also handle INSERT (for _emit_journal which inserts with status = 'Posted')
CREATE OR REPLACE FUNCTION public.stamp_journal_posted_at_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'Posted' AND NEW.posted_at IS NULL THEN
    NEW.posted_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_entries_stamp_posted_insert ON public.journal_entries;
CREATE TRIGGER trg_journal_entries_stamp_posted_insert
  BEFORE INSERT ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.stamp_journal_posted_at_insert();
