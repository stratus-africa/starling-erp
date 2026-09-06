-- ==============================================================================
-- Stock Requisition ? Stock Issue (Inventory Adjustment) Automation
-- Migration: 20260910100000_stock_requisition_issue.sql
-- ==============================================================================
--
-- When a stock requisition is Approved, this RPC:
--   1. Validates the requisition is of type 'stock', status 'Submitted', and has a from_warehouse_id
--   2. Creates one Draft inventory_adjustment (type = issue) per requisition line
--   3. Marks the requisition as Approved
--   4. Returns the list of created adjustment IDs
-- The Stock Issue is created as Draft — users must manually Post it to reduce stock.

-- Add converted_adjustment_ids to track generated adjustments
ALTER TABLE public.purchase_requisitions
  ADD COLUMN IF NOT EXISTS converted_adjustment_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.purchase_requisitions.converted_adjustment_ids IS
  'UUIDs of inventory_adjustments created when this stock requisition was approved.';

-- -- Sequence for naming adjustments ------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.inventory_adjustment_number_seq START 1;

-- -- RPC: approve_stock_requisition -------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_stock_requisition(_req_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req         public.purchase_requisitions;
  v_line        RECORD;
  v_adj_id      uuid;
  v_adj_ids     uuid[] := '{}';
  v_number      text;
  v_seq         bigint;
BEGIN
  -- 1. Load and validate the requisition
  SELECT * INTO v_req FROM public.purchase_requisitions
  WHERE id = _req_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: requisition % does not exist', _req_id;
  END IF;

  -- RLS: must belong to caller's tenant
  IF v_req.tenant_id != (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) THEN
    RAISE EXCEPTION 'permission_denied: requisition does not belong to your tenant';
  END IF;

  IF v_req.requisition_type != 'stock' THEN
    RAISE EXCEPTION 'invalid_type: only stock requisitions can be approved with this function';
  END IF;

  IF v_req.status NOT IN ('Submitted', 'Pending') THEN
    RAISE EXCEPTION 'invalid_status: requisition must be Submitted (current: %)', v_req.status;
  END IF;

  IF v_req.from_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'missing_warehouse: stock requisition must have a source warehouse set';
  END IF;

  -- 2. For each requisition line, create a Draft inventory_adjustment (issue = negative qty)
  FOR v_line IN
    SELECT * FROM public.purchase_requisition_lines
    WHERE document_id = _req_id AND deleted_at IS NULL
    ORDER BY line_no
  LOOP
    v_seq    := nextval('public.inventory_adjustment_number_seq');
    v_number := 'ISS-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(v_seq::text, 5, '0');

    INSERT INTO public.inventory_adjustments (
      tenant_id, number, date, item_id, quantity, uom,
      warehouse_id, reason, status, created_by
    )
    VALUES (
      v_req.tenant_id,
      v_number,
      CURRENT_DATE,
      v_line.item_id,
      -ABS(v_line.quantity),   -- negative = issue/reduction
      NULL,                    -- uom can be set by user when posting
      v_req.from_warehouse_id,
      'Stock Issue from Requisition ' || COALESCE(v_req.number, _req_id::text),
      'Draft',
      auth.uid()
    )
    RETURNING id INTO v_adj_id;

    v_adj_ids := array_append(v_adj_ids, v_adj_id);
  END LOOP;

  -- 3. Update requisition status and store adjustment IDs
  UPDATE public.purchase_requisitions
  SET status = 'Approved',
      converted_adjustment_ids = v_adj_ids
  WHERE id = _req_id;

  RETURN v_adj_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_stock_requisition(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_stock_requisition(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_stock_requisition(uuid) TO service_role;

COMMENT ON FUNCTION public.approve_stock_requisition(uuid) IS
  'Approves a stock requisition and creates one Draft inventory_adjustment (issue) per line. Returns the array of created adjustment IDs.';
