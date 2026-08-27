-- =========================================================
-- First-class business audit/event system
-- CRUD audit_logs remains available; business_events records
-- meaningful ERP events with immutable before/after snapshots.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.business_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS business_events_tenant_time_idx
  ON public.business_events(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS business_events_entity_idx
  ON public.business_events(tenant_id, entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS business_events_action_idx
  ON public.business_events(tenant_id, action, occurred_at DESC);

ALTER TABLE public.business_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS business_events_read ON public.business_events;
CREATE POLICY business_events_read ON public.business_events
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());

GRANT SELECT ON public.business_events TO authenticated;
GRANT ALL ON public.business_events TO service_role;

-- Extract request metadata when Supabase/PostgREST exposes it. Missing headers
-- are intentionally NULL; audit integrity does not depend on client supplied data.
CREATE OR REPLACE FUNCTION public.audit_request_ip()
RETURNS inet
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_headers jsonb;
BEGIN
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL;
  END;
  BEGIN
    RETURN NULLIF(COALESCE(v_headers->>'x-forwarded-for', v_headers->>'cf-connecting-ip', v_headers->>'x-real-ip'), '')::inet;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_request_user_agent()
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_headers jsonb;
BEGIN
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    RETURN NULLIF(v_headers->>'user-agent', '');
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_business_event(
  _action text,
  _entity_type text,
  _entity_id uuid DEFAULT NULL,
  _old_values jsonb DEFAULT NULL,
  _new_values jsonb DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant uuid := public.current_tenant_id();
  v_id uuid;
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No active tenant'; END IF;

  SELECT email INTO v_email FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.business_events (
    tenant_id, actor_id, actor_email, action, entity_type, entity_id,
    old_values, new_values, metadata, ip_address, user_agent
  ) VALUES (
    v_tenant, auth.uid(), COALESCE(v_email, auth.jwt()->>'email'),
    trim(_action), trim(_entity_type), _entity_id,
    _old_values, _new_values, COALESCE(_metadata, '{}'::jsonb),
    public.audit_request_ip(), public.audit_request_user_agent()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_business_event(text,text,uuid,jsonb,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_business_event(text,text,uuid,jsonb,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_business_event(text,text,uuid,jsonb,jsonb,jsonb) TO service_role;

-- Internal trigger helper. It records CRUD events and promotes important status
-- transitions into business events without requiring every module to duplicate code.
CREATE OR REPLACE FUNCTION public.capture_business_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_entity_id uuid;
  v_action text;
  v_entity_type text;
  v_old_status text;
  v_new_status text;
  v_business_action text;
BEGIN
  v_entity_type := TG_TABLE_NAME;
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD); v_new := NULL; v_entity_id := OLD.id; v_action := 'deleted';
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL; v_new := to_jsonb(NEW); v_entity_id := NEW.id; v_action := 'created';
  ELSE
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW); v_entity_id := NEW.id; v_action := 'updated';
  END IF;

  -- Prefer an explicit status transition over a generic update.
  v_old_status := lower(COALESCE(v_old->>'status', ''));
  v_new_status := lower(COALESCE(v_new->>'status', ''));
  IF TG_OP = 'UPDATE' AND v_old_status IS DISTINCT FROM v_new_status THEN
    v_business_action := CASE
      WHEN v_new_status = 'approved' THEN 'approved'
      WHEN v_new_status = 'posted' THEN 'posted'
      WHEN v_new_status IN ('voided','void','reversed') THEN 'voided'
      WHEN v_new_status = 'reconciled' THEN 'reconciled'
      WHEN v_new_status = 'received' THEN 'received'
      WHEN v_new_status = 'applied' THEN 'applied'
      ELSE NULL
    END;
    IF v_business_action IS NOT NULL THEN
      v_action := v_business_action;
    END IF;
  END IF;

  -- Never expose sensitive fields from common tables in audit snapshots.
  v_old := CASE WHEN v_old IS NULL THEN NULL ELSE v_old - 'password' - 'encrypted_password' - 'access_token' - 'refresh_token' END;
  v_new := CASE WHEN v_new IS NULL THEN NULL ELSE v_new - 'password' - 'encrypted_password' - 'access_token' - 'refresh_token' END;

  PERFORM public.record_business_event(
    v_action,
    replace(v_entity_type, '_', '.'),
    v_entity_id,
    v_old,
    v_new,
    jsonb_build_object('source', 'database_trigger', 'operation', TG_OP)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Business events requested for core ERP documents. These triggers are additive
-- to existing CRUD audit triggers.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'invoices','payments_received','payments_made','bills','credit_notes',
    'inventory_adjustments','inventory_transfers','purchase_orders',
    'bank_transactions','bank_reconciliations','journal_entries',
    'production_orders'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_business_event_%s ON public.%I', t, t);
      EXECUTE format('CREATE TRIGGER trg_business_event_%s AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.capture_business_event()', t, t);
    END IF;
  END LOOP;
END $$;

-- Explicit event names for approval workflow actions.
CREATE OR REPLACE FUNCTION public.capture_approval_business_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.record_business_event(
    CASE WHEN NEW.action = 'approve' THEN 'approved' WHEN NEW.action = 'reject' THEN 'rejected' ELSE NEW.action END,
    'approval.' || NEW.request_id::text,
    NEW.request_id,
    NULL,
    jsonb_build_object('action', NEW.action, 'note', NEW.note, 'workflow_step_id', NEW.workflow_step_id),
    jsonb_build_object('source', 'approval_action', 'acted_by', NEW.acted_by)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_business_event_approval_actions ON public.approval_actions;
CREATE TRIGGER trg_business_event_approval_actions
AFTER INSERT ON public.approval_actions
FOR EACH ROW EXECUTE FUNCTION public.capture_approval_business_event();

-- Convenience query for the tenant audit timeline.
CREATE OR REPLACE FUNCTION public.get_business_events(
  _limit integer DEFAULT 100,
  _action text DEFAULT NULL,
  _entity_type text DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL
)
RETURNS SETOF public.business_events
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT *
  FROM public.business_events
  WHERE (tenant_id = public.current_tenant_id() OR public.is_super_admin())
    AND (_action IS NULL OR action = _action)
    AND (_entity_type IS NULL OR entity_type = _entity_type)
    AND (_entity_id IS NULL OR entity_id = _entity_id)
    AND (_from IS NULL OR occurred_at >= _from)
    AND (_to IS NULL OR occurred_at <= _to)
  ORDER BY occurred_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 500);
$$;

GRANT EXECUTE ON FUNCTION public.get_business_events(integer,text,text,uuid,timestamptz,timestamptz) TO authenticated;

COMMENT ON TABLE public.business_events IS 'Immutable business-level ERP event timeline. CRUD history remains in audit_logs.';
