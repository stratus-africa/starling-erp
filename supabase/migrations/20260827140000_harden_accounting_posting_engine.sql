-- =========================================================
-- Harden accounting/document posting engine
--
-- Guarantees:
--   authorization -> tenant/status validation -> row lock/idempotency
--   -> existing posting implementation -> journal validation
--   -> inventory validation -> audit event
--
-- PostgreSQL functions run atomically: any validation failure after the
-- underlying posting call rolls back the complete transaction.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.posting_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  permission_code text NOT NULL,
  result text NOT NULL DEFAULT 'posted',
  actor_id uuid,
  posted_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posting_audit_events_result_check CHECK (result IN ('posted', 'idempotent')),
  CONSTRAINT posting_audit_events_unique UNIQUE (tenant_id, entity_type, entity_id, action)
);

CREATE INDEX IF NOT EXISTS posting_audit_events_tenant_created_idx
  ON public.posting_audit_events(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS posting_audit_events_entity_idx
  ON public.posting_audit_events(tenant_id, entity_type, entity_id);

ALTER TABLE public.posting_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can read posting audit events" ON public.posting_audit_events;
CREATE POLICY "Tenant members can read posting audit events"
  ON public.posting_audit_events
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

GRANT SELECT ON public.posting_audit_events TO authenticated;
GRANT ALL ON public.posting_audit_events TO service_role;

-- Common pre-flight. FOR UPDATE serializes two simultaneous clicks for the
-- same document. A second caller waits, sees posted_at, and returns the same
-- document id without generating another journal/inventory transaction.
CREATE OR REPLACE FUNCTION public.validate_posting_target(
  _table_name text,
  _document_id uuid,
  _permission text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid;
  v_status text;
  v_posted_at timestamptz;
  v_deleted_at timestamptz;
BEGIN
  IF NOT public.has_permission(_permission) THEN
    RAISE EXCEPTION 'Not authorized: %', _permission USING ERRCODE = '42501';
  END IF;

  IF _table_name NOT IN (
    'invoices', 'bills', 'credit_notes', 'shipments', 'packages',
    'inventory_adjustments', 'inventory_transfers', 'production_orders'
  ) THEN
    RAISE EXCEPTION 'Unsupported posting document: %', _table_name;
  END IF;

  EXECUTE format(
    'SELECT tenant_id, status, posted_at, deleted_at FROM public.%I WHERE id = $1 FOR UPDATE',
    _table_name
  )
  INTO v_tenant_id, v_status, v_posted_at, v_deleted_at
  USING _document_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '% not found', _table_name;
  END IF;

  -- Never allow a posting RPC to operate outside the active tenant, including
  -- for super-admins. A tenant context must always be explicit.
  IF v_tenant_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'Tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION '% has been deleted', _table_name;
  END IF;

  IF v_posted_at IS NOT NULL THEN
    RETURN false;
  END IF;

  IF lower(COALESCE(v_status, '')) IN ('posted', 'completed', 'cancelled', 'canceled', 'voided', 'rejected') THEN
    RAISE EXCEPTION '% cannot be posted from status %', _table_name, COALESCE(v_status, 'NULL');
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_posting_journals(
  _entity_id uuid,
  _entity_type text,
  _require_journal boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  j record;
  v_count integer := 0;
  v_debit numeric;
  v_credit numeric;
  v_line_count integer;
BEGIN
  FOR j IN
    SELECT id, total_debit, total_credit
    FROM public.journal_entries
    WHERE tenant_id = public.current_tenant_id()
      AND source_ref_id = _entity_id
      AND source_ref_type = _entity_type
      AND deleted_at IS NULL
    FOR UPDATE
  LOOP
    v_count := v_count + 1;

    SELECT
      COALESCE(SUM(COALESCE(debit, 0)), 0),
      COALESCE(SUM(COALESCE(credit, 0)), 0),
      COUNT(*)
    INTO v_debit, v_credit, v_line_count
    FROM public.journal_lines
    WHERE tenant_id = public.current_tenant_id()
      AND journal_id = j.id;

    IF v_line_count = 0 THEN
      RAISE EXCEPTION 'Journal % has no journal lines', j.id;
    END IF;

    IF ABS(COALESCE(j.total_debit, 0) - v_debit) > 0.005
       OR ABS(COALESCE(j.total_credit, 0) - v_credit) > 0.005 THEN
      RAISE EXCEPTION 'Journal % header totals do not match journal lines', j.id;
    END IF;

    IF ABS(v_debit - v_credit) > 0.005 THEN
      RAISE EXCEPTION 'Journal % is unbalanced: debit %, credit %', j.id, v_debit, v_credit;
    END IF;

    IF v_debit < 0 OR v_credit < 0 THEN
      RAISE EXCEPTION 'Journal % contains negative totals', j.id;
    END IF;
  END LOOP;

  IF _require_journal AND v_count = 0 THEN
    RAISE EXCEPTION 'Posting % % did not create a journal entry', _entity_type, _entity_id;
  END IF;

  RETURN v_count;
END;
$$;

-- Validate every stock movement generated by this document. For outbound
-- movements, enforce non-negative warehouse ledger balances when that
-- item/warehouse already has a movement ledger. This avoids breaking legacy
-- tenants whose opening balance lives only in items.stock.
CREATE OR REPLACE FUNCTION public.validate_posting_inventory(
  _entity_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  m record;
  v_item_tenant uuid;
  v_warehouse_tenant uuid;
  v_prior_count integer;
  v_balance numeric;
  v_count integer := 0;
BEGIN
  FOR m IN
    SELECT id, item_id, warehouse_id, quantity, unit_cost
    FROM public.stock_movements
    WHERE tenant_id = public.current_tenant_id()
      AND ref_id = _entity_id
    FOR UPDATE
  LOOP
    v_count := v_count + 1;

    IF m.quantity IS NULL OR m.quantity IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) THEN
      RAISE EXCEPTION 'Invalid inventory quantity on movement %', m.id;
    END IF;

    IF m.unit_cost IS NULL OR m.unit_cost < 0 OR m.unit_cost IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) THEN
      RAISE EXCEPTION 'Invalid inventory unit cost on movement %', m.id;
    END IF;

    SELECT tenant_id INTO v_item_tenant
    FROM public.items
    WHERE id = m.item_id AND deleted_at IS NULL;

    IF v_item_tenant IS NULL THEN
      RAISE EXCEPTION 'Inventory item % does not exist', m.item_id;
    END IF;

    IF v_item_tenant <> public.current_tenant_id() THEN
      RAISE EXCEPTION 'Inventory item % belongs to another tenant', m.item_id;
    END IF;

    IF m.warehouse_id IS NOT NULL THEN
      SELECT tenant_id INTO v_warehouse_tenant
      FROM public.warehouses
      WHERE id = m.warehouse_id AND deleted_at IS NULL;

      IF v_warehouse_tenant IS NULL THEN
        RAISE EXCEPTION 'Warehouse % does not exist', m.warehouse_id;
      END IF;

      IF v_warehouse_tenant <> public.current_tenant_id() THEN
        RAISE EXCEPTION 'Warehouse % belongs to another tenant', m.warehouse_id;
      END IF;
    END IF;

    IF m.quantity < 0 THEN
      SELECT COUNT(*) INTO v_prior_count
      FROM public.stock_movements
      WHERE tenant_id = public.current_tenant_id()
        AND item_id = m.item_id
        AND warehouse_id IS NOT DISTINCT FROM m.warehouse_id
        AND id <> m.id;

      IF v_prior_count > 0 THEN
        SELECT COALESCE(SUM(quantity), 0) INTO v_balance
        FROM public.stock_movements
        WHERE tenant_id = public.current_tenant_id()
          AND item_id = m.item_id
          AND warehouse_id IS NOT DISTINCT FROM m.warehouse_id;

        IF v_balance < -0.0001 THEN
          RAISE EXCEPTION 'Insufficient inventory for item % at warehouse % (balance %)',
            m.item_id, COALESCE(m.warehouse_id::text, 'default'), v_balance;
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_posting(
  _entity_id uuid,
  _entity_type text,
  _action text,
  _permission text,
  _require_journal boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_journals integer;
  v_movements integer;
BEGIN
  v_journals := public.validate_posting_journals(_entity_id, _entity_type, _require_journal);
  v_movements := public.validate_posting_inventory(_entity_id);

  INSERT INTO public.posting_audit_events (
    tenant_id, entity_type, entity_id, action, permission_code,
    result, actor_id, metadata
  ) VALUES (
    public.current_tenant_id(), _entity_type, _entity_id, _action, _permission,
    'posted', auth.uid(),
    jsonb_build_object('journal_entries', v_journals, 'stock_movements', v_movements)
  )
  ON CONFLICT (tenant_id, entity_type, entity_id, action) DO NOTHING;

  RETURN _entity_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_posting_target(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_posting_journals(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_posting_inventory(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_posting(uuid, text, text, text, boolean) TO authenticated;

-- =========================================================
-- Secure wrappers. Existing *_unchecked implementations remain private and
-- are executed inside the same transaction as all validations.
-- =========================================================

CREATE OR REPLACE FUNCTION public.post_invoice(_invoice_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.validate_posting_target('invoices', _invoice_id, 'sales.accounting_post') THEN
    RETURN _invoice_id;
  END IF;
  PERFORM public.post_invoice_unchecked(_invoice_id);
  RETURN public.complete_posting(_invoice_id, 'invoice', 'post', 'sales.accounting_post', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_bill(_bill_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.validate_posting_target('bills', _bill_id, 'purchasing.post') THEN
    RETURN _bill_id;
  END IF;
  PERFORM public.post_bill_unchecked(_bill_id);
  RETURN public.complete_posting(_bill_id, 'bill', 'post', 'purchasing.post', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_credit_note(_credit_note_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.validate_posting_target('credit_notes', _credit_note_id, 'sales.accounting_post') THEN
    RETURN _credit_note_id;
  END IF;
  PERFORM public.post_credit_note_unchecked(_credit_note_id);
  RETURN public.complete_posting(_credit_note_id, 'credit_note', 'post', 'sales.accounting_post', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_shipment(_shipment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.validate_posting_target('shipments', _shipment_id, 'sales.post') THEN
    RETURN _shipment_id;
  END IF;
  PERFORM public.post_shipment_unchecked(_shipment_id);
  RETURN public.complete_posting(_shipment_id, 'shipment', 'post', 'sales.post', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_package(_package_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.validate_posting_target('packages', _package_id, 'sales.post') THEN
    RETURN _package_id;
  END IF;
  PERFORM public.post_package_unchecked(_package_id);
  RETURN public.complete_posting(_package_id, 'package', 'post', 'sales.post', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_adjustment(_adjustment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_requires_journal boolean;
BEGIN
  IF NOT public.validate_posting_target('inventory_adjustments', _adjustment_id, 'inventory.adjust') THEN
    RETURN _adjustment_id;
  END IF;
  PERFORM public.post_adjustment_unchecked(_adjustment_id);
  SELECT EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE tenant_id = public.current_tenant_id()
      AND source_ref_id = _adjustment_id
      AND source_ref_type = 'adjustment'
      AND deleted_at IS NULL
  ) INTO v_requires_journal;
  RETURN public.complete_posting(_adjustment_id, 'adjustment', 'post', 'inventory.adjust', v_requires_journal);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_transfer(_transfer_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.validate_posting_target('inventory_transfers', _transfer_id, 'inventory.transfer') THEN
    RETURN _transfer_id;
  END IF;
  PERFORM public.post_transfer_unchecked(_transfer_id);
  RETURN public.complete_posting(_transfer_id, 'transfer', 'post', 'inventory.transfer', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_production_order(_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.validate_posting_target('production_orders', _order_id, 'manufacturing.post') THEN
    RETURN _order_id;
  END IF;
  PERFORM public.post_production_order_unchecked(_order_id);
  RETURN public.complete_posting(_order_id, 'production_order', 'post', 'manufacturing.post', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_posting_target(text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_posting_journals(uuid, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_posting_inventory(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_posting(uuid, text, text, text, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.post_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_bill(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_credit_note(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_shipment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_package(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_adjustment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_transfer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_production_order(uuid) TO authenticated;
