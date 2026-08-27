-- =========================================================
-- Centralized permissions / RBAC hardening
-- =========================================================

-- Cashier is a first-class application role. PostgreSQL enum additions are
-- transactional-safe when this migration is applied before any data uses it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'cashier'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'cashier';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.permissions (
  code text PRIMARY KEY,
  module text NOT NULL,
  action text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT permissions_code_parts CHECK (code = module || '.' || action)
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role text NOT NULL,
  permission_code text NOT NULL REFERENCES public.permissions(code) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, permission_code)
);

CREATE INDEX IF NOT EXISTS role_permissions_permission_idx
  ON public.role_permissions(permission_code);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read permissions" ON public.permissions;
CREATE POLICY "Authenticated users can read permissions"
  ON public.permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can read role permissions" ON public.role_permissions;
CREATE POLICY "Authenticated users can read role permissions"
  ON public.role_permissions FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.permissions, public.role_permissions TO authenticated;
GRANT ALL ON public.permissions, public.role_permissions TO service_role;

INSERT INTO public.permissions (code, module, action, description) VALUES
  ('crm.read','crm','read','View CRM records'),
  ('crm.create','crm','create','Create CRM records'),
  ('crm.update','crm','update','Edit CRM records'),
  ('crm.delete','crm','delete','Delete CRM records'),
  ('sales.read','sales','read','View sales records'),
  ('sales.create','sales','create','Create sales documents'),
  ('sales.update','sales','update','Edit sales documents'),
  ('sales.delete','sales','delete','Delete sales documents'),
  ('sales.post','sales','post','Post sales documents'),
  ('sales.accounting_post','sales','accounting_post','Post sales accounting and inventory impact'),
  ('sales.void','sales','void','Void sales documents'),
  ('payments.read','payments','read','View payments'),
  ('payments.create','payments','create','Record payments'),
  ('payments.update','payments','update','Edit payments'),
  ('payments.post','payments','post','Post payment accounting'),
  ('inventory.read','inventory','read','View inventory'),
  ('inventory.create','inventory','create','Create inventory records'),
  ('inventory.update','inventory','update','Edit inventory records'),
  ('inventory.adjust','inventory','adjust','Post inventory adjustments'),
  ('inventory.transfer','inventory','transfer','Post inventory transfers'),
  ('purchasing.read','purchasing','read','View purchasing records'),
  ('purchasing.create','purchasing','create','Create purchasing records'),
  ('purchasing.update','purchasing','update','Edit purchasing records'),
  ('purchasing.post','purchasing','post','Post purchasing documents'),
  ('accounting.read','accounting','read','View accounting'),
  ('accounting.create','accounting','create','Create accounting records'),
  ('accounting.update','accounting','update','Edit accounting records'),
  ('accounting.post','accounting','post','Post accounting records'),
  ('banking.read','banking','read','View banking'),
  ('banking.create','banking','create','Create banking records'),
  ('banking.update','banking','update','Edit banking records'),
  ('banking.reconcile','banking','reconcile','Reconcile bank accounts'),
  ('manufacturing.read','manufacturing','read','View manufacturing'),
  ('manufacturing.create','manufacturing','create','Create manufacturing records'),
  ('manufacturing.update','manufacturing','update','Edit manufacturing records'),
  ('manufacturing.post','manufacturing','post','Post production'),
  ('reports.read','reports','read','View reports'),
  ('reports.export','reports','export','Export reports'),
  ('settings.users','settings','users','Manage users and roles'),
  ('settings.roles','settings','roles','Manage role permissions')
ON CONFLICT (code) DO UPDATE SET
  module = EXCLUDED.module,
  action = EXCLUDED.action,
  description = EXCLUDED.description;

-- Explicit role grants. Keep sensitive actions separate so a role can be
-- granted posting/reconciliation without receiving unrelated module access.
INSERT INTO public.role_permissions (role, permission_code)
SELECT 'viewer', p.code FROM public.permissions p WHERE p.action = 'read'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_code)
SELECT r.role, p.code
FROM (VALUES ('sales'), ('cashier')) r(role)
JOIN public.permissions p ON p.code IN (
  'sales.read','sales.create','sales.update','sales.post',
  'sales.accounting_post','payments.read','payments.create','payments.post'
)
WHERE r.role = 'sales' OR p.code NOT IN ('sales.void','sales.delete')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_code)
SELECT 'sales', p.code FROM public.permissions p
WHERE p.code IN ('crm.read','crm.create','crm.update','crm.delete','payments.update')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_code)
SELECT r.role, p.code
FROM (VALUES ('purchasing'), ('inventory'), ('accounting'), ('manufacturing')) r(role)
JOIN public.permissions p ON p.module = r.role
ON CONFLICT DO NOTHING;

-- Cashier is intentionally narrow: POS sales + sales accounting + customer
-- payments. No banking, purchasing, inventory transfer, or administration.
INSERT INTO public.role_permissions (role, permission_code)
SELECT 'cashier', p.code
FROM public.permissions p
WHERE p.code IN (
  'sales.read','sales.create','sales.update','sales.post','sales.accounting_post',
  'payments.read','payments.create','payments.post'
)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_permission(
  _permission text,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = COALESCE(_user_id, auth.uid())
      AND ur.tenant_id = public.current_tenant_id()
      AND (
        ur.role IN ('super_admin'::public.app_role, 'tenant_admin'::public.app_role)
        OR EXISTS (
          SELECT 1
          FROM public.role_permissions rp
          WHERE rp.role = ur.role::text
            AND rp.permission_code = _permission
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(DISTINCT p.code ORDER BY p.code), ARRAY[]::text[])
  FROM public.permissions p
  WHERE EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.tenant_id = public.current_tenant_id()
      AND ur.role IN ('super_admin'::public.app_role, 'tenant_admin'::public.app_role)
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role::text
    WHERE ur.user_id = auth.uid()
      AND ur.tenant_id = public.current_tenant_id()
      AND rp.permission_code = p.code
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_permission(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;

-- Centralize the legacy role-array helper so older RLS policies remain
-- compatible while newer code moves to named permissions.
CREATE OR REPLACE FUNCTION public.tenant_write_ok(_roles public.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.tenant_id = public.current_tenant_id()
      AND (
        ur.role IN ('super_admin'::public.app_role, 'tenant_admin'::public.app_role)
        OR ur.role = ANY(_roles)
      )
  );
$$;

-- RLS write policies are permission-based as well. Existing tenant policies
-- remain in place; these policies add the centralized authorization path.
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('customers','crm'),('sales_quotes','sales'),('sales_orders','sales'),('invoices','sales'),
      ('credit_notes','sales'),('packages','sales'),('shipments','sales'),
      ('payments_received','payments'),('suppliers','purchasing'),('purchase_orders','purchasing'),
      ('purchase_requisitions','purchasing'),('bills','purchasing'),('expenses','purchasing'),
      ('payments_made','payments'),('items','inventory'),('warehouses','inventory'),
      ('inventory_adjustments','inventory'),('inventory_transfers','inventory'),
      ('production_orders','manufacturing'),('bom_headers','manufacturing'),
      ('chart_of_accounts','accounting'),('journal_entries','accounting'),('bank_accounts','banking')
    ) AS v(table_name, module_name)
  LOOP
    IF to_regclass('public.' || item.table_name) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS centralized_%s_insert ON public.%I', item.table_name, item.table_name);
      EXECUTE format('DROP POLICY IF EXISTS centralized_%s_update ON public.%I', item.table_name, item.table_name);
      EXECUTE format('DROP POLICY IF EXISTS centralized_%s_delete ON public.%I', item.table_name, item.table_name);
      EXECUTE format(
        'CREATE POLICY centralized_%s_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission(%L))',
        item.table_name, item.table_name, item.module_name || '.create'
      );
      EXECUTE format(
        'CREATE POLICY centralized_%s_update ON public.%I FOR UPDATE TO authenticated USING (tenant_id = public.current_tenant_id() AND public.has_permission(%L)) WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission(%L))',
        item.table_name, item.table_name, item.module_name || '.update', item.module_name || '.update'
      );
      EXECUTE format(
        'CREATE POLICY centralized_%s_delete ON public.%I FOR DELETE TO authenticated USING (tenant_id = public.current_tenant_id() AND public.has_permission(%L))',
        item.table_name, item.table_name, item.module_name || '.delete'
      );
    END IF;
  END LOOP;
END $$;

-- Secure the existing posting RPCs. We rename the old implementation and
-- expose a same-signature wrapper that authorizes before calling it. This
-- prevents direct RPC invocation from bypassing the UI permission check.
DO $$
BEGIN
  IF to_regprocedure('public.post_invoice(uuid)') IS NOT NULL
     AND to_regprocedure('public.post_invoice_unchecked(uuid)') IS NULL THEN
    ALTER FUNCTION public.post_invoice(uuid) RENAME TO post_invoice_unchecked;
  END IF;
  IF to_regprocedure('public.post_bill(uuid)') IS NOT NULL
     AND to_regprocedure('public.post_bill_unchecked(uuid)') IS NULL THEN
    ALTER FUNCTION public.post_bill(uuid) RENAME TO post_bill_unchecked;
  END IF;
  IF to_regprocedure('public.post_credit_note(uuid)') IS NOT NULL
     AND to_regprocedure('public.post_credit_note_unchecked(uuid)') IS NULL THEN
    ALTER FUNCTION public.post_credit_note(uuid) RENAME TO post_credit_note_unchecked;
  END IF;
  IF to_regprocedure('public.post_shipment(uuid)') IS NOT NULL
     AND to_regprocedure('public.post_shipment_unchecked(uuid)') IS NULL THEN
    ALTER FUNCTION public.post_shipment(uuid) RENAME TO post_shipment_unchecked;
  END IF;
  IF to_regprocedure('public.post_package(uuid)') IS NOT NULL
     AND to_regprocedure('public.post_package_unchecked(uuid)') IS NULL THEN
    ALTER FUNCTION public.post_package(uuid) RENAME TO post_package_unchecked;
  END IF;
  IF to_regprocedure('public.post_adjustment(uuid)') IS NOT NULL
     AND to_regprocedure('public.post_adjustment_unchecked(uuid)') IS NULL THEN
    ALTER FUNCTION public.post_adjustment(uuid) RENAME TO post_adjustment_unchecked;
  END IF;
  IF to_regprocedure('public.post_transfer(uuid)') IS NOT NULL
     AND to_regprocedure('public.post_transfer_unchecked(uuid)') IS NULL THEN
    ALTER FUNCTION public.post_transfer(uuid) RENAME TO post_transfer_unchecked;
  END IF;
  IF to_regprocedure('public.post_production_order(uuid)') IS NOT NULL
     AND to_regprocedure('public.post_production_order_unchecked(uuid)') IS NULL THEN
    ALTER FUNCTION public.post_production_order(uuid) RENAME TO post_production_order_unchecked;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.post_invoice(_invoice_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_permission('sales.accounting_post') THEN RAISE EXCEPTION 'Not authorized: sales.accounting_post'; END IF;
  RETURN public.post_invoice_unchecked(_invoice_id);
END $$;

CREATE OR REPLACE FUNCTION public.post_bill(_bill_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_permission('purchasing.post') AND NOT public.has_permission('accounting.post') THEN RAISE EXCEPTION 'Not authorized: purchasing.post'; END IF;
  RETURN public.post_bill_unchecked(_bill_id);
END $$;

CREATE OR REPLACE FUNCTION public.post_credit_note(_credit_note_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_permission('sales.accounting_post') THEN RAISE EXCEPTION 'Not authorized: sales.accounting_post'; END IF;
  RETURN public.post_credit_note_unchecked(_credit_note_id);
END $$;

CREATE OR REPLACE FUNCTION public.post_shipment(_shipment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_permission('sales.post') AND NOT public.has_permission('inventory.transfer') THEN RAISE EXCEPTION 'Not authorized: shipment posting'; END IF;
  RETURN public.post_shipment_unchecked(_shipment_id);
END $$;

CREATE OR REPLACE FUNCTION public.post_package(_package_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_permission('sales.post') THEN RAISE EXCEPTION 'Not authorized: sales.post'; END IF;
  RETURN public.post_package_unchecked(_package_id);
END $$;

CREATE OR REPLACE FUNCTION public.post_adjustment(_adjustment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_permission('inventory.adjust') THEN RAISE EXCEPTION 'Not authorized: inventory.adjust'; END IF;
  RETURN public.post_adjustment_unchecked(_adjustment_id);
END $$;

CREATE OR REPLACE FUNCTION public.post_transfer(_transfer_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_permission('inventory.transfer') THEN RAISE EXCEPTION 'Not authorized: inventory.transfer'; END IF;
  RETURN public.post_transfer_unchecked(_transfer_id);
END $$;

CREATE OR REPLACE FUNCTION public.post_production_order(_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_permission('manufacturing.post') THEN RAISE EXCEPTION 'Not authorized: manufacturing.post'; END IF;
  RETURN public.post_production_order_unchecked(_order_id);
END $$;

-- The original implementations are intentionally not callable by API roles.
REVOKE EXECUTE ON FUNCTION public.post_invoice_unchecked(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_bill_unchecked(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_credit_note_unchecked(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_shipment_unchecked(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_package_unchecked(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_adjustment_unchecked(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_transfer_unchecked(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_production_order_unchecked(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.post_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_bill(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_credit_note(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_shipment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_package(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_adjustment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_transfer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_production_order(uuid) TO authenticated;
