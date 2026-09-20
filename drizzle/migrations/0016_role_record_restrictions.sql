CREATE TABLE IF NOT EXISTS public.tenant_role_record_restrictions (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role text NOT NULL,
  record_type text NOT NULL CHECK (record_type IN ('supplier_credit','purchase_order','supplier_payment')),
  record_id uuid NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, role, record_type, record_id)
);

GRANT SELECT ON public.tenant_role_record_restrictions TO authenticated;
GRANT ALL ON public.tenant_role_record_restrictions TO service_role;

ALTER TABLE public.tenant_role_record_restrictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members read record restrictions" ON public.tenant_role_record_restrictions;
CREATE POLICY "Tenant members read record restrictions"
ON public.tenant_role_record_restrictions
FOR SELECT TO authenticated
USING (tenant_id = public.current_tenant_id());

CREATE OR REPLACE FUNCTION public.can_access_record(_record_type text, _record_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN true
    WHEN _record_id IS NULL THEN true
    WHEN public.is_super_admin() THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.tenant_id = public.current_tenant_id()
        AND (
          ur.role = 'tenant_admin'::public.app_role
          OR NOT EXISTS (
            SELECT 1 FROM public.tenant_role_record_restrictions r
            WHERE r.tenant_id = ur.tenant_id
              AND r.role = ur.role::text
              AND r.record_type = _record_type
              AND r.record_id = _record_id
              AND r.allowed = false
          )
        )
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.can_access_record(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_record(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_record(text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_role_record_restriction(
  _role text,
  _record_type text,
  _record_id uuid,
  _allowed boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_tenant_id uuid := public.current_tenant_id();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No active workspace' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_super_admin() OR public.has_role(auth.uid(), 'tenant_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF _role NOT IN ('sales','purchasing','inventory','accounting','manufacturing','viewer','accountant','finance_clerk','auditor') THEN
    RAISE EXCEPTION 'This role cannot be customized' USING ERRCODE = '22023';
  END IF;
  IF _record_type NOT IN ('supplier_credit','purchase_order','supplier_payment') THEN
    RAISE EXCEPTION 'Unknown record type' USING ERRCODE = '22023';
  END IF;

  IF _allowed THEN
    DELETE FROM public.tenant_role_record_restrictions
    WHERE tenant_id = v_tenant_id AND role = _role
      AND record_type = _record_type AND record_id = _record_id;
  ELSE
    INSERT INTO public.tenant_role_record_restrictions (
      tenant_id, role, record_type, record_id, allowed, updated_by, updated_at
    ) VALUES (v_tenant_id, _role, _record_type, _record_id, false, auth.uid(), now())
    ON CONFLICT (tenant_id, role, record_type, record_id)
    DO UPDATE SET allowed = false, updated_by = auth.uid(), updated_at = now();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_role_record_restriction(text, text, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_role_record_restriction(text, text, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_role_record_restriction(text, text, uuid, boolean) TO authenticated, service_role;

DROP POLICY IF EXISTS "Record restrictions hide supplier credits" ON public.supplier_credit_notes;
CREATE POLICY "Record restrictions hide supplier credits"
ON public.supplier_credit_notes
AS RESTRICTIVE
FOR SELECT TO authenticated
USING (public.can_access_record('supplier_credit', supplier_id));

DROP POLICY IF EXISTS "Record restrictions hide purchase orders" ON public.purchase_orders;
CREATE POLICY "Record restrictions hide purchase orders"
ON public.purchase_orders
AS RESTRICTIVE
FOR SELECT TO authenticated
USING (public.can_access_record('purchase_order', id));

DROP POLICY IF EXISTS "Record restrictions hide supplier payments" ON public.payments_made;
CREATE POLICY "Record restrictions hide supplier payments"
ON public.payments_made
AS RESTRICTIVE
FOR SELECT TO authenticated
USING (public.can_access_record('supplier_payment', supplier_id));