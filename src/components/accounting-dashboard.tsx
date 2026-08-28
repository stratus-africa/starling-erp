import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle, ArrowRight, ArrowUpRight, ArrowDownRight,
  BookMarked, Building2, CheckCircle2, Clock, Landmark,
  Loader2, Scale, TrendingDown, TrendingUp, Wallet, Wallet2,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Kpi {
  key: string;
  label: string;
  value: number;
  href: string;
  up: boolean;
}

interface AgingBuckets {
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_60: number;
  over_90: number;
}

interface Trend { x: string; v: number; }

interface Unposted {
  invoices: number;
  bills: number;
  payments_in: number;
  payments_out: number;
  journals: number;
  expenses: number;
}

interface ReconAccount {
  account: string;
  balance: number;
  last_reconciled: string | null;
  last_period: string | null;
  unreconciled_count: number;
}

interface RecentJournal {
  id: string;
  number: string | null;
  entry_date: string;
  memo: string | null;
  total_debit: number;
  source_type: string | null;
  status: string;
}

interface DashboardPayload {
  kpis:               Kpi[];
  cash_trend:         Trend[];
  receivables_aging:  AgingBuckets;
  payables_aging:     AgingBuckets;
  revenue_trend:      Trend[];
  expense_trend:      Trend[];
  unposted:           Unposted;
  reconciliation:     ReconAccount[];
  recent_journals:    RecentJournal[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const db = supabase as any;

const fmtK = (v: number) => {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${abs.toFixed(0)}`;
};

const fmtMoney = (v: number) =>
  v.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

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
  cash:       { icon: Wallet,     color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
  receivables:{ icon: ArrowUpRight,color: "text-blue-600 dark:text-blue-400",      bg: "bg-blue-500/10" },
  payables:   { icon: ArrowDownRight,color:"text-red-600 dark:text-red-400",       bg: "bg-red-500/10" },
  inventory:  { icon: Building2,  color: "text-amber-600 dark:text-amber-400",     bg: "bg-amber-500/10" },
  revenue:    { icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
  expenses:   { icon: TrendingDown,color:"text-orange-600 dark:text-orange-400",   bg: "bg-orange-500/10" },
  net_profit: { icon: Wallet2,    color: "text-primary",                            bg: "bg-primary/10" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ kpi }: { kpi: Kpi }) {
  const cfg = KPI_CONFIG[kpi.key] ?? KPI_CONFIG.cash;
  const Icon = cfg.icon;
  const isProfit = kpi.key === "net_profit";
  const valueColor = isProfit
    ? kpi.value >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
    : cfg.color;

  return (
    <Card className={`p-4 border hover:border-primary/30 transition-colors ${isProfit ? "ring-1 ring-primary/20" : ""}`}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {kpi.label}
        </span>
        <div className={`h-7 w-7 rounded-md ${cfg.bg} flex items-center justify-center`}>
          <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
        </div>
      </div>
      <p className={`font-mono text-xl font-bold tabular-nums ${valueColor}`}>
        {kpi.value < 0 && !isProfit ? "" : ""}
        KES {fmtK(kpi.value)}
      </p>
      <Link to={kpi.href as never}
        className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
        View details <ArrowRight className="h-3 w-3" />
      </Link>
    </Card>
  );
}

function AgingBar({ buckets, label, color }: {
  buckets: AgingBuckets;
  label: string;
  color: string;
}) {
  const data = [
    { name: "Current",   value: buckets.current     ?? 0 },
    { name: "1–30 days", value: buckets.days_1_30   ?? 0 },
    { name: "31–60",     value: buckets.days_31_60  ?? 0 },
    { name: "61–90",     value: (buckets as any).days_61_90 ?? 0 },
    { name: "90+ days",  value: buckets.over_90     ?? 0 },
  ];
  const total = data.reduce((s, d) => s + d.value, 0);
  const colors = ["#22c55e","#eab308","#f97316","#ef4444","#991b1b"];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">{label}</p>
        <p className="font-mono text-xs font-semibold">KES {fmtK(total)}</p>
      </div>
      {/* Stacked bar */}
      {total > 0 && (
        <div className="flex h-2.5 rounded-full overflow-hidden gap-px">
          {data.map((d, i) =>
            d.value > 0 ? (
              <div
                key={d.name}
                style={{ width: `${(d.value / total) * 100}%`, background: colors[i] }}
                title={`${d.name}: KES ${fmtMoney(d.value)}`}
              />
            ) : null
          )}
        </div>
      )}
      {/* Bucket list */}
      <div className="grid grid-cols-1 gap-0.5">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: colors[i] }} />
              {d.name}
            </span>
            <span className="font-mono tabular-nums">{d.value > 0 ? `KES ${fmtK(d.value)}` : "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function UnpostedAlert({ unposted }: { unposted: Unposted }) {
  const items: { label: string; count: number; href: string }[] = [
    { label: "Unposted invoices",     count: unposted.invoices,     href: "/sales/invoices" },
    { label: "Unposted bills",        count: unposted.bills,        href: "/purchasing/bills" },
    { label: "Unposted payments in",  count: unposted.payments_in,  href: "/sales/payments" },
    { label: "Unposted payments out", count: unposted.payments_out, href: "/purchasing/payments" },
    { label: "Draft journals",        count: unposted.journals,     href: "/accounting/journals" },
    { label: "Unposted expenses",     count: unposted.expenses,     href: "/purchasing/expenses" },
  ].filter((i) => i.count > 0);

  if (!items.length) {
    return (
      <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        All transactions are posted. GL is up to date.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <Link key={item.href} to={item.href as never}
          className="flex items-center justify-between rounded-md px-3 py-2 text-xs bg-amber-500/8 border border-amber-500/20 hover:bg-amber-500/15 transition-colors group">
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
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AccountingDashboard() {
  const { tenant } = useAuth();

  const { data, isLoading, error } = useQuery<DashboardPayload>({
    queryKey: ["accounting_dashboard", tenant?.id],
    enabled: !!tenant?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("get_accounting_dashboard");
      if (error) throw error;
      return data as DashboardPayload;
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading accounting dashboard…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <AlertCircle className="mr-2 h-4 w-4 text-destructive" />
        Failed to load dashboard.
      </div>
    );
  }

  const { kpis, cash_trend, receivables_aging, payables_aging,
          revenue_trend, expense_trend, unposted, reconciliation, recent_journals } = data;

  // Build combined revenue vs expense chart
  const revExpData = (() => {
    const map = new Map<string, { x: string; rev: number; exp: number }>();
    for (const p of revenue_trend ?? []) map.set(p.x, { x: p.x, rev: p.v, exp: 0 });
    for (const p of expense_trend ?? []) {
      const row = map.get(p.x) ?? { x: p.x, rev: 0, exp: 0 };
      row.exp = p.v;
      map.set(p.x, row);
    }
    return [...map.values()];
  })();

  const totalUnposted = Object.values(unposted ?? {}).reduce((s, v) => s + Number(v), 0);

  const SOURCE_LABELS: Record<string, string> = {
    invoice: "Invoice", bill: "Bill", credit_note: "Credit Note",
    manual: "Journal", reversal: "Reversal",
    payment_received: "Payment", payment_made: "Payment Made",
    bank_deposit: "Deposit", bank_withdrawal: "Withdrawal",
    adjustment: "Adjustment", production_order: "Production",
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 overflow-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounting</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Financial position as at {new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/accounting/trial-balance" className="text-xs text-primary hover:underline flex items-center gap-1">
            Trial Balance <ArrowRight className="h-3 w-3" />
          </Link>
          <Separator orientation="vertical" className="h-4" />
          <Link to="/accounting/profit-loss" className="text-xs text-primary hover:underline flex items-center gap-1">
            P&amp;L <ArrowRight className="h-3 w-3" />
          </Link>
          <Separator orientation="vertical" className="h-4" />
          <Link to="/accounting/balance-sheet" className="text-xs text-primary hover:underline flex items-center gap-1">
            Balance Sheet <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {(kpis ?? []).map((kpi) => <KpiCard key={kpi.key} kpi={kpi} />)}
      </div>

      {/* ── Unposted alert ── */}
      {totalUnposted > 0 && (
        <Card className="p-4 border-amber-500/25 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              {totalUnposted} unposted transaction{totalUnposted !== 1 ? "s" : ""} — GL not up to date
            </span>
          </div>
          <UnpostedAlert unposted={unposted} />
        </Card>
      )}

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Cash position trend */}
        <Card className="p-4 border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Cash Position</h3>
            <span className="text-[11px] text-muted-foreground">30 days</span>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cash_trend ?? []} margin={{ left: -24, right: 4, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="x" fontSize={10} tickLine={false} axisLine={false} stroke="var(--muted-foreground)"
                  interval="preserveStartEnd" />
                <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="var(--muted-foreground)"
                  tickFormatter={(v) => fmtK(v)} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => [`KES ${fmtMoney(v)}`, "Cash"]} />
                <Area type="monotone" dataKey="v" stroke="#22c55e" strokeWidth={2}
                  fill="url(#cashGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Revenue vs Expenses */}
        <Card className="p-4 border lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Revenue vs Expenses</h3>
            <span className="text-[11px] text-muted-foreground">6 months</span>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revExpData} margin={{ left: -24, right: 4, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="x" fontSize={10} tickLine={false} axisLine={false} stroke="var(--muted-foreground)" />
                <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="var(--muted-foreground)"
                  tickFormatter={(v) => fmtK(v)} />
                <Tooltip {...tooltipStyle}
                  formatter={(v: number, name: string) => [`KES ${fmtMoney(v)}`, name === "rev" ? "Revenue" : "Expenses"]} />
                <Bar dataKey="rev" fill="#22c55e" radius={[3,3,0,0]} name="rev" />
                <Bar dataKey="exp" fill="#f97316" radius={[3,3,0,0]} name="exp" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />Revenue</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500" />Expenses</span>
          </div>
        </Card>
      </div>

      {/* ── Aging + Reconciliation row ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Receivables aging */}
        <Card className="p-4 border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Receivables Aging</h3>
            <Link to="/sales/invoices" className="text-[11px] text-primary hover:underline">View all</Link>
          </div>
          {receivables_aging ? (
            <AgingBar buckets={receivables_aging} label="Accounts Receivable" color="blue" />
          ) : (
            <p className="text-xs text-muted-foreground">No outstanding receivables.</p>
          )}
        </Card>

        {/* Payables aging */}
        <Card className="p-4 border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Payables Aging</h3>
            <Link to="/purchasing/bills" className="text-[11px] text-primary hover:underline">View all</Link>
          </div>
          {payables_aging ? (
            <AgingBar buckets={payables_aging} label="Accounts Payable" color="red" />
          ) : (
            <p className="text-xs text-muted-foreground">No outstanding payables.</p>
          )}
        </Card>

        {/* Bank reconciliation status */}
        <Card className="p-4 border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Bank Reconciliation</h3>
            <Link to="/accounting/reconciliation" className="text-[11px] text-primary hover:underline">
              Open
            </Link>
          </div>
          {!reconciliation?.length ? (
            <p className="text-xs text-muted-foreground">No active bank accounts.</p>
          ) : (
            <div className="space-y-3">
              {reconciliation.map((acct) => (
                <div key={acct.account} className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${
                      acct.unreconciled_count === 0
                        ? "bg-emerald-500/10"
                        : "bg-amber-500/10"
                    }`}>
                      {acct.unreconciled_count === 0
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        : <Clock className="h-3.5 w-3.5 text-amber-600" />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{acct.account}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {acct.last_period ? `Last reconciled: ${acct.last_period}` : "Never reconciled"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-xs font-semibold tabular-nums">
                      KES {fmtK(acct.balance)}
                    </p>
                    {acct.unreconciled_count > 0 && (
                      <p className="text-[10px] text-amber-600">
                        {acct.unreconciled_count} unreconciled
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Recent journals ── */}
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
        {!recent_journals?.length ? (
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
                {recent_journals.map((j) => (
                  <tr key={j.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                    <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                      {dateFmt(j.entry_date)}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <span className="font-mono font-medium text-primary">{j.number ?? "—"}</span>
                    </td>
                    <td className="py-2 pr-4 max-w-[260px]">
                      <span className="truncate block">{j.memo ?? "—"}</span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground uppercase">
                        {SOURCE_LABELS[j.source_type ?? ""] ?? (j.source_type ?? "manual")}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums font-medium">
                      KES {fmtK(j.total_debit)}
                    </td>
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
