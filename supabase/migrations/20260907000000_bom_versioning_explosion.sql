-- =========================================================
-- BOM Versioning, Multi-Level Explosion & Approval
--
-- Adds to existing bom_headers (does NOT recreate):
--   effective_from, effective_to, revision_notes,
--   approval_status, approved_by, approved_at,
--   used_in_production (computed flag, maintained by trigger)
--
-- Adds to existing bom_lines (does NOT recreate):
--   description, scrap_pct
--
-- New RPCs:
--   validate_bom(_bom_id)          – full validation, returns array of issues
--   explode_bom(_bom_id, _qty)     – recursive explosion to all levels
--   approve_bom(_bom_id)           – set approval_status = Approved
--   activate_bom(_bom_id)          – set approval_status = Active
--
-- New triggers:
--   trg_bom_circular_check         – prevents circular component references
--   trg_bom_lock_if_used           – prevents silent modification of a BOM
--                                    that has already been used in a
--                                    Completed production order
--
-- Updated:
--   post_production_order_unchecked – uses explode_bom for multi-level
--                                    component consumption
-- =========================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  Extend bom_headers
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.bom_headers
  ADD COLUMN IF NOT EXISTS effective_from    date,
  ADD COLUMN IF NOT EXISTS effective_to      date,
  ADD COLUMN IF NOT EXISTS revision_notes    text,
  -- approval lifecycle: Draft → Pending Approval → Approved → Active → Inactive → Obsolete
  ADD COLUMN IF NOT EXISTS approval_status   text  NOT NULL DEFAULT 'Draft',
  ADD COLUMN IF NOT EXISTS approved_by       uuid  REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at       timestamptz,
  -- set to true the first time this BOM is used by a Completed production order
  ADD COLUMN IF NOT EXISTS used_in_production boolean NOT NULL DEFAULT false;

-- Expand status options (was Active/Draft/Archived)
ALTER TABLE public.bom_headers
  DROP CONSTRAINT IF EXISTS bom_headers_status_check;

-- Back-fill approval_status from existing status column
UPDATE public.bom_headers
SET approval_status =
  CASE status
    WHEN 'Active'   THEN 'Active'
    WHEN 'Draft'    THEN 'Draft'
    WHEN 'Archived' THEN 'Obsolete'
    ELSE 'Draft'
  END
WHERE approval_status = 'Draft';

-- Index for fast "active BOM for a product" lookups
CREATE INDEX IF NOT EXISTS bom_headers_product_status_idx
  ON public.bom_headers (product_id, approval_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS bom_headers_effective_idx
  ON public.bom_headers (effective_from, effective_to)
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  Extend bom_lines
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.bom_lines
  ADD COLUMN IF NOT EXISTS description text,
  -- scrap_pct: additional % of the component to consume as waste
  -- effective quantity consumed = quantity * (1 + scrap_pct / 100)
  ADD COLUMN IF NOT EXISTS scrap_pct   numeric NOT NULL DEFAULT 0
    CHECK (scrap_pct >= 0 AND scrap_pct < 100);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.  Circular BOM detection trigger
--     Fires BEFORE INSERT or UPDATE on bom_lines.
--     Walks up the BOM tree via a recursive CTE to detect if the new component
--     would create a cycle (component is an ancestor of its own finished good).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_bom_circular()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_product_id uuid;
BEGIN
  IF NEW.item_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get the finished product for this BOM
  SELECT product_id INTO v_product_id
  FROM bom_headers
  WHERE id = NEW.bom_id AND deleted_at IS NULL;

  IF v_product_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- A circular reference exists if the new component item IS the finished product,
  -- OR if the new component item itself has a BOM that (transitively) consumes
  -- the finished product.
  -- We walk: starting from NEW.item_id, expand all BOM components recursively.
  -- If we encounter v_product_id anywhere in the component tree → circular.
  IF EXISTS (
    WITH RECURSIVE bom_tree AS (
      -- Seed: all direct components of the item being added as a component
      SELECT bl.item_id AS component_id
      FROM   bom_headers bh
      JOIN   bom_lines   bl ON bl.bom_id = bh.id AND bl.deleted_at IS NULL
      WHERE  bh.product_id = NEW.item_id
        AND  bh.deleted_at IS NULL
        AND  bh.approval_status IN ('Active', 'Approved', 'Draft')

      UNION ALL

      -- Recurse through sub-components
      SELECT bl.item_id
      FROM   bom_headers bh
      JOIN   bom_lines   bl ON bl.bom_id = bh.id AND bl.deleted_at IS NULL
      JOIN   bom_tree    bt ON bh.product_id = bt.component_id
      WHERE  bh.deleted_at IS NULL
    )
    SELECT 1 FROM bom_tree WHERE component_id = v_product_id
    LIMIT 1
  ) OR NEW.item_id = v_product_id
  THEN
    RAISE EXCEPTION 'Circular BOM reference: item % would create a cycle in BOM %',
      NEW.item_id, NEW.bom_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bom_circular_check ON public.bom_lines;
CREATE TRIGGER trg_bom_circular_check
  BEFORE INSERT OR UPDATE OF item_id ON public.bom_lines
  FOR EACH ROW EXECUTE FUNCTION public.check_bom_circular();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.  BOM immutability lock trigger
--     Once a BOM has used_in_production = true the header lines may not be
--     silently modified.  Users must create a new version instead.
--     We allow changes to non-structural fields (notes, revision_notes,
--     approval_status, approved_by, approved_at, effective_to).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.lock_used_bom()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_used boolean;
BEGIN
  -- Only enforce on bom_lines changes
  SELECT used_in_production INTO v_used
  FROM   bom_headers
  WHERE  id = COALESCE(NEW.bom_id, OLD.bom_id)
    AND  deleted_at IS NULL;

  IF v_used = true THEN
    -- Allow soft-delete of lines (that's a reversal, not a silent edit)
    -- Allow update of non-structural fields: description, line_no ordering
    -- Block structural changes: item_id, quantity, uom, uom_factor, scrap_pct
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION
        'BOM has been used in production and cannot be modified. Create a new version.',
        USING ERRCODE = 'P0001';
    END IF;

    IF TG_OP = 'UPDATE' THEN
      IF OLD.item_id    IS DISTINCT FROM NEW.item_id    OR
         OLD.quantity   IS DISTINCT FROM NEW.quantity   OR
         OLD.uom        IS DISTINCT FROM NEW.uom        OR
         OLD.uom_factor IS DISTINCT FROM NEW.uom_factor OR
         OLD.scrap_pct  IS DISTINCT FROM NEW.scrap_pct
      THEN
        RAISE EXCEPTION
          'BOM has been used in production. Structural line changes are not allowed. Create a new version.',
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_bom_lock_if_used ON public.bom_lines;
CREATE TRIGGER trg_bom_lock_if_used
  BEFORE INSERT OR UPDATE OR DELETE ON public.bom_lines
  FOR EACH ROW EXECUTE FUNCTION public.lock_used_bom();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.  validate_bom(_bom_id)
--     Client-callable RPC. Returns an array of validation messages.
--     Empty array = valid.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_bom(_bom_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_bom    bom_headers;
  issues   jsonb := '[]'::jsonb;
  dup_item uuid;
  line     record;
BEGIN
  SELECT * INTO v_bom
  FROM bom_headers
  WHERE id = _bom_id AND tenant_id = v_tenant AND deleted_at IS NULL;

  IF v_bom.id IS NULL THEN
    RETURN jsonb_build_array(jsonb_build_object('level','error','message','BOM not found'));
  END IF;

  -- 1. Must have a product
  IF v_bom.product_id IS NULL THEN
    issues := issues || jsonb_build_array(
      jsonb_build_object('level','error','message','BOM has no output product defined'));
  END IF;

  -- 2. Must have at least one component
  IF NOT EXISTS (
    SELECT 1 FROM bom_lines WHERE bom_id = _bom_id AND deleted_at IS NULL AND item_id IS NOT NULL
  ) THEN
    issues := issues || jsonb_build_array(
      jsonb_build_object('level','error','message','BOM has no components'));
  END IF;

  -- 3. Yield qty must be positive
  IF COALESCE(v_bom.yield_qty, 0) <= 0 THEN
    issues := issues || jsonb_build_array(
      jsonb_build_object('level','error','message','Yield quantity must be greater than zero'));
  END IF;

  -- 4. Effective date range
  IF v_bom.effective_from IS NOT NULL AND v_bom.effective_to IS NOT NULL
     AND v_bom.effective_from > v_bom.effective_to THEN
    issues := issues || jsonb_build_array(
      jsonb_build_object('level','error','message','Effective From must be before Effective To'));
  END IF;

  -- 5. Per-line validation
  FOR line IN
    SELECT bl.*, i.status AS item_status, i.name AS item_name, i.uom AS stock_uom,
           i.track_inventory
    FROM bom_lines bl
    LEFT JOIN items i ON i.id = bl.item_id
    WHERE bl.bom_id = _bom_id AND bl.deleted_at IS NULL
  LOOP
    -- Missing item
    IF line.item_id IS NULL THEN
      issues := issues || jsonb_build_array(
        jsonb_build_object('level','error','message',
          format('Line %s: no component item selected', line.line_no)));
      CONTINUE;
    END IF;

    -- Inactive item
    IF line.item_status IN ('Inactive', 'Discontinued', 'Obsolete') THEN
      issues := issues || jsonb_build_array(
        jsonb_build_object('level','warning','message',
          format('Line %s: item "%s" is %s', line.line_no, line.item_name, line.item_status)));
    END IF;

    -- Zero or negative quantity
    IF COALESCE(line.quantity, 0) <= 0 THEN
      issues := issues || jsonb_build_array(
        jsonb_build_object('level','error','message',
          format('Line %s: quantity must be greater than zero', line.line_no)));
    END IF;

    -- Negative scrap
    IF COALESCE(line.scrap_pct, 0) < 0 THEN
      issues := issues || jsonb_build_array(
        jsonb_build_object('level','error','message',
          format('Line %s: scrap %% cannot be negative', line.line_no)));
    END IF;

    -- UoM path check: if a non-stock UoM is chosen, a conversion must exist
    IF line.uom IS NOT NULL
       AND line.stock_uom IS NOT NULL
       AND line.uom <> line.stock_uom
       AND NOT public.uom_has_path(line.uom, line.stock_uom, line.tenant_id)
    THEN
      issues := issues || jsonb_build_array(
        jsonb_build_object('level','error','message',
          format('Line %s: no UoM conversion path from "%s" to "%s" for item "%s"',
            line.line_no, line.uom, line.stock_uom, line.item_name)));
    END IF;
  END LOOP;

  -- 6. Duplicate components
  SELECT item_id INTO dup_item
  FROM bom_lines
  WHERE bom_id = _bom_id AND deleted_at IS NULL AND item_id IS NOT NULL
  GROUP BY item_id
  HAVING COUNT(*) > 1
  LIMIT 1;

  IF dup_item IS NOT NULL THEN
    issues := issues || jsonb_build_array(
      jsonb_build_object('level','warning','message',
        format('Item %s appears on multiple lines — consider consolidating', dup_item)));
  END IF;

  RETURN issues;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_bom(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6.  explode_bom(_bom_id, _qty, _max_depth)
--     Recursive multi-level explosion.
--     Returns one row per component at any level, with:
--       level          — nesting depth (1 = direct, 2 = sub-assembly component, …)
--       path           — text path like "1 → 2 → 3" of bom_ids traversed
--       item_id        — component item UUID
--       item_name      — component item name
--       sku            — component SKU
--       uom            — stock UoM
--       qty_per        — quantity per BOM yield at this level
--       total_qty      — qty_per × _qty (scaled to production quantity)
--       effective_qty  — total_qty × (1 + scrap_pct/100)
--       unit_cost      — from bom_line or item.cost
--       line_cost      — effective_qty × unit_cost
--       is_subassembly — true if the component itself has an Active/Approved BOM
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.explode_bom(
  _bom_id    uuid,
  _qty       numeric DEFAULT 1,
  _max_depth integer DEFAULT 10
)
RETURNS TABLE (
  level          integer,
  path           text,
  bom_id         uuid,
  line_no        integer,
  item_id        uuid,
  item_name      text,
  sku            text,
  uom            text,
  qty_per        numeric,
  total_qty      numeric,
  effective_qty  numeric,
  scrap_pct      numeric,
  unit_cost      numeric,
  line_cost      numeric,
  is_subassembly boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH RECURSIVE explosion AS (
    -- Seed: direct components of the requested BOM
    SELECT
      1                       AS level,
      bh.id::text             AS path,
      bh.id                   AS bom_id,
      bl.line_no,
      bl.item_id,
      i.name                  AS item_name,
      i.sku,
      COALESCE(bl.uom, i.uom) AS uom,
      -- qty_per = component qty per yield, scaled for production quantity
      (bl.quantity / COALESCE(NULLIF(bh.yield_qty, 0), 1))::numeric AS qty_per,
      (bl.quantity / COALESCE(NULLIF(bh.yield_qty, 0), 1) * _qty)::numeric AS total_qty,
      (bl.quantity / COALESCE(NULLIF(bh.yield_qty, 0), 1) * _qty
        * (1 + COALESCE(bl.scrap_pct, 0) / 100))::numeric AS effective_qty,
      COALESCE(bl.scrap_pct, 0)::numeric AS scrap_pct,
      COALESCE(NULLIF(bl.unit_cost, 0), i.cost, 0)::numeric AS unit_cost
    FROM bom_headers bh
    JOIN bom_lines   bl ON bl.bom_id = bh.id AND bl.deleted_at IS NULL
    JOIN items       i  ON i.id = bl.item_id  AND i.deleted_at IS NULL
    WHERE bh.id        = _bom_id
      AND bh.deleted_at IS NULL

    UNION ALL

    -- Recurse into sub-assemblies
    SELECT
      exp.level + 1,
      exp.path || ' → ' || sub_bh.id::text,
      sub_bh.id,
      sub_bl.line_no,
      sub_bl.item_id,
      sub_i.name,
      sub_i.sku,
      COALESCE(sub_bl.uom, sub_i.uom),
      (sub_bl.quantity / COALESCE(NULLIF(sub_bh.yield_qty, 0), 1))::numeric,
      -- total_qty at child level = parent effective_qty × (child qty / child yield)
      (exp.effective_qty
        * sub_bl.quantity / COALESCE(NULLIF(sub_bh.yield_qty, 0), 1))::numeric,
      (exp.effective_qty
        * sub_bl.quantity / COALESCE(NULLIF(sub_bh.yield_qty, 0), 1)
        * (1 + COALESCE(sub_bl.scrap_pct, 0) / 100))::numeric,
      COALESCE(sub_bl.scrap_pct, 0)::numeric,
      COALESCE(NULLIF(sub_bl.unit_cost, 0), sub_i.cost, 0)::numeric
    FROM explosion            exp
    JOIN bom_headers sub_bh ON sub_bh.product_id = exp.item_id
                           AND sub_bh.deleted_at IS NULL
                           AND sub_bh.approval_status IN ('Active', 'Approved')
                           -- guard against infinite loops at the DB level
                           AND exp.level < _max_depth
                           AND position(sub_bh.id::text IN exp.path) = 0
    JOIN bom_lines   sub_bl ON sub_bl.bom_id = sub_bh.id AND sub_bl.deleted_at IS NULL
    JOIN items       sub_i  ON sub_i.id = sub_bl.item_id  AND sub_i.deleted_at IS NULL
  )
  SELECT
    exp.level,
    exp.path,
    exp.bom_id,
    exp.line_no,
    exp.item_id,
    exp.item_name,
    exp.sku,
    exp.uom,
    ROUND(exp.qty_per,       6) AS qty_per,
    ROUND(exp.total_qty,     6) AS total_qty,
    ROUND(exp.effective_qty, 6) AS effective_qty,
    exp.scrap_pct,
    ROUND(exp.unit_cost,     4) AS unit_cost,
    ROUND(exp.effective_qty * exp.unit_cost, 4) AS line_cost,
    EXISTS (
      SELECT 1 FROM bom_headers sub
      WHERE sub.product_id    = exp.item_id
        AND sub.deleted_at    IS NULL
        AND sub.approval_status IN ('Active', 'Approved')
    ) AS is_subassembly
  FROM explosion exp
  ORDER BY exp.path, exp.line_no;
$$;

GRANT EXECUTE ON FUNCTION public.explode_bom(uuid, numeric, integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7.  approve_bom / activate_bom — status transition helpers
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_bom(_bom_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_issues jsonb;
BEGIN
  IF NOT has_permission('manufacturing.update') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  v_issues := public.validate_bom(_bom_id);

  -- Block approval if there are any errors (warnings are OK)
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_issues) e
    WHERE (e->>'level') = 'error'
  ) THEN
    RAISE EXCEPTION 'BOM has validation errors and cannot be approved: %', v_issues;
  END IF;

  UPDATE public.bom_headers
  SET    approval_status = 'Approved',
         approved_by     = auth.uid(),
         approved_at     = now(),
         updated_at      = now()
  WHERE  id         = _bom_id
    AND  tenant_id  = v_tenant
    AND  deleted_at IS NULL;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  SELECT tenant_id, 'bom', id, 'Approved', 'BOM approved', auth.uid(),
         (SELECT email FROM profiles WHERE id = auth.uid())
  FROM   public.bom_headers WHERE id = _bom_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_bom(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.activate_bom(_bom_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant  uuid := current_tenant_id();
  v_bom     bom_headers;
BEGIN
  SELECT * INTO v_bom FROM bom_headers
  WHERE id = _bom_id AND tenant_id = v_tenant AND deleted_at IS NULL;

  IF v_bom.id IS NULL THEN RAISE EXCEPTION 'BOM not found'; END IF;

  IF v_bom.approval_status NOT IN ('Approved') THEN
    RAISE EXCEPTION 'BOM must be Approved before activation (current: %)', v_bom.approval_status;
  END IF;

  -- Deactivate any other Active BOM for the same product
  UPDATE public.bom_headers
  SET    approval_status = 'Inactive', updated_at = now()
  WHERE  product_id     = v_bom.product_id
    AND  approval_status = 'Active'
    AND  tenant_id       = v_tenant
    AND  id             <> _bom_id
    AND  deleted_at      IS NULL;

  UPDATE public.bom_headers
  SET    approval_status = 'Active', updated_at = now()
  WHERE  id = _bom_id;

  INSERT INTO public.document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  SELECT tenant_id, 'bom', id, 'Active', 'BOM activated', auth.uid(),
         (SELECT email FROM profiles WHERE id = auth.uid())
  FROM   public.bom_headers WHERE id = _bom_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_bom(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8.  Update post_production_order_unchecked to:
--     a) use explode_bom for multi-level component consumption
--     b) set used_in_production = true on the BOM after posting
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_production_order_unchecked(_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  mo                   production_orders;
  bm                   bom_headers;
  wh                   uuid;
  comp                 record;
  total_component_cost numeric(14,2) := 0;
  wip_acct             uuid;
  inv_acct             uuid;
  j_id                 uuid;
BEGIN
  SELECT * INTO mo FROM production_orders WHERE id = _order_id AND deleted_at IS NULL;
  IF mo.id IS NULL THEN RAISE EXCEPTION 'Production order not found'; END IF;
  IF mo.tenant_id <> current_tenant_id() AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF mo.posted_at IS NOT NULL THEN RAISE EXCEPTION 'Production order already posted'; END IF;

  SELECT * INTO bm FROM bom_headers WHERE id = mo.bom_id AND deleted_at IS NULL;
  IF bm.id IS NULL THEN RAISE EXCEPTION 'BOM not found'; END IF;

  wh := mo.warehouse_id;
  IF wh IS NULL THEN
    SELECT id INTO wh FROM warehouses
    WHERE tenant_id = mo.tenant_id AND deleted_at IS NULL
    ORDER BY created_at LIMIT 1;
  END IF;

  wip_acct := _account_id(mo.tenant_id, '1300');
  inv_acct := _account_id(mo.tenant_id, '1200');

  -- ── Consume components via full multi-level explosion ──────────────────────
  -- We only consume LEAF components (is_subassembly = false) because
  -- sub-assemblies are intermediate products, not raw materials.
  FOR comp IN
    SELECT eb.item_id, eb.effective_qty, eb.unit_cost, eb.item_name
    FROM   public.explode_bom(mo.bom_id, mo.quantity) eb
    WHERE  eb.is_subassembly = false
  LOOP
    total_component_cost :=
      total_component_cost + (comp.effective_qty * comp.unit_cost);

    INSERT INTO stock_movements (
      tenant_id, item_id, warehouse_id, quantity, unit_cost,
      ref_type, ref_id, note, created_by
    ) VALUES (
      mo.tenant_id, comp.item_id, wh,
      -comp.effective_qty, comp.unit_cost,
      'production_consume', mo.id,
      'Consume for ' || COALESCE(mo.number, ''), auth.uid()
    );
  END LOOP;

  -- ── Receive finished good ──────────────────────────────────────────────────
  INSERT INTO stock_movements (
    tenant_id, item_id, warehouse_id, quantity, unit_cost,
    ref_type, ref_id, note, created_by
  ) VALUES (
    mo.tenant_id, bm.product_id, wh, mo.quantity,
    CASE WHEN mo.quantity > 0 THEN total_component_cost / mo.quantity ELSE 0 END,
    'production_receive', mo.id,
    'Produce ' || COALESCE(mo.number, ''), auth.uid()
  );

  -- ── Update finished item average cost ──────────────────────────────────────
  IF mo.quantity > 0 THEN
    UPDATE items
    SET cost = total_component_cost / mo.quantity
    WHERE id = bm.product_id;
  END IF;

  -- ── WIP journal entries ────────────────────────────────────────────────────
  IF total_component_cost > 0 AND wip_acct IS NOT NULL AND inv_acct IS NOT NULL THEN
    -- Entry 1: consume components → WIP
    INSERT INTO journal_entries (
      tenant_id, entry_date, memo, source_ref_type, source_ref_id,
      total_debit, total_credit, created_by
    ) VALUES (
      mo.tenant_id, CURRENT_DATE,
      'Consume components – ' || COALESCE(mo.number, ''),
      'production_order', mo.id,
      total_component_cost, total_component_cost, auth.uid()
    ) RETURNING id INTO j_id;

    INSERT INTO journal_lines (tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES
      (mo.tenant_id, j_id, wip_acct, total_component_cost, 0, 'WIP'),
      (mo.tenant_id, j_id, inv_acct, 0, total_component_cost, 'Inventory – components consumed');

    -- Entry 2: receive finished goods ← WIP
    INSERT INTO journal_entries (
      tenant_id, entry_date, memo, source_ref_type, source_ref_id,
      total_debit, total_credit, created_by
    ) VALUES (
      mo.tenant_id, CURRENT_DATE,
      'Receive finished goods – ' || COALESCE(mo.number, ''),
      'production_order', mo.id,
      total_component_cost, total_component_cost, auth.uid()
    ) RETURNING id INTO j_id;

    INSERT INTO journal_lines (tenant_id, journal_id, account_id, debit, credit, memo)
    VALUES
      (mo.tenant_id, j_id, inv_acct, total_component_cost, 0, 'Inventory – finished goods'),
      (mo.tenant_id, j_id, wip_acct, 0, total_component_cost, 'WIP cleared');
  END IF;

  -- ── Mark production order complete ────────────────────────────────────────
  UPDATE production_orders
  SET status = 'Completed', posted_at = now()
  WHERE id = _order_id;

  -- ── Mark BOM as used_in_production (locks structural changes) ────────────
  UPDATE bom_headers
  SET used_in_production = true, updated_at = now()
  WHERE id = mo.bom_id AND used_in_production = false;

  INSERT INTO document_events (tenant_id, entity_type, entity_id, status, note, actor_id, actor_email)
  VALUES (
    mo.tenant_id, 'production_order', mo.id, 'Completed',
    'Production completed; multi-level components consumed and finished goods received',
    auth.uid(),
    (SELECT email FROM profiles WHERE id = auth.uid())
  );

  RETURN _order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_production_order_unchecked(uuid)
  FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9.  RLS — bom_headers (ensure policy exists; table predates tracked migrations)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.bom_headers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bom_headers_tenant_read"  ON public.bom_headers;
DROP POLICY IF EXISTS "bom_headers_tenant_write" ON public.bom_headers;

CREATE POLICY "bom_headers_tenant_read" ON public.bom_headers
  FOR SELECT TO authenticated
  USING (tenant_id = current_tenant_id() OR is_super_admin());

CREATE POLICY "bom_headers_tenant_write" ON public.bom_headers
  FOR ALL TO authenticated
  USING  (tenant_id = current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 10.  Indexes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS bom_headers_approval_status_idx
  ON public.bom_headers (tenant_id, approval_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS bom_lines_item_id_idx
  ON public.bom_lines (item_id)
  WHERE deleted_at IS NULL;
