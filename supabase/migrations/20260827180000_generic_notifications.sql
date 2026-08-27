-- =========================================================
-- Generic notification center with realtime delivery
-- =========================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'approval_required',
    'approval_approved',
    'approval_rejected',
    'low_stock',
    'invoice_overdue',
    'payment_received',
    'purchase_received',
    'shipment_dispatched',
    'accounting_posting_failed'
  )),
  title text NOT NULL,
  message text NOT NULL,
  entity_type text,
  entity_id uuid,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','success','warning','error')),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_inbox_idx
  ON public.notifications(tenant_id, user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_entity_idx
  ON public.notifications(tenant_id, entity_type, entity_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_read ON public.notifications;
CREATE POLICY notifications_read ON public.notifications
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND user_id = auth.uid())
  WITH CHECK (tenant_id = public.current_tenant_id() AND user_id = auth.uid());

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

CREATE OR REPLACE FUNCTION public.create_notification(
  _user_id uuid,
  _type text,
  _title text,
  _message text,
  _entity_type text DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _severity text DEFAULT 'info'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant uuid := public.current_tenant_id();
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No active tenant'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'Notification recipient is outside the active tenant';
  END IF;

  INSERT INTO public.notifications(tenant_id, user_id, type, title, message, entity_type, entity_id, severity)
  VALUES (v_tenant, _user_id, _type, trim(_title), trim(_message), _entity_type, _entity_id, COALESCE(_severity, 'info'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_notifications(_limit integer DEFAULT 30)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  tenant_id uuid,
  type text,
  title text,
  message text,
  entity_type text,
  entity_id uuid,
  severity text,
  read_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT n.id, n.user_id, n.tenant_id, n.type, n.title, n.message,
         n.entity_type, n.entity_id, n.severity, n.read_at, n.created_at
  FROM public.notifications n
  WHERE n.tenant_id = public.current_tenant_id()
    AND n.user_id = auth.uid()
  ORDER BY n.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 30), 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.get_my_notification_unread_count()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.notifications
  WHERE tenant_id = public.current_tenant_id()
    AND user_id = auth.uid()
    AND read_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(_notification_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.notifications
  SET read_at = COALESCE(read_at, now())
  WHERE id = _notification_id
    AND tenant_id = public.current_tenant_id()
    AND user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.notifications
  SET read_at = COALESCE(read_at, now())
  WHERE tenant_id = public.current_tenant_id()
    AND user_id = auth.uid()
    AND read_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_notification(uuid,text,text,text,text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_notifications(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_notification_unread_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

-- Approval request notifications: notify every eligible approver at the active step.
CREATE OR REPLACE FUNCTION public.notify_approval_request()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_step public.approval_workflow_steps%ROWTYPE;
  v_role text;
  v_title text;
  v_message text;
  v_user uuid;
BEGIN
  SELECT * INTO v_step
  FROM public.approval_workflow_steps
  WHERE workflow_id = NEW.workflow_id AND step_order = NEW.current_step;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_title := 'Approval Required';
  v_message := initcap(replace(NEW.entity_type, '_', ' ')) || ' requires your approval';
  IF NEW.amount IS NOT NULL THEN v_message := v_message || ' · Amount: ' || to_char(NEW.amount, 'FM999,999,999,990.00'); END IF;

  IF v_step.approver_type = 'user' THEN
    PERFORM public.create_notification(v_step.approver_user_id, 'approval_required', v_title, v_message, NEW.entity_type, NEW.entity_id, 'warning');
  ELSE
    v_role := v_step.approver_role;
    FOR v_user IN
      SELECT ur.user_id
      FROM public.user_roles ur
      WHERE ur.tenant_id = NEW.tenant_id
        AND ur.role::text = v_role
    LOOP
      PERFORM public.create_notification(v_user, 'approval_required', v_title, v_message, NEW.entity_type, NEW.entity_id, 'warning');
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_approval_request ON public.approval_requests;
CREATE TRIGGER trg_notify_approval_request
AFTER INSERT ON public.approval_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_approval_request();

-- Notify the requester when a request is approved/rejected, and notify the next step.
CREATE OR REPLACE FUNCTION public.notify_approval_status_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_step public.approval_workflow_steps%ROWTYPE;
  v_user uuid;
  v_title text;
  v_message text;
  v_type text;
BEGIN
  IF NEW.status = OLD.status AND NEW.current_step = OLD.current_step THEN RETURN NEW; END IF;

  IF NEW.status IN ('approved','rejected') THEN
    v_type := CASE WHEN NEW.status = 'approved' THEN 'approval_approved' ELSE 'approval_rejected' END;
    v_title := CASE WHEN NEW.status = 'approved' THEN 'Approval Approved' ELSE 'Approval Rejected' END;
    v_message := initcap(replace(NEW.entity_type, '_', ' ')) || ' was ' || NEW.status || '.';
    PERFORM public.create_notification(NEW.requested_by, v_type, v_title, v_message, NEW.entity_type, NEW.entity_id,
      CASE WHEN NEW.status = 'approved' THEN 'success' ELSE 'error' END);
  ELSIF NEW.current_step <> OLD.current_step THEN
    SELECT * INTO v_step
    FROM public.approval_workflow_steps
    WHERE workflow_id = NEW.workflow_id AND step_order = NEW.current_step;
    IF FOUND THEN
      v_title := 'Approval Required';
      v_message := initcap(replace(NEW.entity_type, '_', ' ')) || ' requires your approval';
      IF v_step.approver_type = 'user' THEN
        PERFORM public.create_notification(v_step.approver_user_id, 'approval_required', v_title, v_message, NEW.entity_type, NEW.entity_id, 'warning');
      ELSE
        FOR v_user IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.tenant_id = NEW.tenant_id AND ur.role::text = v_step.approver_role LOOP
          PERFORM public.create_notification(v_user, 'approval_required', v_title, v_message, NEW.entity_type, NEW.entity_id, 'warning');
        END LOOP;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_approval_status_change ON public.approval_requests;
CREATE TRIGGER trg_notify_approval_status_change
AFTER UPDATE OF status, current_step ON public.approval_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_approval_status_change();

-- Low-stock notification fires only when an item crosses from above reorder to at/below reorder.
CREATE OR REPLACE FUNCTION public.notify_low_stock_transition()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_on_hand numeric;
  v_before numeric;
  v_reorder numeric;
  v_user uuid;
BEGIN
  SELECT s.on_hand, s.on_hand - NEW.quantity, s.reorder
  INTO v_on_hand, v_before, v_reorder
  FROM public.inventory_item_stock s
  WHERE s.item_id = NEW.item_id AND s.tenant_id = NEW.tenant_id;

  IF v_reorder IS NULL OR v_before <= v_reorder OR v_on_hand > v_reorder THEN RETURN NEW; END IF;

  FOR v_user IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.tenant_id = NEW.tenant_id
      AND ur.role::text IN ('inventory','purchasing','tenant_admin')
  LOOP
    PERFORM public.create_notification(v_user, 'low_stock', 'Low Stock',
      'Item ' || COALESCE((SELECT i.name FROM public.items i WHERE i.id = NEW.item_id), NEW.item_id::text)
      || ' is at ' || to_char(v_on_hand, 'FM999,999,990.####') || ' units; reorder level is ' || to_char(v_reorder, 'FM999,999,990.####') || '.',
      'item', NEW.item_id, 'warning');
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_low_stock_transition ON public.stock_movements;
CREATE TRIGGER trg_notify_low_stock_transition
AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.notify_low_stock_transition();

-- Enable Supabase Realtime for the notification inbox.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
