-- BOM governance and immutable BOM-version capture for manufacturing orders.

ALTER TABLE public.bom_headers
  ADD COLUMN IF NOT EXISTS uom text;

UPDATE public.bom_headers bh
SET uom = i.uom
FROM public.items i
WHERE bh.uom IS NULL
  AND bh.product_id = i.id;

ALTER TABLE public.bom_lines
  DROP CONSTRAINT IF EXISTS bom_lines_quantity_positive_check,
  ADD CONSTRAINT bom_lines_quantity_positive_check CHECK (quantity > 0) NOT VALID,
  DROP CONSTRAINT IF EXISTS bom_lines_scrap_pct_valid_check,
  ADD CONSTRAINT bom_lines_scrap_pct_valid_check CHECK (scrap_pct >= 0 AND scrap_pct < 100);

CREATE OR REPLACE FUNCTION public.validate_bom_line_values()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item items;
BEGIN
  IF NEW.item_id IS NULL THEN
    RAISE EXCEPTION 'A BOM component item is required' USING ERRCODE = '23514';
  END IF;

  IF COALESCE(NEW.quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'BOM component quantity must be greater than zero' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_item FROM public.items WHERE id = NEW.item_id AND deleted_at IS NULL;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'BOM component item was not found' USING ERRCODE = '23503';
  END IF;

  IF v_item.status IN ('Inactive', 'Discontinued', 'Obsolete') THEN
    RAISE EXCEPTION 'Inactive item % cannot be used as a BOM component', v_item.name USING ERRCODE = '23514';
  END IF;

  IF NEW.uom IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.units_of_measure u
    WHERE u.tenant_id = NEW.tenant_id
      AND u.code = NEW.uom
      AND u.is_active = true
      AND u.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'BOM component UOM % is not an active tenant UOM', COALESCE(NEW.uom, '<empty>')
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bom_lines bl
    WHERE bl.bom_id = NEW.bom_id
      AND bl.item_id = NEW.item_id
      AND bl.deleted_at IS NULL
      AND bl.id <> COALESCE(NEW.id, gen_random_uuid())
  ) THEN
    RAISE EXCEPTION 'BOM component % is already present; consolidate duplicate lines', v_item.name
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bom_line_validate ON public.bom_lines;
CREATE TRIGGER trg_bom_line_validate
  BEFORE INSERT OR UPDATE OF bom_id, item_id, quantity, uom, tenant_id ON public.bom_lines
  FOR EACH ROW EXECUTE FUNCTION public.validate_bom_line_values();

CREATE INDEX IF NOT EXISTS bom_headers_product_version_idx
  ON public.bom_headers (tenant_id, product_id, version)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.archive_bom(_bom_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
BEGIN
  IF NOT has_permission('manufacturing.bom.archive') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.bom_headers
  SET approval_status = 'Archived', status = 'Archived', updated_at = now()
  WHERE id = _bom_id AND tenant_id = v_tenant AND deleted_at IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'BOM not found'; END IF;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  SELECT v_tenant, 'bom', id, 'Archived', 'BOM archived', auth.uid(),
         (SELECT email FROM public.profiles WHERE id = auth.uid())
  FROM public.bom_headers WHERE id = _bom_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_bom(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.activate_bom(_bom_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_bom bom_headers;
BEGIN
  IF NOT has_permission('manufacturing.bom.activate') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_bom FROM public.bom_headers
  WHERE id = _bom_id AND tenant_id = v_tenant AND deleted_at IS NULL;
  IF v_bom.id IS NULL THEN RAISE EXCEPTION 'BOM not found'; END IF;
  IF v_bom.approval_status NOT IN ('Approved', 'Inactive') THEN
    RAISE EXCEPTION 'Only Approved or Inactive BOMs can be activated (current: %)', v_bom.approval_status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(public.validate_bom(_bom_id)) issue
    WHERE issue->>'level' = 'error'
  ) THEN
    RAISE EXCEPTION 'BOM has validation errors and cannot be activated';
  END IF;

  UPDATE public.bom_headers
  SET approval_status = 'Inactive', status = 'Inactive', updated_at = now()
  WHERE tenant_id = v_tenant AND product_id = v_bom.product_id
    AND approval_status = 'Active' AND id <> _bom_id AND deleted_at IS NULL;

  UPDATE public.bom_headers
  SET approval_status = 'Active', status = 'Active', updated_at = now()
  WHERE id = _bom_id;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (v_tenant, 'bom', _bom_id, 'Active', 'BOM activated', auth.uid(),
          (SELECT email FROM public.profiles WHERE id = auth.uid()));
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_bom(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.capture_production_order_bom_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(OLD.status, 'Draft') NOT IN ('Draft', 'Planned') AND NEW.bom_id IS DISTINCT FROM OLD.bom_id THEN
    RAISE EXCEPTION 'BOM cannot be changed after confirmation; create a new manufacturing order'
      USING ERRCODE = '55000';
  END IF;
  IF NEW.bom_version_snapshot IS DISTINCT FROM OLD.bom_version_snapshot
     AND NOT (
       OLD.bom_version_snapshot IS NULL
       AND NEW.bom_version_snapshot IS NOT NULL
       AND NEW.status = 'Confirmed'
       AND COALESCE(OLD.status, 'Draft') IN ('Draft', 'Planned')
     ) THEN
    RAISE EXCEPTION 'BOM version snapshot is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_production_order_bom_snapshot ON public.production_orders;
CREATE TRIGGER trg_production_order_bom_snapshot
  BEFORE UPDATE OF bom_id, bom_version_snapshot ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.capture_production_order_bom_version();

-- Replace confirmation so normal orders can only use Active BOMs and retain the
-- selected version before any later BOM revision or activation change.
CREATE OR REPLACE FUNCTION public.confirm_production_order(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  mo production_orders;
  bm bom_headers;
BEGIN
  IF NOT has_permission('manufacturing.update') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO mo FROM public.production_orders
  WHERE id = _order_id AND tenant_id = v_tenant AND deleted_at IS NULL;
  IF mo.id IS NULL THEN RAISE EXCEPTION 'Production order not found'; END IF;
  IF mo.status NOT IN ('Draft', 'Planned') THEN
    RAISE EXCEPTION 'Only Draft or Planned orders can be confirmed (current: %)', mo.status;
  END IF;
  IF mo.bom_id IS NULL THEN RAISE EXCEPTION 'An Active BOM must be assigned before confirming a manufacturing order'; END IF;

  SELECT * INTO bm FROM public.bom_headers
  WHERE id = mo.bom_id AND tenant_id = v_tenant AND deleted_at IS NULL;
  IF bm.id IS NULL OR bm.approval_status <> 'Active' THEN
    RAISE EXCEPTION 'Only an Active BOM can be used for a manufacturing order';
  END IF;
  IF mo.product_id IS NOT NULL AND bm.product_id IS DISTINCT FROM mo.product_id THEN
    RAISE EXCEPTION 'Selected BOM product does not match the manufacturing order finished item';
  END IF;

  UPDATE public.production_orders
  SET status = 'Confirmed', confirmed_at = now(), confirmed_by = auth.uid(),
      bom_version_snapshot = bm.version, updated_at = now()
  WHERE id = _order_id;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (v_tenant, 'production_order', _order_id, 'Confirmed',
          'Manufacturing order confirmed with BOM version ' || COALESCE(bm.version, '<unversioned>'),
          auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()));
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_production_order(uuid) TO authenticated;

INSERT INTO public.permissions (code, module, action, description) VALUES
  ('manufacturing.bom.view', 'manufacturing', 'bom.view', 'View bills of materials'),
  ('manufacturing.bom.create', 'manufacturing', 'bom.create', 'Create bills of materials'),
  ('manufacturing.bom.edit', 'manufacturing', 'bom.edit', 'Edit bills of materials'),
  ('manufacturing.bom.activate', 'manufacturing', 'bom.activate', 'Activate BOM versions'),
  ('manufacturing.bom.archive', 'manufacturing', 'bom.archive', 'Archive BOM versions')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.role_permissions (role, permission_code)
SELECT 'manufacturing', code FROM public.permissions
WHERE code IN ('manufacturing.bom.view', 'manufacturing.bom.create', 'manufacturing.bom.edit',
               'manufacturing.bom.activate', 'manufacturing.bom.archive')
ON CONFLICT DO NOTHING;
