-- =========================================================
-- Immutable posted documents + controlled reversal workflow
--
-- Posted documents are locked. Voiding creates a new reversal journal and
-- inverse inventory movements while preserving the original document,
-- journal and movement records for auditability.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.document_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  reversal_journal_id uuid REFERENCES public.journal_entries(id),
  reason text NOT NULL,
  actor_id uuid,
  voided_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS document_reversals_tenant_created_idx
  ON public.document_reversals(tenant_id, created_at DESC);

ALTER TABLE public.document_reversals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_reversals_tenant_read ON public.document_reversals;
CREATE POLICY document_reversals_tenant_read
  ON public.document_reversals FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
GRANT SELECT ON public.document_reversals TO authenticated;
GRANT ALL ON public.document_reversals TO service_role;

-- Reversal metadata is deliberately added to the source documents rather than
-- deleting or replacing the originals.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'invoices','bills','credit_notes','shipments','packages',
    'inventory_adjustments','inventory_transfers','production_orders',
    'payments_received','payments_made','expenses'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS voided_at timestamptz', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS voided_by uuid', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS reversal_id uuid', t);
  END LOOP;
END $$;

-- Existing payment tables did not have posted_at in the current schema.
ALTER TABLE public.payments_received ADD COLUMN IF NOT EXISTS posted_at timestamptz;
ALTER TABLE public.payments_made ADD COLUMN IF NOT EXISTS posted_at timestamptz;

CREATE OR REPLACE FUNCTION public.assert_posted_document_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_posted_at timestamptz;
  old_status text;
BEGIN
  old_posted_at := (to_jsonb(OLD)->>'posted_at')::timestamptz;
  old_status := to_jsonb(OLD)->>'status';

  IF current_setting('nimbus.allow_posted_mutation', true) IS DISTINCT FROM 'on' THEN
    IF TG_OP = 'DELETE' AND (old_posted_at IS NOT NULL OR lower(COALESCE(old_status, '')) IN ('voided','void','reversed','posted','completed')) THEN
      RAISE EXCEPTION 'Posted/voided % % is locked. Void it to create a reversal instead.', TG_TABLE_NAME, OLD.id
        USING ERRCODE = '55000';
    END IF;

    IF TG_OP = 'UPDATE' AND old_posted_at IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'Posted % % is locked. Void it to create a reversal instead.', TG_TABLE_NAME, OLD.id
        USING ERRCODE = '55000';
    END IF;

    IF TG_OP = 'UPDATE' AND lower(COALESCE(old_status, '')) IN ('voided','void','reversed') AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'Voided % % is locked.', TG_TABLE_NAME, OLD.id
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'invoices','bills','credit_notes','shipments','packages',
    'inventory_adjustments','inventory_transfers','production_orders',
    'payments_received','payments_made','expenses'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_posted_immutable ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_posted_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.assert_posted_document_immutable()', t, t);
  END LOOP;
END $$;

-- Create a balanced inverse of every journal belonging to the original
-- document. The original journal remains untouched.
CREATE OR REPLACE FUNCTION public.create_reversal_journal(
  _entity_id uuid,
  _entity_type text,
  _reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  j record;
  l record;
  v_reversal_id uuid;
  v_count integer := 0;
  v_debit numeric := 0;
  v_credit numeric := 0;
BEGIN
  INSERT INTO public.journal_entries (
    tenant_id, entry_date, memo, source_ref_type, source_ref_id,
    total_debit, total_credit, status, created_by
  ) VALUES (
    public.current_tenant_id(), CURRENT_DATE,
    'Reversal: ' || _entity_type || ' ' || _entity_id::text,
    'reversal', _entity_id, 0, 0, 'Posted', auth.uid()
  ) RETURNING id INTO v_reversal_id;

  FOR j IN
    SELECT id
    FROM public.journal_entries
    WHERE tenant_id = public.current_tenant_id()
      AND source_ref_id = _entity_id
      AND source_ref_type = _entity_type
      AND deleted_at IS NULL
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    v_count := v_count + 1;
    FOR l IN
      SELECT account_id, debit, credit, memo
      FROM public.journal_lines
      WHERE tenant_id = public.current_tenant_id() AND journal_id = j.id
      ORDER BY created_at, id
    LOOP
      v_debit := v_debit + COALESCE(l.credit, 0);
      v_credit := v_credit + COALESCE(l.debit, 0);
      INSERT INTO public.journal_lines (
        tenant_id, journal_id, account_id, debit, credit, memo
      ) VALUES (
        public.current_tenant_id(), v_reversal_id, l.account_id,
        COALESCE(l.credit, 0), COALESCE(l.debit, 0),
        'Reversal: ' || COALESCE(l.memo, _reason)
      );
    END LOOP;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Cannot void % %. No journal entry exists to reverse.', _entity_type, _entity_id;
  END IF;

  IF ABS(v_debit - v_credit) > 0.005 THEN
    RAISE EXCEPTION 'Generated reversal is unbalanced: debit %, credit %', v_debit, v_credit;
  END IF;

  UPDATE public.journal_entries
  SET total_debit = v_debit,
      total_credit = v_credit
  WHERE id = v_reversal_id;

  RETURN v_reversal_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_reversal_movements(
  _entity_id uuid,
  _entity_type text,
  _reversal_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  m record;
  v_count integer := 0;
BEGIN
  FOR m IN
    SELECT item_id, warehouse_id, quantity, unit_cost, note
    FROM public.stock_movements
    WHERE tenant_id = public.current_tenant_id()
      AND ref_id = _entity_id
    ORDER BY created_at, id
  LOOP
    INSERT INTO public.stock_movements (
      tenant_id, item_id, warehouse_id, quantity, unit_cost,
      ref_type, ref_id, note, created_by
    ) VALUES (
      public.current_tenant_id(), m.item_id, m.warehouse_id,
      -COALESCE(m.quantity, 0), COALESCE(m.unit_cost, 0),
      'reversal', _reversal_id,
      'Reversal of ' || _entity_type || ': ' || COALESCE(m.note, ''),
      auth.uid()
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.void_posted_document(
  _entity_type text,
  _entity_id uuid,
  _permission text,
  _reason text DEFAULT 'Document voided and reversed'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_table text;
  v_tenant_id uuid;
  v_status text;
  v_posted_at timestamptz;
  v_voided_at timestamptz;
  v_reversal_id uuid;
  v_journal_id uuid;
  v_movement_count integer;
BEGIN
  IF NOT public.has_permission(_permission) THEN
    RAISE EXCEPTION 'Not authorized: %', _permission USING ERRCODE = '42501';
  END IF;

  v_table := CASE _entity_type
    WHEN 'invoice' THEN 'invoices'
    WHEN 'bill' THEN 'bills'
    WHEN 'credit_note' THEN 'credit_notes'
    WHEN 'shipment' THEN 'shipments'
    WHEN 'package' THEN 'packages'
    WHEN 'adjustment' THEN 'inventory_adjustments'
    WHEN 'transfer' THEN 'inventory_transfers'
    WHEN 'production_order' THEN 'production_orders'
    WHEN 'payment_received' THEN 'payments_received'
    WHEN 'payment_made' THEN 'payments_made'
    WHEN 'expense' THEN 'expenses'
    ELSE NULL
  END;

  IF v_table IS NULL THEN
    RAISE EXCEPTION 'Unsupported reversible document type: %', _entity_type;
  END IF;

  EXECUTE format(
    'SELECT tenant_id, status, posted_at, voided_at FROM public.%I WHERE id = $1 FOR UPDATE',
    v_table
  ) INTO v_tenant_id, v_status, v_posted_at, v_voided_at USING _entity_id;

  IF NOT FOUND THEN RAISE EXCEPTION '% % not found', _entity_type, _entity_id; END IF;
  IF v_tenant_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'Tenant mismatch' USING ERRCODE = '42501';
  END IF;
  IF v_voided_at IS NOT NULL OR lower(COALESCE(v_status, '')) IN ('voided', 'void', 'reversed') THEN
    SELECT id INTO v_reversal_id FROM public.document_reversals
    WHERE tenant_id = public.current_tenant_id() AND entity_type = _entity_type AND entity_id = _entity_id;
    IF v_reversal_id IS NOT NULL THEN RETURN v_reversal_id; END IF;
    RAISE EXCEPTION '% % has already been voided', _entity_type, _entity_id;
  END IF;
  IF v_posted_at IS NULL THEN
    RAISE EXCEPTION 'Only posted documents can be voided';
  END IF;

  -- The unique row lock plus the reversal unique key makes the operation
  -- idempotent even when two clients attempt to void simultaneously.
  SELECT id INTO v_reversal_id FROM public.document_reversals
  WHERE tenant_id = public.current_tenant_id() AND entity_type = _entity_type AND entity_id = _entity_id;
  IF v_reversal_id IS NOT NULL THEN RETURN v_reversal_id; END IF;

  v_journal_id := public.create_reversal_journal(_entity_id, _entity_type, _reason);

  INSERT INTO public.document_reversals (
    tenant_id, entity_type, entity_id, reversal_journal_id,
    reason, actor_id, metadata
  ) VALUES (
    public.current_tenant_id(), _entity_type, _entity_id, v_journal_id,
    _reason, auth.uid(), jsonb_build_object('permission', _permission)
  ) RETURNING id INTO v_reversal_id;

  v_movement_count := public.create_reversal_movements(_entity_id, _entity_type, v_reversal_id);

  PERFORM set_config('nimbus.allow_posted_mutation', 'on', true);
  EXECUTE format(
    'UPDATE public.%I SET status = ''Voided'', voided_at = now(), voided_by = $2, reversal_id = $3 WHERE id = $1',
    v_table
  ) USING _entity_id, auth.uid(), v_reversal_id;
  PERFORM set_config('nimbus.allow_posted_mutation', 'off', true);

  INSERT INTO public.posting_audit_events (
    tenant_id, entity_type, entity_id, action, permission_code,
    result, actor_id, metadata
  ) VALUES (
    public.current_tenant_id(), _entity_type, _entity_id, 'void', _permission,
    'posted', auth.uid(), jsonb_build_object(
      'reversal_id', v_reversal_id,
      'reversal_journal_id', v_journal_id,
      'reversal_stock_movements', v_movement_count,
      'reason', _reason
    )
  ) ON CONFLICT (tenant_id, entity_type, entity_id, action) DO NOTHING;

  INSERT INTO public.document_events (
    tenant_id, entity_type, entity_id, status, note, actor_id, actor_email
  ) VALUES (
    public.current_tenant_id(), _entity_type, _entity_id, 'Voided',
    _reason || '. Reversal journal created; original document retained.',
    auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

  RETURN v_reversal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_reversal_journal(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_reversal_movements(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_posted_document(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_posted_document(text, uuid, text, text) TO authenticated;

-- Seed reversal permissions. Tenant/super admins are implicitly authorized by
-- has_permission(); module roles receive only their own reversal capability.
INSERT INTO public.permissions (code, module, action, description) VALUES
  ('sales.void','sales','void','Void and reverse posted sales documents'),
  ('purchasing.void','purchasing','void','Void and reverse posted purchasing documents'),
  ('payments.void','payments','void','Void and reverse posted payments'),
  ('inventory.void','inventory','void','Void and reverse posted inventory documents'),
  ('manufacturing.void','manufacturing','void','Void and reverse posted production documents'),
  ('banking.void','banking','void','Void and reverse posted banking transactions'),
  ('accounting.reverse','accounting','reverse','Create accounting reversals')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('sales','sales.void'),
  ('cashier','sales.void'),
  ('purchasing','purchasing.void'),
  ('inventory','inventory.void'),
  ('manufacturing','manufacturing.void'),
  ('accounting','accounting.reverse'),
  ('accounting','banking.void')
ON CONFLICT DO NOTHING;
