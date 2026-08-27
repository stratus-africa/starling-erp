-- =========================================================
-- First-class approval workflow engine
-- =========================================================

CREATE TABLE IF NOT EXISTS public.approval_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  entity_type text NOT NULL,
  description text,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.approval_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.approval_workflows(id) ON DELETE CASCADE,
  step_order integer NOT NULL CHECK (step_order > 0),
  name text NOT NULL,
  approver_type text NOT NULL CHECK (approver_type IN ('role','user')),
  approver_role text,
  approver_user_id uuid REFERENCES auth.users(id),
  minimum_approvals integer NOT NULL DEFAULT 1 CHECK (minimum_approvals > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, step_order),
  CONSTRAINT approval_step_target CHECK (
    (approver_type = 'role' AND approver_role IS NOT NULL AND approver_user_id IS NULL)
    OR
    (approver_type = 'user' AND approver_user_id IS NOT NULL AND approver_role IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES public.approval_workflows(id),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  current_step integer NOT NULL DEFAULT 1 CHECK (current_step > 0),
  amount numeric,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.approval_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  workflow_step_id uuid NOT NULL REFERENCES public.approval_workflow_steps(id),
  action text NOT NULL CHECK (action IN ('approve','reject','cancel')),
  acted_by uuid NOT NULL REFERENCES auth.users(id),
  note text,
  acted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, workflow_step_id, acted_by)
);

CREATE INDEX IF NOT EXISTS approval_workflows_entity_idx ON public.approval_workflows(tenant_id, entity_type, is_active);
CREATE INDEX IF NOT EXISTS approval_steps_workflow_idx ON public.approval_workflow_steps(workflow_id, step_order);
CREATE INDEX IF NOT EXISTS approval_requests_inbox_idx ON public.approval_requests(tenant_id, status, current_step, created_at DESC);
CREATE INDEX IF NOT EXISTS approval_requests_entity_idx ON public.approval_requests(tenant_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS approval_actions_request_idx ON public.approval_actions(request_id, acted_at);

ALTER TABLE public.approval_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS approval_workflows_read ON public.approval_workflows;
CREATE POLICY approval_workflows_read ON public.approval_workflows FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
DROP POLICY IF EXISTS approval_workflow_steps_read ON public.approval_workflow_steps;
CREATE POLICY approval_workflow_steps_read ON public.approval_workflow_steps FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.approval_workflows w WHERE w.id = workflow_id AND w.tenant_id = public.current_tenant_id()));
DROP POLICY IF EXISTS approval_requests_read ON public.approval_requests;
CREATE POLICY approval_requests_read ON public.approval_requests FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
DROP POLICY IF EXISTS approval_actions_read ON public.approval_actions;
CREATE POLICY approval_actions_read ON public.approval_actions FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

GRANT SELECT ON public.approval_workflows, public.approval_workflow_steps, public.approval_requests, public.approval_actions TO authenticated;
GRANT ALL ON public.approval_workflows, public.approval_workflow_steps, public.approval_requests, public.approval_actions TO service_role;

INSERT INTO public.permissions (code, module, action, description) VALUES
  ('approvals.read','approvals','read','View approval requests and workflow history'),
  ('approvals.request','approvals','request','Submit documents for approval'),
  ('approvals.approve','approvals','approve','Approve assigned workflow steps'),
  ('approvals.reject','approvals','reject','Reject assigned workflow steps'),
  ('approvals.manage','approvals','manage','Create and manage approval workflows')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.role_permissions (role, permission_code)
SELECT r.role, p.code
FROM (VALUES ('sales'),('purchasing'),('inventory'),('accounting'),('manufacturing'),('cashier')) r(role)
JOIN public.permissions p ON p.code IN ('approvals.read','approvals.request')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_code)
SELECT 'accounting', p.code FROM public.permissions p
WHERE p.code IN ('approvals.approve','approvals.reject')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_code)
SELECT 'purchasing', p.code FROM public.permissions p
WHERE p.code IN ('approvals.approve','approvals.reject')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_code)
SELECT 'sales', p.code FROM public.permissions p
WHERE p.code IN ('approvals.approve','approvals.reject')
ON CONFLICT DO NOTHING;

-- Generic threshold evaluator. conditions supports:
-- {"min_amount":10000}, {"max_amount":50000}, {"require_approval":true}
CREATE OR REPLACE FUNCTION public.approval_condition_matches(
  _conditions jsonb,
  _amount numeric
) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_min numeric;
  v_max numeric;
BEGIN
  IF COALESCE((_conditions->>'require_approval')::boolean, true) = false THEN
    RETURN false;
  END IF;
  v_min := NULLIF(_conditions->>'min_amount','')::numeric;
  v_max := NULLIF(_conditions->>'max_amount','')::numeric;
  IF v_min IS NOT NULL AND COALESCE(_amount,0) < v_min THEN RETURN false; END IF;
  IF v_max IS NOT NULL AND COALESCE(_amount,0) > v_max THEN RETURN false; END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_approval_request(
  _entity_type text,
  _entity_id uuid,
  _amount numeric DEFAULT NULL,
  _payload jsonb DEFAULT '{}'::jsonb,
  _idempotency_key text DEFAULT NULL,
  _workflow_code text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant uuid := public.current_tenant_id();
  v_workflow public.approval_workflows%ROWTYPE;
  v_request uuid;
  v_first_step integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_permission('approvals.request') THEN RAISE EXCEPTION 'Not authorized: approvals.request'; END IF;
  IF _entity_id IS NULL OR NULLIF(trim(_entity_type),'') IS NULL THEN RAISE EXCEPTION 'Approval entity is required'; END IF;

  SELECT * INTO v_workflow
  FROM public.approval_workflows
  WHERE tenant_id = v_tenant
    AND entity_type = _entity_type
    AND is_active
    AND (_workflow_code IS NULL OR code = _workflow_code)
    AND public.approval_condition_matches(conditions, _amount)
  ORDER BY CASE WHEN _workflow_code IS NOT NULL THEN 0 ELSE 1 END, created_at
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active approval workflow applies to %.%', _entity_type, _entity_id;
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO v_request
    FROM public.approval_requests
    WHERE tenant_id = v_tenant AND idempotency_key = _idempotency_key;
    IF v_request IS NOT NULL THEN RETURN v_request; END IF;
  END IF;

  SELECT step_order INTO v_first_step
  FROM public.approval_workflow_steps
  WHERE workflow_id = v_workflow.id
  ORDER BY step_order LIMIT 1;
  IF v_first_step IS NULL THEN RAISE EXCEPTION 'Workflow has no approval steps'; END IF;

  INSERT INTO public.approval_requests(
    tenant_id, workflow_id, entity_type, entity_id, requested_by,
    amount, payload, idempotency_key, current_step
  ) VALUES (
    v_tenant, v_workflow.id, _entity_type, _entity_id, auth.uid(),
    _amount, COALESCE(_payload,'{}'::jsonb), _idempotency_key, v_first_step
  ) RETURNING id INTO v_request;

  RETURN v_request;
EXCEPTION WHEN unique_violation THEN
  SELECT id INTO v_request FROM public.approval_requests
  WHERE tenant_id = v_tenant AND idempotency_key = _idempotency_key;
  IF v_request IS NOT NULL THEN RETURN v_request; END IF;
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.approval_actor_can_act(
  _request public.approval_requests,
  _step public.approval_workflow_steps
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN _step.approver_type = 'user' THEN _step.approver_user_id = auth.uid()
    WHEN _step.approver_type = 'role' THEN EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.tenant_id = _request.tenant_id
        AND ur.role::text = _step.approver_role
    )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.act_on_approval_request(
  _request_id uuid,
  _action text,
  _note text DEFAULT NULL
) RETURNS public.approval_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_request public.approval_requests%ROWTYPE;
  v_step public.approval_workflow_steps%ROWTYPE;
  v_next integer;
  v_approved_count integer;
BEGIN
  IF _action NOT IN ('approve','reject') THEN RAISE EXCEPTION 'Invalid approval action'; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_request FROM public.approval_requests
  WHERE id = _request_id AND tenant_id = public.current_tenant_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Approval request not found'; END IF;
  IF v_request.status <> 'pending' THEN RAISE EXCEPTION 'Approval request is already %', v_request.status; END IF;

  SELECT * INTO v_step FROM public.approval_workflow_steps
  WHERE workflow_id = v_request.workflow_id AND step_order = v_request.current_step FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Current approval step not found'; END IF;

  IF _action = 'approve' AND NOT public.has_permission('approvals.approve') THEN RAISE EXCEPTION 'Not authorized: approvals.approve'; END IF;
  IF _action = 'reject' AND NOT public.has_permission('approvals.reject') THEN RAISE EXCEPTION 'Not authorized: approvals.reject'; END IF;
  IF NOT public.approval_actor_can_act(v_request, v_step) THEN RAISE EXCEPTION 'You are not an approver for this step'; END IF;

  INSERT INTO public.approval_actions(tenant_id, request_id, workflow_step_id, action, acted_by, note)
  VALUES (v_request.tenant_id, v_request.id, v_step.id, _action, auth.uid(), _note)
  ON CONFLICT (request_id, workflow_step_id, acted_by) DO NOTHING;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You have already acted on this approval step';
  END IF;

  IF _action = 'reject' THEN
    UPDATE public.approval_requests
    SET status = 'rejected', completed_at = now(), updated_at = now()
    WHERE id = v_request.id;
  ELSE
    SELECT count(*) INTO v_approved_count
    FROM public.approval_actions
    WHERE request_id = v_request.id AND workflow_step_id = v_step.id AND action = 'approve';

    IF v_approved_count >= v_step.minimum_approvals THEN
      SELECT step_order INTO v_next
      FROM public.approval_workflow_steps
      WHERE workflow_id = v_request.workflow_id AND step_order > v_step.step_order
      ORDER BY step_order LIMIT 1;

      IF v_next IS NULL THEN
        UPDATE public.approval_requests
        SET status = 'approved', completed_at = now(), updated_at = now()
        WHERE id = v_request.id;
      ELSE
        UPDATE public.approval_requests
        SET current_step = v_next, updated_at = now()
        WHERE id = v_request.id;
      END IF;
    END IF;
  END IF;

  SELECT * INTO v_request FROM public.approval_requests WHERE id = _request_id;
  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_approval_inbox()
RETURNS TABLE (
  id uuid,
  entity_type text,
  entity_id uuid,
  status text,
  current_step integer,
  workflow_name text,
  step_name text,
  amount numeric,
  requested_by uuid,
  submitted_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.id, r.entity_type, r.entity_id, r.status, r.current_step,
         w.name, s.name, r.amount, r.requested_by, r.submitted_at
  FROM public.approval_requests r
  JOIN public.approval_workflows w ON w.id = r.workflow_id
  JOIN public.approval_workflow_steps s ON s.workflow_id = r.workflow_id AND s.step_order = r.current_step
  WHERE r.tenant_id = public.current_tenant_id()
    AND r.status = 'pending'
    AND public.approval_actor_can_act(r, s);
$$;

GRANT EXECUTE ON FUNCTION public.create_approval_request(text,uuid,numeric,jsonb,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.act_on_approval_request(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_approval_inbox() TO authenticated;
GRANT EXECUTE ON FUNCTION public.approval_condition_matches(jsonb,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approval_actor_can_act(public.approval_requests, public.approval_workflow_steps) TO authenticated;

-- Workflow administration is RPC-driven so authenticated users cannot bypass
-- approvals.manage by writing workflow definitions directly.
CREATE OR REPLACE FUNCTION public.create_approval_workflow(
  _code text,
  _name text,
  _entity_type text,
  _description text DEFAULT NULL,
  _conditions jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_permission('approvals.manage') THEN RAISE EXCEPTION 'Not authorized: approvals.manage'; END IF;
  INSERT INTO public.approval_workflows(tenant_id, code, name, entity_type, description, conditions, created_by)
  VALUES (public.current_tenant_id(), trim(_code), trim(_name), trim(_entity_type), _description, COALESCE(_conditions,'{}'::jsonb), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_approval_workflow_step(
  _workflow_id uuid,
  _step_order integer,
  _name text,
  _approver_type text,
  _approver_role text DEFAULT NULL,
  _approver_user_id uuid DEFAULT NULL,
  _minimum_approvals integer DEFAULT 1
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_permission('approvals.manage') THEN RAISE EXCEPTION 'Not authorized: approvals.manage'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.approval_workflows WHERE id = _workflow_id AND tenant_id = public.current_tenant_id()) THEN
    RAISE EXCEPTION 'Workflow not found';
  END IF;
  INSERT INTO public.approval_workflow_steps(workflow_id, step_order, name, approver_type, approver_role, approver_user_id, minimum_approvals)
  VALUES (_workflow_id, _step_order, _name, _approver_type, _approver_role, _approver_user_id, _minimum_approvals)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_approval_workflow(text,text,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_approval_workflow_step(uuid,integer,text,text,text,uuid,integer) TO authenticated;

-- Common workflow seeds for existing tenants. They are templates; tenants can
-- disable or modify them through the admin RPCs.
INSERT INTO public.approval_workflows(tenant_id, code, name, entity_type, description, conditions)
SELECT t.id, x.code, x.name, x.entity_type, x.description, x.conditions
FROM public.tenants t
CROSS JOIN (VALUES
  ('purchase_order_over_10000','Purchase Orders over 10,000','purchase_order','Two-step procurement and finance approval', '{"min_amount":10000}'::jsonb),
  ('expense_over_5000','Expenses over 5,000','expense','Finance approval for high-value expenses', '{"min_amount":5000}'::jsonb),
  ('stock_adjustment','Stock Adjustments','inventory_adjustment','Inventory approval before posting adjustments', '{}'::jsonb),
  ('credit_note','Credit Notes','credit_note','Sales approval for credit notes', '{}'::jsonb),
  ('payment_over_10000','Payments over 10,000','payment','Finance approval for high-value payments', '{"min_amount":10000}'::jsonb),
  ('journal_entry','Manual Journal Entries','journal_entry','Accounting approval for manual journals', '{}'::jsonb),
  ('discount_over_15','Discounts over 15%','discount','Sales manager approval for exceptional discounts', '{"min_amount":15}'::jsonb),
  ('refund','Refunds','refund','Sales and finance approval for refunds', '{}'::jsonb)
) AS x(code,name,entity_type,description,conditions)
WHERE t.deleted_at IS NULL
ON CONFLICT (tenant_id, code) DO NOTHING;

-- Default steps map to the application's existing role enum. Labels expose the
-- business meaning while avoiding creation of additional database roles.
INSERT INTO public.approval_workflow_steps(workflow_id, step_order, name, approver_type, approver_role)
SELECT w.id, 1,
  CASE w.entity_type WHEN 'purchase_order' THEN 'Procurement Approval'
                     WHEN 'expense' THEN 'Finance Approval'
                     WHEN 'payment' THEN 'Finance Approval'
                     WHEN 'journal_entry' THEN 'Accounting Approval'
                     ELSE 'Manager Approval' END,
  'role',
  CASE w.entity_type WHEN 'purchase_order' THEN 'purchasing'
                     WHEN 'expense' THEN 'accounting'
                     WHEN 'payment' THEN 'accounting'
                     WHEN 'journal_entry' THEN 'accounting'
                     ELSE 'sales' END
FROM public.approval_workflows w
WHERE NOT EXISTS (SELECT 1 FROM public.approval_workflow_steps s WHERE s.workflow_id = w.id)
  AND w.tenant_id IN (SELECT id FROM public.tenants WHERE deleted_at IS NULL);

INSERT INTO public.approval_workflow_steps(workflow_id, step_order, name, approver_type, approver_role)
SELECT w.id, 2, 'Finance Approval', 'role', 'accounting'
FROM public.approval_workflows w
WHERE w.code = 'purchase_order_over_10000'
  AND NOT EXISTS (SELECT 1 FROM public.approval_workflow_steps s WHERE s.workflow_id = w.id AND s.step_order = 2);

-- updated_at trigger where available in the existing project
DROP TRIGGER IF EXISTS trg_approval_workflows_updated_at ON public.approval_workflows;
CREATE TRIGGER trg_approval_workflows_updated_at BEFORE UPDATE ON public.approval_workflows
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS trg_approval_requests_updated_at ON public.approval_requests;
CREATE TRIGGER trg_approval_requests_updated_at BEFORE UPDATE ON public.approval_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
