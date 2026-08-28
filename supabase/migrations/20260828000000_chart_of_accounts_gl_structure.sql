-- =========================================================
-- Chart of Accounts — Full GL Structure
--
-- Adds:
--   parent_id           self-FK for account hierarchy
--   normal_balance      'Debit' | 'Credit'
--   is_active           replaces ad-hoc "status" text column
--   is_system           flag: seeded by the platform, cannot be deleted
--   description         free-text notes / description
--   opening_balance     numeric(14,2) — balance at account inception
--   currency            ISO-4217 default currency (NULL = tenant default)
--   allow_manual_posting boolean — controls manual journal line entry
--
-- Also seeds:
--   system_account_mappings — purpose → default account code lookup table
-- =========================================================

-- ─────────────────────────────────────────────────────────
-- 1.  New columns on chart_of_accounts
-- ─────────────────────────────────────────────────────────

ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS parent_id            uuid        REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS normal_balance        text        NOT NULL DEFAULT 'Debit'
    CONSTRAINT coa_normal_balance_check CHECK (normal_balance IN ('Debit','Credit')),
  ADD COLUMN IF NOT EXISTS is_active             boolean     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_system             boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS description           text,
  ADD COLUMN IF NOT EXISTS opening_balance       numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency              text,
  ADD COLUMN IF NOT EXISTS allow_manual_posting  boolean     NOT NULL DEFAULT true;

-- Useful index for parent look-ups
CREATE INDEX IF NOT EXISTS coa_parent_id_idx ON public.chart_of_accounts(tenant_id, parent_id)
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────
-- 2.  Backfill existing accounts with sensible defaults
--     based on their type value
-- ─────────────────────────────────────────────────────────

-- normal_balance: Assets/Expenses → Debit; Liabilities/Equity/Income → Credit
UPDATE public.chart_of_accounts
SET
  normal_balance = CASE
    WHEN lower(COALESCE(type,'')) IN ('asset','expense') THEN 'Debit'
    ELSE 'Credit'
  END,
  is_system = (code IN ('1000','1100','1200','1300','2000','3000','4000','5000','6000')),
  allow_manual_posting = CASE
    WHEN code IN ('1200','1300') THEN false  -- Inventory / WIP controlled by sub-ledger
    ELSE true
  END
WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────
-- 3.  System account mappings reference table
--     Records the canonical purpose → account code contract
--     that the posting engine relies on.
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.system_account_mappings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose         text        NOT NULL UNIQUE,
  default_code    text        NOT NULL,
  label           text        NOT NULL,
  description     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.system_account_mappings (purpose, default_code, label, description) VALUES
  ('cash',                '1000', 'Cash',                   'Primary cash and cash-equivalent account'),
  ('accounts_receivable', '1100', 'Accounts Receivable',    'Amounts owed by customers'),
  ('inventory',           '1200', 'Inventory',              'Stock held for sale'),
  ('wip',                 '1300', 'Work in Progress',       'Partially completed production costs'),
  ('accounts_payable',    '2000', 'Accounts Payable',       'Amounts owed to suppliers'),
  ('equity',              '3000', 'Equity',                 'Owner / shareholder equity'),
  ('sales_revenue',       '4000', 'Sales Revenue',          'Revenue from primary business operations'),
  ('cogs',                '5000', 'Cost of Goods Sold',     'Direct cost of products sold'),
  ('operating_expenses',  '6000', 'Operating Expenses',     'Overhead and indirect operating costs')
ON CONFLICT (purpose) DO NOTHING;

-- Read-only for authenticated users
ALTER TABLE public.system_account_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can read system_account_mappings" ON public.system_account_mappings;
CREATE POLICY "Everyone can read system_account_mappings"
  ON public.system_account_mappings
  FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON public.system_account_mappings TO authenticated;
GRANT ALL   ON public.system_account_mappings TO service_role;

-- ─────────────────────────────────────────────────────────
-- 4.  Update handle_new_user to seed all columns
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_tenant_id uuid;
  tenant_name   text;
  tenant_slug   text;
BEGIN
  tenant_name := COALESCE(NEW.raw_user_meta_data->>'company',
                           split_part(NEW.email,'@',1) || '''s Workspace');
  tenant_slug := lower(regexp_replace(
                   tenant_name || '-' || substr(NEW.id::text,1,8),
                   '[^a-z0-9]+','-','g'));

  INSERT INTO public.tenants (name, slug)
  VALUES (tenant_name, tenant_slug)
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.profiles (id, tenant_id, email, full_name)
  VALUES (NEW.id, new_tenant_id, NEW.email,
          COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (NEW.id, new_tenant_id, 'tenant_admin');

  -- ── System accounts ──────────────────────────────────────────────
  -- code | name                  | type      | normal_balance | system | allow_manual
  INSERT INTO public.chart_of_accounts
    (tenant_id, code, name, type, normal_balance, is_system, allow_manual_posting, description, created_by)
  VALUES
    (new_tenant_id,'1000','Cash',                 'Asset',   'Debit', true, true,  'Primary cash and cash-equivalent account',  NEW.id),
    (new_tenant_id,'1100','Accounts Receivable',  'Asset',   'Debit', true, false, 'Amounts owed by customers',                 NEW.id),
    (new_tenant_id,'1200','Inventory',            'Asset',   'Debit', true, false, 'Stock held for sale',                       NEW.id),
    (new_tenant_id,'1300','Work in Progress',     'Asset',   'Debit', true, false, 'Partially completed production costs',      NEW.id),
    (new_tenant_id,'2000','Accounts Payable',     'Liability','Credit',true,false, 'Amounts owed to suppliers',                 NEW.id),
    (new_tenant_id,'3000','Owner Equity',         'Equity',  'Credit',true, false, 'Owner / shareholder equity',                NEW.id),
    (new_tenant_id,'4000','Sales Revenue',        'Income',  'Credit',true, false, 'Revenue from primary business operations',  NEW.id),
    (new_tenant_id,'5000','Cost of Goods Sold',   'Expense', 'Debit', true, true,  'Direct cost of products sold',              NEW.id),
    (new_tenant_id,'6000','Operating Expenses',   'Expense', 'Debit', true, true,  'Overhead and indirect operating costs',     NEW.id);

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- 5.  Prevent deletion of system accounts
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_system_account_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- We use soft-delete (deleted_at), but guard the hard-delete path too
  IF OLD.is_system THEN
    RAISE EXCEPTION 'System account "%" (%) cannot be deleted', OLD.name, OLD.code
      USING ERRCODE = '23000';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_system_account_delete ON public.chart_of_accounts;
CREATE TRIGGER trg_guard_system_account_delete
  BEFORE DELETE ON public.chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_system_account_delete();

-- Also block soft-delete via UPDATE setting deleted_at on system accounts
CREATE OR REPLACE FUNCTION public.guard_system_account_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL AND OLD.is_system THEN
    RAISE EXCEPTION 'System account "%" (%) cannot be deleted', OLD.name, OLD.code
      USING ERRCODE = '23000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_system_account_soft_delete ON public.chart_of_accounts;
CREATE TRIGGER trg_guard_system_account_soft_delete
  BEFORE UPDATE ON public.chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_system_account_soft_delete();
