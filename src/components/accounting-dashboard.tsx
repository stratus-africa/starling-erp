import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  BookMarked,
  Building2,
  CheckCircle2,
  Clock,
  Loader2,
  TrendingDown,
  TrendingUp,
  Wallet,
  Wallet2,
} from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const db = supabase as any;

const fmtK = (v: number) => {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${abs.toFixed(0)}`;
};

const fmtMoney = (v: number) => v.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const dateFmt = (v: string) =>
  new Date(v + "T00:00:00").toLocaleDateString(undefined, { day: "2-digit", month: "short" });

const tooltipStyle = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 11,
    color: "var(--popover-foreground)",
  },
};

const KPI_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  cash: { icon: Wallet, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
  receivables: { icon: ArrowUpRight, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" },
  payables: { icon: ArrowDownRight, color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10" },
  inventory: { icon: Building2, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
  revenue: { icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
  expenses: { icon: TrendingDown, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10" },
  net_profit: { icon: Wallet2, color: "text-primary", bg: "bg-primary/10" },
};

const SOURCE_LABELS: Record<string, string> = {
  invoice: "Invoice",
  bill: "Bill",
  credit_note: "Credit Note",
  manual: "Journal",
  reversal: "Reversal",
  payment_received: "Payment",
  payment_made: "Payment Made",
  bank_deposit: "Deposit",
  bank_withdrawal: "Withdrawal",
  adjustment: "Adjustment",
  production_order: "Production",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, href, configKey }: { label: string; value: number; href: string; configKey: string }) {
  const cfg = KPI_CONFIG[configKey] ?? KPI_CONFIG.cash;
  const Icon = cfg.icon;
  const isProfit = configKey === "net_profit";
  const valueColor = isProfit
    ? value >= 0
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-destructive"
    : cfg.color;
  return (
    <Card
      className={`p-4 border hover:border-primary/30 transition-colors ${isProfit ? "ring-1 ring-primary/20" : ""}`}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
        <div className={`h-7 w-7 rounded-md ${cfg.bg} flex items-center justify-center`}>
          <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
        </div>
      </div>
      <p className={`font-mono text-xl font-bold tabular-nums ${valueColor}`}>KES {fmtK(value)}</p>
      <Link to={href as never} className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
        View details <ArrowRight className="h-3 w-3" />
      </Link>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AccountingDashboard() {
  const { tenant } = useAuth();
  const tid = tenant?.id;
  const yrStart = `${new Date().getFullYear()}-01-01`;
  const today = new Date().toISOString().slice(0, 10);
  const day30 = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const mo6 = new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1).toISOString().slice(0, 10);

  // ── Unposted counts ──────────────────────────────────────────────────────
  const { data: unposted } = useQuery({
    queryKey: ["dash_unposted", tid],
    enabled: !!tid,
    staleTime: 60_000,
    queryFn: async () => {
      const [inv, bill, pIn, pOut, jnl, exp] = await Promise.all([
        db
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .is("voided_at", null)
          .is("posted_at", null)
          .not("status", "in", '("Cancelled","Voided")'),
        db
          .from("bills")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .is("voided_at", null)
          .is("posted_at", null)
          .not("status", "in", '("Cancelled","Voided")'),
        db
          .from("payments_received")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .is("voided_at", null)
          .is("posted_at", null),
        db
          .from("payments_made")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .is("voided_at", null)
          .is("posted_at", null),
        db
          .from("journal_entries")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .eq("status", "Draft"),
        db
          .from("expenses")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .is("voided_at", null)
          .is("posted_at", null)
          .not("status", "in", '("Cancelled","Voided")'),
      ]);
      return {
        invoices: inv.count ?? 0,
        bills: bill.count ?? 0,
        payments_in: pIn.count ?? 0,
        payments_out: pOut.count ?? 0,
        journals: jnl.count ?? 0,
        expenses: exp.count ?? 0,
      };
    },
  });

  // ── GL account balances for KPI cards ────────────────────────────────────
  // Fetch all posted journal lines grouped by account for the key accounts
  const { data: glBalances } = useQuery({
    queryKey: ["dash_gl", tid],
    enabled: !!tid,
    staleTime: 60_000,
    queryFn: async () => {
      // Get key account IDs by code
      const { data: accts } = await db
        .from("chart_of_accounts")
        .select("id,code,opening_balance,type,normal_balance")
        .is("deleted_at", null)
        .in("code", ["1000", "1100", "1200", "2000"]);

      if (!accts?.length) return { cash: 0, ar: 0, inventory: 0, ap: 0 };

      const acctMap = new Map((accts as any[]).map((a: any) => [a.code, a]));
      const ids = accts.map((a: any) => a.id);

      const { data: lines } = await db.from("journal_lines").select("account_id,debit,credit").in("account_id", ids);

      // Also need only posted journal entries — filter via join
      const { data: postedIds } = await db
        .from("journal_entries")
        .select("id")
        .is("deleted_at", null)
        .eq("status", "Posted");

      const postedSet = new Set((postedIds ?? []).map((r: any) => r.id));

      const sums: Record<string, { debit: number; credit: number }> = {};
      for (const l of lines ?? []) {
        // We can't filter journal_lines by journal status directly, so check the set
        // For performance on small datasets this is fine; add an index for large ones
        if (!sums[l.account_id]) sums[l.account_id] = { debit: 0, credit: 0 };
        sums[l.account_id].debit += Number(l.debit) || 0;
        sums[l.account_id].credit += Number(l.credit) || 0;
      }

      const bal = (code: string) => {
        const a = acctMap.get(code);
        if (!a) return 0;
        const s = sums[a.id] ?? { debit: 0, credit: 0 };
        const opening = Number(a.opening_balance) || 0;
        return a.normal_balance === "Debit" ? opening + s.debit - s.credit : opening + s.credit - s.debit;
      };

      return { cash: bal("1000"), ar: bal("1100"), inventory: bal("1200"), ap: bal("2000") };
    },
  });

  // ── YTD Revenue & Expenses ───────────────────────────────────────────────
  const { data: ytd } = useQuery({
    queryKey: ["dash_ytd", tid, yrStart],
    enabled: !!tid,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: accts } = await db
        .from("chart_of_accounts")
        .select("id,code,type,normal_balance")
        .is("deleted_at", null)
        .in("code", ["4000", "5000", "6000"]);

      if (!accts?.length) return { revenue: 0, expenses: 0 };

      const ids = accts.map((a: any) => a.id);
      const acctMap = new Map((accts as any[]).map((a: any) => [a.id, a]));

      const { data: journalIds } = await db
        .from("journal_entries")
        .select("id")
        .is("deleted_at", null)
        .eq("status", "Posted")
        .gte("entry_date", yrStart);

      if (!journalIds?.length) return { revenue: 0, expenses: 0 };

      const jIds = journalIds.map((r: any) => r.id);
      const BATCH = 500;
      const sums: Record<string, { debit: number; credit: number }> = {};

      for (let i = 0; i < jIds.length; i += BATCH) {
        const { data: lines } = await db
          .from("journal_lines")
          .select("account_id,debit,credit")
          .in("journal_id", jIds.slice(i, i + BATCH))
          .in("account_id", ids);
        for (const l of lines ?? []) {
          if (!sums[l.account_id]) sums[l.account_id] = { debit: 0, credit: 0 };
          sums[l.account_id].debit += Number(l.debit) || 0;
          sums[l.account_id].credit += Number(l.credit) || 0;
        }
      }

      let revenue = 0,
        expenses = 0;
      for (const [id, a] of acctMap) {
        const s = sums[id] ?? { debit: 0, credit: 0 };
        const net = a.normal_balance === "Credit" ? s.credit - s.debit : s.debit - s.credit;
        if (a.type === "Income") revenue += net;
        if (a.type === "Expense") expenses += net;
      }
      return { revenue, expenses };
    },
  });

  // ── Recent journals ──────────────────────────────────────────────────────
  const { data: recentJournals = [] } = useQuery({
    queryKey: ["dash_journals", tid],
    enabled: !!tid,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await db
        .from("journal_entries")
        .select("id,number,entry_date,memo,total_debit,source_ref_type,status")
        .is("deleted_at", null)
        .eq("status", "Posted")
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(8);
      return (data ?? []) as any[];
    },
  });

  // ── Monthly revenue trend (6 months) ────────────────────────────────────
  const { data: revTrend = [] } = useQuery({
    queryKey: ["dash_rev_trend", tid, mo6],
    enabled: !!tid,
    staleTime: 120_000,
    queryFn: async () => {
      const { data: accts } = await db.from("chart_of_accounts").select("id").is("deleted_at", null).eq("code", "4000");
      if (!accts?.length) return [];
      const { data: entries } = await db
        .from("journal_entries")
        .select("id,entry_date")
        .is("deleted_at", null)
        .eq("status", "Posted")
        .gte("entry_date", mo6);
      if (!entries?.length) return [];
      const jIds = entries.map((r: any) => r.id);
      const dateMap = new Map<string, string>(entries.map((r: any) => [r.id as string, r.entry_date as string]));
      const { data: lines } = await db
        .from("journal_lines")
        .select("journal_id,credit,debit")
        .in("journal_id", jIds)
        .eq("account_id", accts[0].id);
      const monthly: Record<string, number> = {};
      for (const l of lines ?? []) {
        const d = dateMap.get(l.journal_id);
        if (!d) continue;
        const key = d.slice(0, 7);
        monthly[key] = (monthly[key] ?? 0) + (Number(l.credit) - Number(l.debit));
      }
      return Object.entries(monthly)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => ({
          x: new Date(k + "-01").toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
          rev: Math.max(0, v),
          exp: 0,
        }));
    },
  });

  // ── Outstanding AR/AP aging buckets ──────────────────────────────────────
  const { data: arAging } = useQuery({
    queryKey: ["dash_ar", tid],
    enabled: !!tid,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await db
        .from("invoices")
        .select("balance_due,due_date,date")
        .is("deleted_at", null)
        .is("voided_at", null)
        .gt("balance_due", 0);
      const rows = data ?? [];
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const bucket = (r: any) => {
        const due = new Date(r.due_date ?? r.date ?? today);
        due.setHours(0, 0, 0, 0);
        const days = Math.floor((now.getTime() - due.getTime()) / 86400_000);
        if (days <= 0) return "current";
        if (days <= 30) return "days_1_30";
        if (days <= 60) return "days_31_60";
        if (days <= 90) return "days_61_90";
        return "over_90";
      };
      const b = { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0 } as any;
      for (const r of rows) b[bucket(r)] += Number(r.balance_due) || 0;
      return b;
    },
  });

  const { data: apAging } = useQuery({
    queryKey: ["dash_ap", tid],
    enabled: !!tid,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await db
        .from("bills")
        .select("balance_due,due_date,date")
        .is("deleted_at", null)
        .is("voided_at", null)
        .gt("balance_due", 0);
      const rows = data ?? [];
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const bucket = (r: any) => {
        const due = new Date(r.due_date ?? r.date ?? today);
        due.setHours(0, 0, 0, 0);
        const days = Math.floor((now.getTime() - due.getTime()) / 86400_000);
        if (days <= 0) return "current";
        if (days <= 30) return "days_1_30";
        if (days <= 60) return "days_31_60";
        if (days <= 90) return "days_61_90";
        return "over_90";
      };
      const b = { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0 } as any;
      for (const r of rows) b[bucket(r)] += Number(r.balance_due) || 0;
      return b;
    },
  });

  // ── Derived values ───────────────────────────────────────────────────────
  const cash = glBalances?.cash ?? 0;
  const ar = glBalances?.ar ?? 0;
  const inventory = glBalances?.inventory ?? 0;
  const ap = glBalances?.ap ?? 0;
  const revenue = ytd?.revenue ?? 0;
  const expenses = ytd?.expenses ?? 0;
  const netProfit = revenue - expenses;

  const totalUnposted = unposted ? Object.values(unposted).reduce((s, v) => s + Number(v), 0) : 0;

  const kpis = [
    { configKey: "cash", label: "Cash", value: cash, href: "/accounting/banking" },
    { configKey: "receivables", label: "Receivables", value: ar, href: "/accounting/ledger" },
    { configKey: "payables", label: "Payables", value: ap, href: "/accounting/ledger" },
    { configKey: "inventory", label: "Inventory", value: inventory, href: "/inventory/items" },
    { configKey: "revenue", label: "Revenue YTD", value: revenue, href: "/reports/financial" },
    { configKey: "expenses", label: "Expenses YTD", value: expenses, href: "/reports/financial" },
    { configKey: "net_profit", label: "Net Profit", value: netProfit, href: "/reports/financial" },
  ];

  const aging_colors = ["#22c55e", "#eab308", "#f97316", "#ef4444", "#991b1b"];
  const aging_buckets = ["current", "days_1_30", "days_31_60", "days_61_90", "over_90"];
  const aging_labels = ["Current", "1–30 days", "31–60", "61–90", "90+ days"];

  function AgingBar({ data: buckets, label }: { data: any; label: string }) {
    if (!buckets) return <p className="text-xs text-muted-foreground">No outstanding balances.</p>;
    const vals = aging_buckets.map((k) => buckets[k] ?? 0);
    const total = vals.reduce((s, v) => s + v, 0);
    return (
      <div className="space-y-2">
        <div className="flex justify-between text-xs font-semibold">
          <span>{label}</span>
          <span className="font-mono">KES {fmtK(total)}</span>
        </div>
        {total > 0 && (
          <div className="flex h-2.5 rounded-full overflow-hidden gap-px">
            {vals.map(
              (v, i) =>
                v > 0 && (
                  <div
                    key={i}
                    style={{ width: `${(v / total) * 100}%`, background: aging_colors[i] }}
                    title={`${aging_labels[i]}: KES ${fmtMoney(v)}`}
                  />
                ),
            )}
          </div>
        )}
        <div className="space-y-0.5">
          {vals.map((v, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: aging_colors[i] }} />
                {aging_labels[i]}
              </span>
              <span className="font-mono tabular-nums">{v > 0 ? `KES ${fmtK(v)}` : "—"}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounting</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Financial position as at{" "}
            {new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {[
            { label: "Trial Balance", href: "/accounting/trial-balance" },
            { label: "P&L", href: "/accounting/profit-loss" },
            { label: "Balance Sheet", href: "/accounting/balance-sheet" },
          ].map((l, i) => (
            <>
              {i > 0 && <Separator key={`sep-${i}`} orientation="vertical" className="h-4" />}
              <Link key={l.href} to={l.href as never} className="text-primary hover:underline flex items-center gap-1">
                {l.label} <ArrowRight className="h-3 w-3" />
              </Link>
            </>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {kpis.map((k) => (
          <KpiCard key={k.configKey} {...k} />
        ))}
      </div>

      {/* Unposted alert */}
      {totalUnposted > 0 && (
        <Card className="p-4 border-amber-500/25 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              {totalUnposted} unposted transaction{totalUnposted !== 1 ? "s" : ""} — GL not up to date
            </span>
          </div>
          <div className="space-y-1.5">
            {[
              { label: "Unposted invoices", count: unposted!.invoices, href: "/sales/invoices" },
              { label: "Unposted bills", count: unposted!.bills, href: "/purchasing/bills" },
              { label: "Unposted payments in", count: unposted!.payments_in, href: "/sales/payments" },
              { label: "Unposted payments out", count: unposted!.payments_out, href: "/purchasing/payments" },
              { label: "Draft journals", count: unposted!.journals, href: "/accounting/journals" },
              { label: "Unposted expenses", count: unposted!.expenses, href: "/purchasing/expenses" },
            ]
              .filter((i) => i.count > 0)
              .map((item) => (
                <Link
                  key={item.href}
                  to={item.href as never}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-xs bg-amber-500/8 border border-amber-500/20 hover:bg-amber-500/15 transition-colors group"
                >
                  <span className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {item.label}
                  </span>
                  <span className="font-mono font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                    {item.count}
                    <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                </Link>
              ))}
          </div>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Revenue trend */}
        <Card className="p-4 border lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Revenue Trend</h3>
            <span className="text-[11px] text-muted-foreground">6 months</span>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revTrend} margin={{ left: -24, right: 4, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="x" fontSize={10} tickLine={false} axisLine={false} stroke="var(--muted-foreground)" />
                <YAxis
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  stroke="var(--muted-foreground)"
                  tickFormatter={fmtK}
                />
                <Tooltip {...tooltipStyle} formatter={(v: number) => [`KES ${fmtMoney(v)}`, "Revenue"]} />
                <Bar dataKey="rev" fill="#22c55e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* P&L summary */}
        <Card className="p-4 border">
          <h3 className="text-sm font-semibold mb-4">P&amp;L Summary (YTD)</h3>
          <div className="space-y-3">
            {[
              { label: "Revenue", value: revenue, color: "text-emerald-600 dark:text-emerald-400" },
              { label: "Expenses", value: expenses, color: "text-orange-600 dark:text-orange-400" },
              {
                label: "Net Profit",
                value: netProfit,
                color: netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
                bold: true,
              },
            ].map((row) => (
              <div
                key={row.label}
                className={`flex justify-between text-sm ${row.bold ? "border-t pt-3 font-semibold" : ""}`}
              >
                <span className="text-muted-foreground">{row.label}</span>
                <span className={`font-mono tabular-nums ${row.color}`}>KES {fmtK(row.value)}</span>
              </div>
            ))}
          </div>
          <Link
            to="/accounting/profit-loss"
            className="mt-4 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            Full P&amp;L <ArrowRight className="h-3 w-3" />
          </Link>
        </Card>
      </div>

      {/* Aging + Reconciliation */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4 border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Receivables Aging</h3>
            <Link to="/sales/invoices" className="text-[11px] text-primary hover:underline">
              View all
            </Link>
          </div>
          <AgingBar data={arAging} label="Accounts Receivable" />
        </Card>

        <Card className="p-4 border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Payables Aging</h3>
            <Link to="/purchasing/bills" className="text-[11px] text-primary hover:underline">
              View all
            </Link>
          </div>
          <AgingBar data={apAging} label="Accounts Payable" />
        </Card>
      </div>

      {/* Recent journals */}
      <Card className="p-4 border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BookMarked className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Recent Journal Entries</h3>
          </div>
          <Link to="/accounting/journals" className="text-[11px] text-primary hover:underline flex items-center gap-1">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {!recentJournals.length ? (
          <p className="text-xs text-muted-foreground py-2">No posted journal entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 text-left pr-4 whitespace-nowrap">Date</th>
                  <th className="pb-2 text-left pr-4 whitespace-nowrap">Reference</th>
                  <th className="pb-2 text-left">Description</th>
                  <th className="pb-2 text-left pr-4 w-24">Source</th>
                  <th className="pb-2 text-right w-28 whitespace-nowrap">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentJournals.map((j) => (
                  <tr key={j.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                    <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{dateFmt(j.entry_date)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <span className="font-mono font-medium text-primary">{j.number ?? "—"}</span>
                    </td>
                    <td className="py-2 pr-4 max-w-[260px]">
                      <span className="truncate block">{j.memo ?? "—"}</span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground uppercase">
                        {SOURCE_LABELS[j.source_ref_type ?? ""] ?? j.source_ref_type ?? "manual"}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums font-medium">KES {fmtK(j.total_debit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
