-- ==============================================================================
-- Approval Workflows Hardening & Management Suite
-- File: supabase/migrations/20260909100000_approval_workflows_hardening.sql
-- ==============================================================================

-- 1. Complete RLS Policies on approval_workflows
DROP POLICY IF EXISTS approval_workflows_insert ON public.approval_workflows;
CREATE POLICY approval_workflows_insert ON public.approval_workflows
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (
      public.has_permission('approvals.manage')
      OR public.has_role(auth.uid(), 'tenant_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

DROP POLICY IF EXISTS approval_workflows_update ON public.approval_workflows;
CREATE POLICY approval_workflows_update ON public.approval_workflows
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND (
      public.has_permission('approvals.manage')
      OR public.has_role(auth.uid(), 'tenant_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
  );

DROP POLICY IF EXISTS approval_workflows_delete ON public.approval_workflows;
CREATE POLICY approval_workflows_delete ON public.approval_workflows
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND (
      public.has_permission('approvals.manage')
      OR public.has_role(auth.uid(), 'tenant_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

-- 2. Complete RLS Policies on approval_workflow_steps
DROP POLICY IF EXISTS approval_workflow_steps_insert ON public.approval_workflow_steps;
CREATE POLICY approval_workflow_steps_insert ON public.approval_workflow_steps
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.approval_workflows w
      WHERE w.id = workflow_id
        AND w.tenant_id = public.current_tenant_id()
        AND (
          public.has_permission('approvals.manage')
          OR public.has_role(auth.uid(), 'tenant_admin'::public.app_role)
          OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
        )
    )
  );

DROP POLICY IF EXISTS approval_workflow_steps_update ON public.approval_workflow_steps;
CREATE POLICY approval_workflow_steps_update ON public.approval_workflow_steps
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.approval_workflows w
      WHERE w.id = workflow_id
        AND w.tenant_id = public.current_tenant_id()
        AND (
          public.has_permission('approvals.manage')
          OR public.has_role(auth.uid(), 'tenant_admin'::public.app_role)
          OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
        )
    )
  );

DROP POLICY IF EXISTS approval_workflow_steps_delete ON public.approval_workflow_steps;
CREATE POLICY approval_workflow_steps_delete ON public.approval_workflow_steps
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.approval_workflows w
      WHERE w.id = workflow_id
        AND w.tenant_id = public.current_tenant_id()
        AND (
          public.has_permission('approvals.manage')
          OR public.has_role(auth.uid(), 'tenant_admin'::public.app_role)
          OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
        )
    )
  );

-- 3. Cancel Policy on approval_requests
DROP POLICY IF EXISTS approval_requests_update ON public.approval_requests;
CREATE POLICY approval_requests_update ON public.approval_requests
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND (
      requested_by = auth.uid()
      OR public.has_permission('approvals.manage')
      OR public.has_role(auth.uid(), 'tenant_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

GRANT INSERT, UPDATE, DELETE ON public.approval_workflows TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.approval_workflow_steps TO authenticated;
GRANT UPDATE ON public.approval_requests TO authenticated;

-- 4. RPC: update_approval_workflow
CREATE OR REPLACE FUNCTION public.update_approval_workflow(
  _workflow_id uuid,
  _name text,
  _description text DEFAULT NULL,
  _is_active boolean DEFAULT true,
  _conditions jsonb DEFAULT '{}'::jsonb
) RETURNS public.approval_workflows
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_workflow public.approval_workflows%ROWTYPE;
BEGIN
  IF NOT (
    public.has_permission('approvals.manage')
    OR public.has_role(auth.uid(), 'tenant_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized: approvals.manage' USING ERRCODE = '42501';
  END IF;

  UPDATE public.approval_workflows
  SET
    name = trim(_name),
    description = _description,
    is_active = _is_active,
    conditions = COALESCE(_conditions, '{}'::jsonb),
    updated_at = now()
  WHERE id = _workflow_id AND tenant_id = public.current_tenant_id()
  RETURNING * INTO v_workflow;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow not found or unauthorized' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_workflow;
END;
$$;

-- 5. RPC: delete_approval_workflow
CREATE OR REPLACE FUNCTION public.delete_approval_workflow(
  _workflow_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_permission('approvals.manage')
    OR public.has_role(auth.uid(), 'tenant_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized: approvals.manage' USING ERRCODE = '42501';
  END IF;

  -- Verify no active pending approval requests exist for this workflow
  IF EXISTS (
    SELECT 1 FROM public.approval_requests
    WHERE workflow_id = _workflow_id
      AND tenant_id = public.current_tenant_id()
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Cannot delete workflow with pending approval requests. Cancel or resolve pending requests first.' USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.approval_workflows
  WHERE id = _workflow_id AND tenant_id = public.current_tenant_id();

  RETURN true;
END;
$$;

-- 6. RPC: update_approval_workflow_step
CREATE OR REPLACE FUNCTION public.update_approval_workflow_step(
  _step_id uuid,
  _name text,
  _approver_type text,
  _approver_role text DEFAULT NULL,
  _approver_user_id uuid DEFAULT NULL,
  _minimum_approvals integer DEFAULT 1
) RETURNS public.approval_workflow_steps
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_step public.approval_workflow_steps%ROWTYPE;
BEGIN
  IF NOT (
    public.has_permission('approvals.manage')
    OR public.has_role(auth.uid(), 'tenant_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized: approvals.manage' USING ERRCODE = '42501';
  END IF;

  -- Ensure step belongs to current tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.approval_workflow_steps s
    JOIN public.approval_workflows w ON w.id = s.workflow_id
    WHERE s.id = _step_id AND w.tenant_id = public.current_tenant_id()
  ) THEN
    RAISE EXCEPTION 'Step not found or unauthorized' USING ERRCODE = 'P0002';
  END IF;

  IF _approver_type NOT IN ('role', 'user') THEN
    RAISE EXCEPTION 'Approver type must be role or user';
  END IF;

  UPDATE public.approval_workflow_steps
  SET
    name = trim(_name),
    approver_type = _approver_type,
    approver_role = CASE WHEN _approver_type = 'role' THEN _approver_role ELSE NULL END,
    approver_user_id = CASE WHEN _approver_type = 'user' THEN _approver_user_id ELSE NULL END,
    minimum_approvals = GREATEST(1, COALESCE(_minimum_approvals, 1))
  WHERE id = _step_id
  RETURNING * INTO v_step;

  RETURN v_step;
END;
$$;

-- 7. RPC: delete_approval_workflow_step
CREATE OR REPLACE FUNCTION public.delete_approval_workflow_step(
  _step_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_workflow_id uuid;
BEGIN
  IF NOT (
    public.has_permission('approvals.manage')
    OR public.has_role(auth.uid(), 'tenant_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized: approvals.manage' USING ERRCODE = '42501';
  END IF;

  SELECT workflow_id INTO v_workflow_id
  FROM public.approval_workflow_steps s
  JOIN public.approval_workflows w ON w.id = s.workflow_id
  WHERE s.id = _step_id AND w.tenant_id = public.current_tenant_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found or unauthorized' USING ERRCODE = 'P0002';
  END IF;

  -- Ensure at least 1 step remains
  IF (SELECT COUNT(*) FROM public.approval_workflow_steps WHERE workflow_id = v_workflow_id) <= 1 THEN
    RAISE EXCEPTION 'A workflow must have at least one approval step';
  END IF;

  DELETE FROM public.approval_workflow_steps WHERE id = _step_id;

  -- Re-sequence remaining steps
  WITH reordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY step_order) as new_order
    FROM public.approval_workflow_steps
    WHERE workflow_id = v_workflow_id
  )
  UPDATE public.approval_workflow_steps s
  SET step_order = r.new_order
  FROM reordered r
  WHERE s.id = r.id;

  RETURN true;
END;
$$;

-- 8. RPC: cancel_approval_request
CREATE OR REPLACE FUNCTION public.cancel_approval_request(
  _request_id uuid,
  _reason text DEFAULT NULL
) RETURNS public.approval_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_request public.approval_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request
  FROM public.approval_requests
  WHERE id = _request_id AND tenant_id = public.current_tenant_id()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request not found';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending approval requests can be cancelled (current status: %)', v_request.status;
  END IF;

  -- Requester or admin can cancel
  IF NOT (
    v_request.requested_by = auth.uid()
    OR public.has_permission('approvals.manage')
    OR public.has_role(auth.uid(), 'tenant_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized to cancel this approval request' USING ERRCODE = '42501';
  END IF;

  UPDATE public.approval_requests
  SET
    status = 'cancelled',
    completed_at = now(),
    updated_at = now()
  WHERE id = _request_id
  RETURNING * INTO v_request;

  -- Optional action audit record
  INSERT INTO public.approval_actions (
    tenant_id, request_id, workflow_step_id, action, acted_by, note
  )
  SELECT
    v_request.tenant_id,
    v_request.id,
    s.id,
    'cancel',
    auth.uid(),
    COALESCE(_reason, 'Cancelled by user')
  FROM public.approval_workflow_steps s
  WHERE s.workflow_id = v_request.workflow_id AND s.step_order = v_request.current_step
  LIMIT 1;

  RETURN v_request;
END;
$$;

-- 9. RPC: get_approval_request_audit
CREATE OR REPLACE FUNCTION public.get_approval_request_audit(_request_id uuid)
RETURNS TABLE (
  request_id          uuid,
  entity_type         text,
  entity_id           uuid,
  status              text,
  amount              numeric,
  current_step        integer,
  submitted_at        timestamptz,
  completed_at        timestamptz,
  requested_by_id     uuid,
  requested_by_name   text,
  requested_by_email  text,
  workflow_id         uuid,
  workflow_code       text,
  workflow_name       text,
  workflow_steps      jsonb,
  actions_history     jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_req public.approval_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req
  FROM public.approval_requests
  WHERE id = _request_id AND tenant_id = public.current_tenant_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request not found';
  END IF;

  RETURN QUERY
  SELECT
    v_req.id,
    v_req.entity_type,
    v_req.entity_id,
    v_req.status,
    v_req.amount,
    v_req.current_step,
    v_req.submitted_at,
    v_req.completed_at,
    v_req.requested_by,
    COALESCE(p.full_name, p.email, 'Unknown Requester') AS requested_by_name,
    p.email AS requested_by_email,
    w.id AS workflow_id,
    w.code AS workflow_code,
    w.name AS workflow_name,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'step_order', s.step_order,
          'name', s.name,
          'approver_type', s.approver_type,
          'approver_role', s.approver_role,
          'approver_user_id', s.approver_user_id,
          'approver_user_name', ap.full_name,
          'minimum_approvals', s.minimum_approvals
        ) ORDER BY s.step_order
      )
      FROM public.approval_workflow_steps s
      LEFT JOIN public.profiles ap ON ap.id = s.approver_user_id
      WHERE s.workflow_id = w.id
    ), '[]'::jsonb) AS workflow_steps,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'action', a.action,
          'note', a.note,
          'acted_at', a.acted_at,
          'acted_by_id', a.acted_by,
          'acted_by_name', COALESCE(act_p.full_name, act_p.email, 'Unknown'),
          'step_name', s.name,
          'step_order', s.step_order
        ) ORDER BY a.acted_at ASC
      )
      FROM public.approval_actions a
      JOIN public.approval_workflow_steps s ON s.id = a.workflow_step_id
      LEFT JOIN public.profiles act_p ON act_p.id = a.acted_by
      WHERE a.request_id = v_req.id
    ), '[]'::jsonb) AS actions_history
  FROM public.approval_workflows w
  LEFT JOIN public.profiles p ON p.id = v_req.requested_by
  WHERE w.id = v_req.workflow_id;
END;
$$;

-- 10. Seed Starter Workflows for All Core Documents
INSERT INTO public.approval_workflows (tenant_id, code, name, entity_type, description, conditions)
SELECT t.id, x.code, x.name, x.entity_type, x.description, x.conditions
FROM public.tenants t
CROSS JOIN (VALUES
  ('purchase_requisition_approval', 'Requisition Department Approval', 'purchase_requisition', 'Line manager sign-off on department purchase requisitions', '{"require_approval":true}'::jsonb),
  ('bom_engineering_approval', 'BOM Engineering Sign-off', 'bom', 'Quality & engineering approval for Bills of Materials prior to activation', '{"require_approval":true}'::jsonb),
  ('production_order_release', 'Production Order Release', 'production_order', 'Plant manager approval for manufacturing production orders', '{"require_approval":true}'::jsonb)
) AS x(code, name, entity_type, description, conditions)
WHERE t.deleted_at IS NULL
ON CONFLICT (tenant_id, code) DO NOTHING;

-- Seed Steps for the New Workflows
INSERT INTO public.approval_workflow_steps (workflow_id, step_order, name, approver_type, approver_role)
SELECT w.id, 1,
  CASE w.entity_type
    WHEN 'purchase_requisition' THEN 'Department Manager'
    WHEN 'bom' THEN 'Lead Production Engineer'
    WHEN 'production_order' THEN 'Plant Operations'
    ELSE 'Manager Sign-off'
  END,
  'role',
  CASE w.entity_type
    WHEN 'purchase_requisition' THEN 'purchasing'
    WHEN 'bom' THEN 'manufacturing'
    WHEN 'production_order' THEN 'manufacturing'
    ELSE 'tenant_admin'
  END
FROM public.approval_workflows w
WHERE w.code IN ('purchase_requisition_approval', 'bom_engineering_approval', 'production_order_release')
  AND NOT EXISTS (SELECT 1 FROM public.approval_workflow_steps s WHERE s.workflow_id = w.id);

-- Grants
GRANT EXECUTE ON FUNCTION public.update_approval_workflow(uuid, text, text, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_approval_workflow(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_approval_workflow_step(uuid, text, text, text, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_approval_workflow_step(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_approval_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_approval_request_audit(uuid) TO authenticated;
