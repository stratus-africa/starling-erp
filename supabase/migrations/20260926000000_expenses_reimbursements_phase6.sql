-- Phase 6: employee expenses and reimbursements.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS merchant text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS cost_center text,
  ADD COLUMN IF NOT EXISTS project text,
  ADD COLUMN IF NOT EXISTS customer_job text,
  ADD COLUMN IF NOT EXISTS business_purpose text,
  ADD COLUMN IF NOT EXISTS receipt_status text NOT NULL DEFAULT 'Missing',
  ADD COLUMN IF NOT EXISTS receipt_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duplicate_override_reason text,
  ADD COLUMN IF NOT EXISTS duplicate_override_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS duplicate_override_at timestamptz;

UPDATE public.expenses
SET reimbursement_status = 'Pending'
WHERE employee_id IS NOT NULL AND bank_account_id IS NULL AND status NOT IN ('Cancelled','Rejected') AND reimbursement_status = 'Not Applicable';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_receipt_status_check') THEN
    ALTER TABLE public.expenses ADD CONSTRAINT expenses_receipt_status_check CHECK (receipt_status IN ('Missing','Attached','Needs Review'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  account_id uuid REFERENCES public.chart_of_accounts(id),
  receipt_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY expense_categories_read ON public.expense_categories FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() AND public.has_permission('purchasing.read'));
CREATE POLICY expense_categories_write ON public.expense_categories FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id() AND public.has_permission('purchasing.update')) WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission('purchasing.update'));
GRANT SELECT, INSERT, UPDATE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;

CREATE OR REPLACE FUNCTION public.mark_expense_receipt_attached()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.entity_type = 'expense' THEN
    UPDATE public.expenses SET receipt_status = 'Attached', updated_at = now() WHERE id = NEW.entity_id AND tenant_id = NEW.tenant_id AND deleted_at IS NULL AND receipt_status = 'Missing';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mark_expense_receipt_attached ON public.attachments;
CREATE TRIGGER trg_mark_expense_receipt_attached AFTER INSERT ON public.attachments FOR EACH ROW EXECUTE FUNCTION public.mark_expense_receipt_attached();

DROP POLICY IF EXISTS centralized_expenses_insert ON public.expenses;
CREATE POLICY centralized_expenses_insert ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_permission('purchasing.create') AND current_setting('nimbus.expense_create', true) = 'on');

INSERT INTO public.permissions (code, module, action, description) VALUES
  ('purchasing.expense_duplicate_override','purchasing','expense_duplicate_override','Override duplicate expense warnings'),
  ('purchasing.reimbursements_read','purchasing','reimbursements_read','View employee reimbursements'),
  ('purchasing.reimbursements_create','purchasing','reimbursements_create','Create employee reimbursements'),
  ('purchasing.reimbursements_post','purchasing','reimbursements_post','Post employee reimbursements')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS public.employee_reimbursements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES auth.users(id),
  number text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  currency text NOT NULL,
  total numeric(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  bank_account_id uuid REFERENCES public.bank_accounts(id),
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Pending','Approved','Paid','Cancelled')),
  reference text,
  notes text,
  posted_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.expense_reimbursement_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reimbursement_id uuid NOT NULL REFERENCES public.employee_reimbursements(id) ON DELETE CASCADE,
  expense_id uuid NOT NULL REFERENCES public.expenses(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  UNIQUE (tenant_id, reimbursement_id, expense_id)
);
CREATE INDEX IF NOT EXISTS expense_reimbursement_allocations_expense_idx ON public.expense_reimbursement_allocations (tenant_id, expense_id) WHERE deleted_at IS NULL;
ALTER TABLE public.employee_reimbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_reimbursement_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY employee_reimbursements_read ON public.employee_reimbursements FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() AND public.has_permission('purchasing.reimbursements_read'));
CREATE POLICY employee_reimbursement_allocations_read ON public.expense_reimbursement_allocations FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() AND public.has_permission('purchasing.reimbursements_read'));
GRANT SELECT ON public.employee_reimbursements, public.expense_reimbursement_allocations TO authenticated;
GRANT ALL ON public.employee_reimbursements, public.expense_reimbursement_allocations TO service_role;

CREATE OR REPLACE FUNCTION public.create_expense(
  _date date, _amount numeric, _tax_amount numeric, _total numeric, _currency text,
  _category text, _account_id uuid, _employee_id uuid DEFAULT NULL,
  _merchant text DEFAULT NULL, _mode text DEFAULT NULL, _reference text DEFAULT NULL,
  _department text DEFAULT NULL, _cost_center text DEFAULT NULL, _project text DEFAULT NULL,
  _customer_job text DEFAULT NULL, _business_purpose text DEFAULT NULL,
  _notes text DEFAULT NULL, _receipt_status text DEFAULT 'Missing',
  _receipt_required boolean DEFAULT false, _bank_account_id uuid DEFAULT NULL,
  _duplicate_override_reason text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.current_tenant_id(); v_id uuid; v_duplicate boolean;
BEGIN
  IF NOT public.has_permission('purchasing.create') THEN RAISE EXCEPTION 'Not authorized: purchasing.create' USING ERRCODE = '42501'; END IF;
  IF _date IS NULL OR _amount IS NULL OR _amount <= 0 OR COALESCE(_total,0) <= 0 OR NULLIF(trim(_category),'') IS NULL OR _currency IS NULL THEN RAISE EXCEPTION 'Expense date, amount, total, category, and currency are required'; END IF;
  IF _receipt_status NOT IN ('Missing','Attached','Needs Review') THEN RAISE EXCEPTION 'Invalid receipt status'; END IF;
  IF _receipt_required AND _receipt_status = 'Missing' THEN RAISE EXCEPTION 'A receipt is required for this expense'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.expenses WHERE tenant_id = v_tenant AND employee_id IS NOT DISTINCT FROM _employee_id AND date = _date AND lower(COALESCE(merchant,'')) = lower(COALESCE(_merchant,'')) AND amount = round(_amount,2) AND COALESCE(reference,'') = COALESCE(_reference,'') AND deleted_at IS NULL AND status NOT IN ('Cancelled','Rejected')) INTO v_duplicate;
  IF v_duplicate AND (NULLIF(trim(_duplicate_override_reason),'') IS NULL OR NOT public.has_permission('purchasing.expense_duplicate_override')) THEN RAISE EXCEPTION 'Possible duplicate expense requires an authorized override'; END IF;
  PERFORM set_config('nimbus.expense_create', 'on', true);
  INSERT INTO public.expenses (tenant_id, employee_id, date, amount, tax_amount, total, currency, category, account_id, bank_account_id, mode, reference, merchant, department, cost_center, project, customer_job, business_purpose, notes, receipt_status, receipt_required, reimbursement_status, status, duplicate_override_reason, duplicate_override_by, duplicate_override_at, created_by)
  VALUES (v_tenant, _employee_id, _date, round(_amount,2), COALESCE(_tax_amount,0), round(_total,2), upper(_currency), trim(_category), _account_id, _bank_account_id, _mode, _reference, _merchant, _department, _cost_center, _project, _customer_job, _business_purpose, _notes, _receipt_status, _receipt_required, CASE WHEN _employee_id IS NOT NULL AND _bank_account_id IS NULL THEN 'Pending' ELSE 'Not Applicable' END, 'Draft', NULLIF(trim(_duplicate_override_reason),''), CASE WHEN v_duplicate THEN auth.uid() END, CASE WHEN v_duplicate THEN now() END, auth.uid()) RETURNING id INTO v_id;
  PERFORM set_config('nimbus.expense_create', 'off', true);
  RETURN v_id;
EXCEPTION WHEN OTHERS THEN PERFORM set_config('nimbus.expense_create', 'off', true); RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_expense(_expense_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_exp public.expenses; v_request uuid;
BEGIN
  IF NOT public.has_permission('purchasing.update') THEN RAISE EXCEPTION 'Not authorized: purchasing.update' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_exp FROM public.expenses WHERE id = _expense_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found for current tenant'; END IF;
  IF v_exp.status <> 'Draft' THEN RAISE EXCEPTION 'Expense must be Draft before submission'; END IF;
  IF v_exp.receipt_required AND v_exp.receipt_status = 'Missing' THEN RAISE EXCEPTION 'Required receipt is missing'; END IF;
  IF v_exp.amount <= 0 OR v_exp.total <= 0 OR v_exp.account_id IS NULL THEN RAISE EXCEPTION 'Expense is missing accounting requirements'; END IF;
  PERFORM public.transition_expense(_expense_id, 'Submitted', 'Employee submitted expense');
  SELECT public.create_approval_request('expense', _expense_id, v_exp.total, jsonb_build_object('employee_id', v_exp.employee_id, 'category', v_exp.category, 'merchant', v_exp.merchant, 'date', v_exp.date, 'receipt_status', v_exp.receipt_status, 'business_purpose', v_exp.business_purpose, 'account_id', v_exp.account_id), 'expense:' || _expense_id::text, NULL) INTO v_request;
  PERFORM public.transition_expense(_expense_id, 'Pending Approval', 'Expense submitted for approval');
  RETURN _expense_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_expense(_expense_id uuid, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.has_permission('approvals.approve') THEN RAISE EXCEPTION 'Not authorized: approvals.approve' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.approval_requests WHERE entity_type = 'expense' AND entity_id = _expense_id AND tenant_id = public.current_tenant_id() AND status <> 'approved') THEN RAISE EXCEPTION 'Expense approval is incomplete'; END IF;
  PERFORM public.transition_expense(_expense_id, 'Approved', COALESCE(_reason,'Expense approved'));
  RETURN _expense_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_expense(_expense_id uuid, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.has_permission('approvals.reject') THEN RAISE EXCEPTION 'Not authorized: approvals.reject' USING ERRCODE = '42501'; END IF;
  PERFORM public.transition_expense(_expense_id, 'Rejected', COALESCE(_reason,'Expense rejected'));
  RETURN _expense_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_reimbursement(_employee_id uuid, _currency text, _allocations jsonb, _date date DEFAULT CURRENT_DATE, _bank_account_id uuid DEFAULT NULL, _notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.current_tenant_id(); v_id uuid; v_item jsonb; v_exp public.expenses; v_total numeric := 0;
BEGIN
  IF NOT public.has_permission('purchasing.reimbursements_create') THEN RAISE EXCEPTION 'Not authorized: purchasing.reimbursements_create' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(_allocations) <> 'array' OR jsonb_array_length(_allocations) = 0 THEN RAISE EXCEPTION 'At least one expense allocation is required'; END IF;
  INSERT INTO public.employee_reimbursements (tenant_id, employee_id, number, date, currency, bank_account_id, notes, status, created_by) VALUES (v_tenant, _employee_id, 'REIM-' || right(replace(gen_random_uuid()::text, '-',''),8), COALESCE(_date,CURRENT_DATE), upper(_currency), _bank_account_id, _notes, 'Pending', auth.uid()) RETURNING id INTO v_id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(_allocations) LOOP
    SELECT * INTO v_exp FROM public.expenses WHERE id = (v_item->>'expense_id')::uuid AND tenant_id = v_tenant AND employee_id = _employee_id AND currency = upper(_currency) AND status = 'Posted' AND reimbursement_status IN ('Pending','Partially Reimbursed') AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Expense is not eligible for reimbursement'; END IF;
    IF (v_item->>'amount')::numeric <= 0 THEN RAISE EXCEPTION 'Reimbursement allocation must be positive'; END IF;
    IF (v_item->>'amount')::numeric > v_exp.total - COALESCE((SELECT SUM(amount) FROM public.expense_reimbursement_allocations WHERE expense_id = v_exp.id AND deleted_at IS NULL),0) THEN RAISE EXCEPTION 'Reimbursement exceeds expense outstanding amount'; END IF;
    INSERT INTO public.expense_reimbursement_allocations (tenant_id, reimbursement_id, expense_id, amount, created_by) VALUES (v_tenant, v_id, v_exp.id, round((v_item->>'amount')::numeric,2), auth.uid());
    v_total := v_total + round((v_item->>'amount')::numeric,2);
  END LOOP;
  UPDATE public.employee_reimbursements SET total = v_total WHERE id = v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_reimbursement(_reimbursement_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_reim public.employee_reimbursements; v_ap uuid; v_cash uuid; v_journal uuid;
BEGIN
  IF NOT public.has_permission('purchasing.reimbursements_post') THEN RAISE EXCEPTION 'Not authorized: purchasing.reimbursements_post' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_reim FROM public.employee_reimbursements WHERE id = _reimbursement_id AND tenant_id = public.current_tenant_id() AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reimbursement not found for current tenant'; END IF;
  IF v_reim.status = 'Paid' THEN RETURN _reimbursement_id; END IF;
  IF v_reim.status <> 'Approved' THEN RAISE EXCEPTION 'Reimbursement must be Approved before posting'; END IF;
  v_ap := public._cfg_account(v_reim.tenant_id, 'accounts_payable'); v_cash := COALESCE((SELECT gl_account_id FROM public.bank_accounts WHERE id = v_reim.bank_account_id AND tenant_id = v_reim.tenant_id AND deleted_at IS NULL), public._cfg_account(v_reim.tenant_id, 'cash'));
  IF v_ap IS NULL OR v_cash IS NULL THEN RAISE EXCEPTION 'Reimbursement posting accounts are not configured'; END IF;
  PERFORM public._emit_journal(v_reim.tenant_id, v_reim.date, 'Employee reimbursement ' || COALESCE(v_reim.number,v_reimbursement_id::text), 'employee_reimbursement', _reimbursement_id, jsonb_build_array(jsonb_build_object('account_id',v_ap,'debit',v_reim.total,'credit',0,'memo','Employee payable cleared'),jsonb_build_object('account_id',v_cash,'debit',0,'credit',v_reim.total,'memo','Reimbursement paid')));
  UPDATE public.employee_reimbursements SET status = 'Paid', posted_at = now() WHERE id = _reimbursement_id;
  UPDATE public.expenses e SET reimbursement_status = CASE WHEN COALESCE((SELECT SUM(a.amount) FROM public.expense_reimbursement_allocations a WHERE a.expense_id=e.id AND a.deleted_at IS NULL),0) >= e.total THEN 'Reimbursed' ELSE 'Partially Reimbursed' END WHERE e.id IN (SELECT expense_id FROM public.expense_reimbursement_allocations WHERE reimbursement_id = _reimbursement_id AND deleted_at IS NULL);
  RETURN _reimbursement_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_reimbursement(_reimbursement_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.has_permission('approvals.approve') THEN RAISE EXCEPTION 'Not authorized: approvals.approve' USING ERRCODE = '42501'; END IF;
  UPDATE public.employee_reimbursements SET status = 'Approved' WHERE id = _reimbursement_id AND tenant_id = public.current_tenant_id() AND status = 'Pending' AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reimbursement is not pending for the current tenant'; END IF;
  RETURN _reimbursement_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_expense_summary(_expense_id uuid)
RETURNS TABLE (amount numeric, tax_amount numeric, total numeric, accounting_status text, reimbursement_status text, receipt_status text, duplicate_warning boolean, employee_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
SELECT e.amount, e.tax_amount, e.total, e.accounting_status, e.reimbursement_status, e.receipt_status, EXISTS (SELECT 1 FROM public.expenses other WHERE other.id <> e.id AND other.tenant_id=e.tenant_id AND other.employee_id IS NOT DISTINCT FROM e.employee_id AND other.date=e.date AND lower(COALESCE(other.merchant,''))=lower(COALESCE(e.merchant,'')) AND other.amount=e.amount AND other.deleted_at IS NULL) AS duplicate_warning, e.employee_id FROM public.expenses e WHERE e.id = _expense_id AND e.tenant_id = public.current_tenant_id() AND e.deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_employee_reimbursement_summary(_employee_id uuid)
RETURNS TABLE (pending numeric, approved numeric, paid numeric, outstanding_expenses numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
SELECT COALESCE(SUM(total) FILTER (WHERE status='Pending'),0), COALESCE(SUM(total) FILTER (WHERE status='Approved'),0), COALESCE(SUM(total) FILTER (WHERE status='Paid'),0), COALESCE((SELECT SUM(e.total - COALESCE((SELECT SUM(a.amount) FROM public.expense_reimbursement_allocations a WHERE a.expense_id=e.id AND a.deleted_at IS NULL),0)) FROM public.expenses e WHERE e.tenant_id=public.current_tenant_id() AND e.employee_id=_employee_id AND e.status='Posted' AND e.reimbursement_status IN ('Pending','Partially Reimbursed') AND e.deleted_at IS NULL),0) FROM public.employee_reimbursements WHERE tenant_id=public.current_tenant_id() AND employee_id=_employee_id AND deleted_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.create_expense(date,numeric,numeric,numeric,text,text,uuid,uuid,text,text,text,text,text,text,text,text,text,text,boolean,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_expense(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_expense(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_expense(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_reimbursement(uuid,text,jsonb,date,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_reimbursement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_reimbursement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_expense_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_employee_reimbursement_summary(uuid) TO authenticated;