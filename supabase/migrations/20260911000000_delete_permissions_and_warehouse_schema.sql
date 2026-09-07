-- =========================================================
-- F1: Delete permissions + warehouses.capacity_sqm column
--
-- Problems fixed:
--   1. "new row violates row-level security policy for table X" on delete:
--      The soft-delete path calls UPDATE (sets deleted_at). The centralized
--      UPDATE policy requires <module>.update, which roles may have — but the
--      DELETE policy uses <module>.delete, a permission code that did NOT exist
--      in the permissions table, so nobody had it, and delete-from-UI failed.
--
--      Fix: register *.delete permission codes for every module that supports
--      soft-delete, and grant them to the appropriate roles.
--
--   2. "Could not find the 'capacity_sqm' column of 'warehouses' in the schema
--      cache":
--      The frontend field definitions include capacity_sqm, but the warehouses
--      table never got this column via migration.
-- =========================================================

-- ── 1. Add capacity_sqm to warehouses ────────────────────────────────────────
ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS capacity_sqm numeric CHECK (capacity_sqm >= 0);

-- ── 2. Register delete permission codes ──────────────────────────────────────
INSERT INTO public.permissions (code, module, action, description) VALUES
  ('crm.delete',           'crm',           'delete', 'Delete CRM records'),
  ('sales.delete',         'sales',         'delete', 'Delete sales documents'),
  ('payments.delete',      'payments',      'delete', 'Delete payment records'),
  ('inventory.delete',     'inventory',     'delete', 'Delete inventory records'),
  ('purchasing.delete',    'purchasing',    'delete', 'Delete purchasing records'),
  ('accounting.delete',    'accounting',    'delete', 'Delete accounting records'),
  ('banking.delete',       'banking',       'delete', 'Delete banking records'),
  ('manufacturing.delete', 'manufacturing', 'delete', 'Delete manufacturing records'),
  ('reports.delete',       'reports',       'delete', 'Delete report configurations'),
  ('inventory.void',       'inventory',     'void',   'Void inventory postings'),
  ('manufacturing.void',   'manufacturing', 'void',   'Void manufacturing postings'),
  ('sales.void',           'sales',         'void',   'Void sales documents'),
  ('purchasing.void',      'purchasing',    'void',   'Void purchasing documents')
ON CONFLICT (code) DO UPDATE SET
  module      = EXCLUDED.module,
  action      = EXCLUDED.action,
  description = EXCLUDED.description;

-- ── 3. Grant delete permissions to existing roles ────────────────────────────
-- sales role: can delete sales, crm, payments
INSERT INTO public.role_permissions (role, permission_code)
SELECT r.role, p.code
FROM (VALUES ('sales')) r(role)
JOIN public.permissions p ON p.code IN (
  'sales.delete', 'crm.delete', 'payments.delete', 'sales.void'
)
ON CONFLICT DO NOTHING;

-- inventory role: all inventory actions including delete and void
INSERT INTO public.role_permissions (role, permission_code)
SELECT 'inventory', p.code
FROM public.permissions p
WHERE p.module = 'inventory'
ON CONFLICT DO NOTHING;

-- purchasing role: all purchasing actions including delete and void
INSERT INTO public.role_permissions (role, permission_code)
SELECT 'purchasing', p.code
FROM public.permissions p
WHERE p.module = 'purchasing'
ON CONFLICT DO NOTHING;

-- accounting role: all accounting actions including delete
INSERT INTO public.role_permissions (role, permission_code)
SELECT 'accounting', p.code
FROM public.permissions p
WHERE p.module IN ('accounting', 'banking')
ON CONFLICT DO NOTHING;

-- manufacturing role: all manufacturing actions including delete and void
INSERT INTO public.role_permissions (role, permission_code)
SELECT 'manufacturing', p.code
FROM public.permissions p
WHERE p.module = 'manufacturing'
ON CONFLICT DO NOTHING;

-- banking role: banking delete
INSERT INTO public.role_permissions (role, permission_code)
SELECT 'banking', p.code
FROM public.permissions p
WHERE p.module = 'banking'
ON CONFLICT DO NOTHING;

-- ── 4. Re-create centralized delete RLS policies to use proper permission ─────
-- The existing policies were generated in 20260827120000_centralized_permissions.sql.
-- They already use <module>.delete but the permission codes weren't registered,
-- so has_permission always returned false. Now that the codes exist, the
-- existing policies will work correctly. No policy rebuild needed.

-- ── 5. Ensure softDeleteRow (UPDATE deleted_at) passes the UPDATE policy ─────
-- The soft-delete path in typed-db.ts does:
--   supabase.from(table).update({ deleted_at: ... }).eq('id', ...)
-- This triggers the UPDATE policy which requires <module>.update.
-- All editing roles already have <module>.update, so this was already
-- working. The INSERT error on `sales_quotes` and `items` was caused by
-- attempting to INSERT a new row while providing a column (capacity_sqm)
-- that doesn't exist in the DB — causing a PostgREST schema cache 400 error
-- that Supabase reports as an RLS violation in some client versions.
-- The capacity_sqm column addition above resolves the items/warehouses errors.
-- The sales_quotes INSERT errors are caused by the missing `sales.delete` /
-- `sales.void` permission codes being absent from the permissions table,
-- meaning has_permission('sales.delete') returned false, blocking the
-- centralized_sales_quotes_delete UPDATE path.

-- ── 6. Grant the banking.delete / accounting.delete as well ──────────────────
INSERT INTO public.role_permissions (role, permission_code)
SELECT 'tenant_admin', p.code
FROM public.permissions p
WHERE p.action IN ('delete', 'void')
ON CONFLICT DO NOTHING;
