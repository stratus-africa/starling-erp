-- =========================================================
-- Accounting Dashboard RPC
--
-- get_accounting_dashboard() returns a single JSONB payload:
--
--   kpis              — 7 balance-sheet / P&L headline numbers
--   cash_trend        — daily cash balance for the past 30 days
--   receivables_aging — AR buckets (current / 30 / 60 / 90+ days)
--   payables_aging    — AP buckets (same)
--   revenue_trend     — monthly revenue for the past 6 months
--   expense_trend     — monthly expenses for the past 6 months
--   unposted          — count of unposted documents per type
--   reconciliation    — bank account reconciliation status
--   recent_journals   — 8 most recent posted journal entries
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_accounting_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant  uuid := public.current_tenant_id();
  v_today   date := CURRENT_DATE;
  v_yr_start date := date_trunc('year', CURRENT_DATE)::date;
  v_30      date := CURRENT_DATE - 30;

  -- Resolve key GL account IDs once
  v_cash_id     uuid;
  v_ar_id       uuid;
  v_ap_id       uuid;
  v_inv_id      uuid;
  v_rev_id      uuid;   -- code 4000 (revenue)
  v_exp5_id     uuid;   -- code 5000 (COGS)
  v_exp6_id     uuid;   -- code 6000 (OpEx)

  -- KPI values
  v_cash_bal    numeric := 0;
  v_ar_bal      numeric := 0;
  v_ap_bal      numeric := 0;
  v_inv_bal     numeric := 0;
  v_revenue     numeric := 0;
  v_expenses    numeric := 0;
  v_net_profit  numeric := 0;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No active tenant'; END IF;

  -- ── Resolve account IDs ─────────────────────────────────────────────────
  v_cash_id := public._account_id(v_tenant, '1000');
  v_ar_id   := public._account_id(v_tenant, '1100');
  v_ap_id   := public._account_id(v_tenant, '2000');
  v_inv_id  := public._account_id(v_tenant, '1200');
  v_rev_id  := public._account_id(v_tenant, '4000');
  v_exp5_id := public._account_id(v_tenant, '5000');
  v_exp6_id := public._account_id(v_tenant, '6000');

  -- ── GL balance helper (inline) ───────────────────────────────────────────
  -- For a given account: balance = opening_balance + Σ(debits) - Σ(credits)
  -- We compute for all-time (balance sheet accounts are cumulative).
  -- Revenue and expense accounts use YTD only (period = income statement).

  -- Cash (asset, debit-normal) — all-time balance
  SELECT COALESCE(coa.opening_balance, 0)
       + COALESCE(SUM(jl.debit), 0)
       - COALESCE(SUM(jl.credit), 0)
  INTO v_cash_bal
  FROM public.chart_of_accounts coa
  LEFT JOIN public.journal_lines jl ON jl.account_id = coa.id
    AND jl.tenant_id = v_tenant
  LEFT JOIN public.journal_entries je ON je.id = jl.journal_id
    AND je.status = 'Posted' AND je.deleted_at IS NULL
  WHERE coa.id = v_cash_id AND coa.tenant_id = v_tenant;

  -- Accounts Receivable (asset, debit-normal) — all-time
  SELECT COALESCE(coa.opening_balance, 0)
       + COALESCE(SUM(jl.debit), 0)
       - COALESCE(SUM(jl.credit), 0)
  INTO v_ar_bal
  FROM public.chart_of_accounts coa
  LEFT JOIN public.journal_lines jl ON jl.account_id = coa.id
    AND jl.tenant_id = v_tenant
  LEFT JOIN public.journal_entries je ON je.id = jl.journal_id
    AND je.status = 'Posted' AND je.deleted_at IS NULL
  WHERE coa.id = v_ar_id AND coa.tenant_id = v_tenant;

  -- Accounts Payable (liability, credit-normal) — all-time
  -- Displayed as positive number (what we owe)
  SELECT COALESCE(coa.opening_balance, 0)
       + COALESCE(SUM(jl.credit), 0)
       - COALESCE(SUM(jl.debit), 0)
  INTO v_ap_bal
  FROM public.chart_of_accounts coa
  LEFT JOIN public.journal_lines jl ON jl.account_id = coa.id
    AND jl.tenant_id = v_tenant
  LEFT JOIN public.journal_entries je ON je.id = jl.journal_id
    AND je.status = 'Posted' AND je.deleted_at IS NULL
  WHERE coa.id = v_ap_id AND coa.tenant_id = v_tenant;

  -- Inventory (asset, debit-normal) — all-time
  SELECT COALESCE(coa.opening_balance, 0)
       + COALESCE(SUM(jl.debit), 0)
       - COALESCE(SUM(jl.credit), 0)
  INTO v_inv_bal
  FROM public.chart_of_accounts coa
  LEFT JOIN public.journal_lines jl ON jl.account_id = coa.id
    AND jl.tenant_id = v_tenant
  LEFT JOIN public.journal_entries je ON je.id = jl.journal_id
    AND je.status = 'Posted' AND je.deleted_at IS NULL
  WHERE coa.id = v_inv_id AND coa.tenant_id = v_tenant;

  -- Revenue YTD (income, credit-normal)
  SELECT COALESCE(SUM(jl.credit), 0) - COALESCE(SUM(jl.debit), 0)
  INTO v_revenue
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_id
  WHERE jl.account_id = v_rev_id
    AND jl.tenant_id  = v_tenant
    AND je.status     = 'Posted'
    AND je.deleted_at IS NULL
    AND je.entry_date >= v_yr_start;

  -- Expenses YTD (COGS 5000 + OpEx 6000, debit-normal)
  SELECT COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)
  INTO v_expenses
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_id
  WHERE jl.account_id IN (v_exp5_id, v_exp6_id)
    AND jl.tenant_id  = v_tenant
    AND je.status     = 'Posted'
    AND je.deleted_at IS NULL
    AND je.entry_date >= v_yr_start;

  v_net_profit := COALESCE(v_revenue, 0) - COALESCE(v_expenses, 0);

  -- ── Build and return payload ─────────────────────────────────────────────
  RETURN jsonb_build_object(

    -- 1. KPI headline row
    'kpis', jsonb_build_array(
      jsonb_build_object('key','cash',        'label','Cash',         'value', COALESCE(v_cash_bal,0),  'href','/accounting/banking',        'up', COALESCE(v_cash_bal,0)   >= 0),
      jsonb_build_object('key','receivables', 'label','Receivables',  'value', COALESCE(v_ar_bal,0),   'href','/accounting/ledger',          'up', true),
      jsonb_build_object('key','payables',    'label','Payables',     'value', COALESCE(v_ap_bal,0),   'href','/accounting/ledger',          'up', false),
      jsonb_build_object('key','inventory',   'label','Inventory',    'value', COALESCE(v_inv_bal,0),  'href','/inventory/items',            'up', true),
      jsonb_build_object('key','revenue',     'label','Revenue YTD',  'value', COALESCE(v_revenue,0),  'href','/accounting/profit-loss',     'up', true),
      jsonb_build_object('key','expenses',    'label','Expenses YTD', 'value', COALESCE(v_expenses,0), 'href','/accounting/profit-loss',     'up', false),
      jsonb_build_object('key','net_profit',  'label','Net Profit',   'value', v_net_profit,            'href','/accounting/profit-loss',     'up', v_net_profit >= 0)
    ),

    -- 2. Cash balance trend (last 30 days)
    'cash_trend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('x', to_char(d,'DD Mon'), 'v', cumbal) ORDER BY d)
      FROM (
        SELECT d::date,
          COALESCE(v_cash_bal, 0) - COALESCE((
            SELECT SUM(jl2.debit) - SUM(jl2.credit)
            FROM public.journal_lines jl2
            JOIN public.journal_entries je2 ON je2.id = jl2.journal_id
            WHERE jl2.account_id = v_cash_id
              AND jl2.tenant_id  = v_tenant
              AND je2.status     = 'Posted'
              AND je2.deleted_at IS NULL
              AND je2.entry_date > d::date
          ), 0) AS cumbal
        FROM generate_series(v_30, v_today, interval '1 day') d
      ) t
    ), '[]'::jsonb),

    -- 3. Receivables aging
    'receivables_aging', (
      SELECT jsonb_build_object(
        'current',   COALESCE(SUM(balance_due) FILTER (WHERE v_today - COALESCE(due_date, date) <= 0),  0),
        'days_1_30', COALESCE(SUM(balance_due) FILTER (WHERE v_today - COALESCE(due_date, date) BETWEEN 1  AND 30), 0),
        'days_31_60',COALESCE(SUM(balance_due) FILTER (WHERE v_today - COALESCE(due_date, date) BETWEEN 31 AND 60), 0),
        'days_61_90',COALESCE(SUM(balance_due) FILTER (WHERE v_today - COALESCE(due_date, date) BETWEEN 61 AND 90), 0),
        'over_90',   COALESCE(SUM(balance_due) FILTER (WHERE v_today - COALESCE(due_date, date) > 90), 0)
      )
      FROM public.invoices
      WHERE tenant_id  = v_tenant
        AND deleted_at IS NULL
        AND voided_at  IS NULL
        AND COALESCE(balance_due, 0) > 0
    ),

    -- 4. Payables aging
    'payables_aging', (
      SELECT jsonb_build_object(
        'current',   COALESCE(SUM(balance_due) FILTER (WHERE v_today - COALESCE(due_date, date) <= 0),  0),
        'days_1_30', COALESCE(SUM(balance_due) FILTER (WHERE v_today - COALESCE(due_date, date) BETWEEN 1  AND 30), 0),
        'days_31_60',COALESCE(SUM(balance_due) FILTER (WHERE v_today - COALESCE(due_date, date) BETWEEN 31 AND 60), 0),
        'days_61_90',COALESCE(SUM(balance_due) FILTER (WHERE v_today - COALESCE(due_date, date) BETWEEN 61 AND 90), 0),
        'over_90',   COALESCE(SUM(balance_due) FILTER (WHERE v_today - COALESCE(due_date, date) > 90), 0)
      )
      FROM public.bills
      WHERE tenant_id  = v_tenant
        AND deleted_at IS NULL
        AND voided_at  IS NULL
        AND COALESCE(balance_due, 0) > 0
    ),

    -- 5. Revenue trend — last 6 calendar months
    'revenue_trend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('x', to_char(m,'Mon YY'), 'v', rev) ORDER BY m)
      FROM (
        SELECT date_trunc('month', je.entry_date)::date m,
               COALESCE(SUM(jl.credit) - SUM(jl.debit), 0) AS rev
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON je.id = jl.journal_id
        WHERE jl.account_id = v_rev_id
          AND jl.tenant_id  = v_tenant
          AND je.status     = 'Posted'
          AND je.deleted_at IS NULL
          AND je.entry_date >= (date_trunc('month', v_today) - interval '5 months')::date
        GROUP BY 1
      ) t
    ), '[]'::jsonb),

    -- 6. Expense trend — last 6 calendar months
    'expense_trend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('x', to_char(m,'Mon YY'), 'v', exp) ORDER BY m)
      FROM (
        SELECT date_trunc('month', je.entry_date)::date m,
               COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) AS exp
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON je.id = jl.journal_id
        WHERE jl.account_id IN (v_exp5_id, v_exp6_id)
          AND jl.tenant_id  = v_tenant
          AND je.status     = 'Posted'
          AND je.deleted_at IS NULL
          AND je.entry_date >= (date_trunc('month', v_today) - interval '5 months')::date
        GROUP BY 1
      ) t
    ), '[]'::jsonb),

    -- 7. Unposted documents (action items for the accountant)
    'unposted', jsonb_build_object(
      'invoices',     (SELECT COUNT(*) FROM public.invoices          WHERE tenant_id=v_tenant AND deleted_at IS NULL AND voided_at IS NULL AND posted_at IS NULL AND status NOT IN ('Cancelled','Voided')),
      'bills',        (SELECT COUNT(*) FROM public.bills             WHERE tenant_id=v_tenant AND deleted_at IS NULL AND voided_at IS NULL AND posted_at IS NULL AND status NOT IN ('Cancelled','Voided')),
      'payments_in',  (SELECT COUNT(*) FROM public.payments_received WHERE tenant_id=v_tenant AND deleted_at IS NULL AND voided_at IS NULL AND posted_at IS NULL),
      'payments_out', (SELECT COUNT(*) FROM public.payments_made     WHERE tenant_id=v_tenant AND deleted_at IS NULL AND voided_at IS NULL AND posted_at IS NULL),
      'journals',     (SELECT COUNT(*) FROM public.journal_entries   WHERE tenant_id=v_tenant AND deleted_at IS NULL AND status = 'Draft'),
      'expenses',     (SELECT COUNT(*) FROM public.expenses          WHERE tenant_id=v_tenant AND deleted_at IS NULL AND voided_at IS NULL AND posted_at IS NULL AND status NOT IN ('Cancelled','Voided'))
    ),

    -- 8. Bank reconciliation status (one row per account)
    'reconciliation', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'account', ba.name,
        'balance', COALESCE(ba.balance, 0),
        'last_reconciled', (
          SELECT MAX(r.reconciled_at)
          FROM public.bank_reconciliations r
          WHERE r.bank_account_id = ba.id AND r.status = 'Reconciled'
        ),
        'last_period', (
          SELECT r.period_name
          FROM public.bank_reconciliations r
          WHERE r.bank_account_id = ba.id AND r.status = 'Reconciled'
          ORDER BY r.period_name DESC LIMIT 1
        ),
        'unreconciled_count', (
          SELECT COUNT(*) FROM public.bank_transactions bt
          WHERE bt.bank_account_id = ba.id
            AND bt.status = 'Posted'
            AND bt.reconciliation_id IS NULL
            AND bt.deleted_at IS NULL
        )
      ) ORDER BY ba.name)
      FROM public.bank_accounts ba
      WHERE ba.tenant_id  = v_tenant
        AND ba.deleted_at IS NULL
        AND ba.status     = 'Active'
    ), '[]'::jsonb),

    -- 9. Recent journals (last 8 posted)
    'recent_journals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',          je.id,
        'number',      je.number,
        'entry_date',  je.entry_date,
        'memo',        je.memo,
        'total_debit', je.total_debit,
        'source_type', je.source_ref_type,
        'status',      je.status
      ) ORDER BY je.entry_date DESC, je.created_at DESC)
      FROM (
        SELECT * FROM public.journal_entries
        WHERE tenant_id  = v_tenant
          AND deleted_at IS NULL
          AND status     = 'Posted'
        ORDER BY entry_date DESC, created_at DESC
        LIMIT 8
      ) je
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_accounting_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_accounting_dashboard() TO authenticated;
