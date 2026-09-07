import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight, BarChart3, BookOpen, CalendarDays, Download, FileBarChart,
  Info, LayoutList, Percent, Printer, Scale, Search, Star, TrendingUp,
  WalletCards,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatCompactBaseCurrency } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type Category = "Accounting" | "Tax" | "Management";
type Report = {
  id: string;
  title: string;
  description: string;
  url: string;
  category: Category;
  icon: typeof BookOpen;
  iconClass: string;
  updated: string;
};

const REPORTS: Report[] = [
  { id: "general-ledger", title: "General Ledger", description: "Full transaction-level view of every posted journal entry with account, source, and running balance detail.", url: "/accounting/ledger", category: "Accounting", icon: BookOpen, iconClass: "bg-blue-500/10 text-blue-700", updated: "Updated live" },
  { id: "trial-balance", title: "Trial Balance", description: "Aggregated debit and credit balances for every account at a selected date.", url: "/accounting/trial-balance", category: "Accounting", icon: Scale, iconClass: "bg-violet-500/10 text-violet-700", updated: "Updated live" },
  { id: "profit-loss", title: "Profit & Loss", description: "Revenue, cost of goods sold, operating expenses, and net profit for a selected period.", url: "/accounting/profit-loss", category: "Management", icon: TrendingUp, iconClass: "bg-emerald-500/10 text-emerald-700", updated: "Updated live" },
  { id: "balance-sheet", title: "Balance Sheet", description: "Point-in-time snapshot of assets, liabilities, equity, and current year profit.", url: "/accounting/balance-sheet", category: "Management", icon: LayoutList, iconClass: "bg-amber-500/10 text-amber-700", updated: "Updated live" },
  { id: "vat-report", title: "VAT Report", description: "Output VAT, input VAT, and net VAT payable from posted VAT control account entries.", url: "/accounting/tax-report", category: "Tax", icon: Percent, iconClass: "bg-rose-500/10 text-rose-700", updated: "Updated live" },
];

const db = supabase as any;
const keyFor = (tenantId: string, type: string) => `financial-reports:${tenantId}:${type}`;

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function Kpi({ label, value, icon: Icon, tone, loading, currency }: { label: string; value: number; icon: typeof BarChart3; tone: string; loading: boolean; currency: string }) {
  return (
    <Card className="flex min-h-[118px] flex-col justify-between border-border/70 bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-md ${tone}`}><Icon className="h-4 w-4" /></span>
      </div>
      {loading ? <Skeleton className="h-8 w-28" /> : <p className="font-mono text-2xl font-bold tabular-nums text-foreground">{value === 0 ? "—" : formatCompactBaseCurrency(value, currency)}</p>}
      <span className="text-xs text-muted-foreground">Posted entries · current fiscal year</span>
    </Card>
  );
}

export function FinancialReportsHub() {
  const { tenant, user } = useAuth();
  const tenantId = tenant?.id;
  const today = new Date().toISOString().slice(0, 10);
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"All" | Category>("All");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    try {
      setFavorites(JSON.parse(localStorage.getItem(keyFor(tenantId, "favorites")) ?? "[]"));
      setRecent(JSON.parse(localStorage.getItem(keyFor(tenantId, "recent")) ?? "[]"));
    } catch {
      setFavorites([]);
      setRecent([]);
    }
  }, [tenantId]);

  const financials = useQuery({
    queryKey: ["financial-report-summary", tenantId, yearStart, today],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data: accounts, error: accountError } = await db
        .from("chart_of_accounts")
        .select("id,code,type")
        .is("deleted_at", null)
        .in("code", ["4000", "5000", "6000", "1150", "2100"]);
      if (accountError) throw accountError;
      const accountRows = accounts ?? [];
      if (!accountRows.length) return { revenue: 0, expenses: 0, vat: 0 };
      const ids = accountRows.map((row: any) => row.id);
      const accountMap = new Map(accountRows.map((row: any) => [row.id, row]));
      const { data: entries, error: entryError } = await db
        .from("journal_entries")
        .select("id")
        .is("deleted_at", null)
        .eq("status", "Posted")
        .gte("entry_date", yearStart)
        .lte("entry_date", today);
      if (entryError) throw entryError;
      const entryIds = (entries ?? []).map((row: any) => row.id);
      if (!entryIds.length) return { revenue: 0, expenses: 0, vat: 0 };
      const { data: lines, error: lineError } = await db
        .from("journal_lines")
        .select("account_id,debit,credit")
        .in("journal_id", entryIds)
        .in("account_id", ids);
      if (lineError) throw lineError;
      let revenue = 0;
      let expenses = 0;
      let vatOutput = 0;
      let vatInput = 0;
      for (const line of lines ?? []) {
        const account = accountMap.get(line.account_id);
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;
        if (account?.type === "Income") revenue += credit - debit;
        if (account?.type === "Expense") expenses += debit - credit;
        if (account?.code === "2100") vatOutput += credit - debit;
        if (account?.code === "1150") vatInput += debit - credit;
      }
      return { revenue, expenses, vat: vatOutput - vatInput };
    },
  });

  const visibleReports = useMemo(() => REPORTS.filter((report) => {
    const matchesCategory = category === "All" || report.category === category;
    const query = search.trim().toLowerCase();
    return matchesCategory && (!query || `${report.title} ${report.description} ${report.category}`.toLowerCase().includes(query));
  }), [category, search]);
  const favoriteReports = REPORTS.filter((report) => favorites.includes(report.id));
  const recentReports = recent.map((id) => REPORTS.find((report) => report.id === id)).filter(Boolean) as Report[];
  const baseCurrency = tenant?.currency ?? "KES";

  const toggleFavorite = (id: string) => {
    if (!tenantId) return;
    const next = favorites.includes(id) ? favorites.filter((item) => item !== id) : [...favorites, id];
    setFavorites(next);
    localStorage.setItem(keyFor(tenantId, "favorites"), JSON.stringify(next));
  };

  const recordRecent = (id: string) => {
    if (!tenantId) return;
    const next = [id, ...recent.filter((item) => item !== id)].slice(0, 5);
    setRecent(next);
    localStorage.setItem(keyFor(tenantId, "recent"), JSON.stringify(next));
  };

  const openForPrint = (report: Report) => {
    recordRecent(report.id);
    const popup = window.open(report.url, "financial-report-print");
    if (popup) popup.addEventListener("load", () => popup.print(), { once: true });
  };

  return (
    <div className="min-h-full bg-muted/20 p-4 md:p-6 xl:p-8">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6">
        <header className="flex flex-col justify-between gap-4 border-b border-border/70 pb-5 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Financial Reports</h1>
            <p className="mt-1 text-sm text-muted-foreground">View, analyze and export your accounting reports.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-card p-2 shadow-sm">
            <CalendarDays className="ml-1 h-4 w-4 text-primary" />
            <span className="px-1 text-sm font-semibold">FY {new Date().getFullYear()}</span>
            <span className="border-l px-2 text-xs text-muted-foreground">{formatDate(yearStart)} – {formatDate(today)}</span>
            <span className="px-1 text-muted-foreground">⌄</span>
          </div>
        </header>

        <section aria-label="Financial summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Revenue YTD" value={financials.data?.revenue ?? 0} icon={TrendingUp} tone="bg-emerald-500/10 text-emerald-700" loading={financials.isLoading} currency={baseCurrency} />
          <Kpi label="Expenses YTD" value={financials.data?.expenses ?? 0} icon={BarChart3} tone="bg-orange-500/10 text-orange-700" loading={financials.isLoading} currency={baseCurrency} />
          <Kpi label="Net Profit" value={(financials.data?.revenue ?? 0) - (financials.data?.expenses ?? 0)} icon={WalletCards} tone="bg-blue-500/10 text-blue-700" loading={financials.isLoading} currency={baseCurrency} />
          <Kpi label="VAT Payable" value={financials.data?.vat ?? 0} icon={Percent} tone="bg-rose-500/10 text-rose-700" loading={financials.isLoading} currency={baseCurrency} />
        </section>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <main className="min-w-0 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Available Reports</h2>
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reports..." aria-label="Search reports" className="bg-card pl-9" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Report categories">
              {(["All", "Accounting", "Tax", "Management"] as const).map((item) => <Button key={item} size="sm" variant={category === item ? "default" : "outline"} onClick={() => setCategory(item)}>{item}</Button>)}
            </div>
            <div className="space-y-2">
              {visibleReports.map((report) => {
                const Icon = report.icon;
                const isFavorite = favorites.includes(report.id);
                return (
                  <Card key={report.id} className="group border-border/70 bg-card p-4 shadow-sm transition-colors hover:border-primary/35">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${report.iconClass}`}><Icon className="h-5 w-5" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-foreground">{report.title}</h3><Badge variant="secondary" className="text-[10px]">{report.category}</Badge></div>
                        <p className="mt-1 text-sm leading-5 text-muted-foreground">{report.description}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground lg:justify-end">
                        <span className="mr-1 whitespace-nowrap">{report.updated}</span>
                        <Button variant="ghost" size="icon" aria-label={`Print ${report.title}`} title="Print" onClick={() => openForPrint(report)}><Printer className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" aria-label={`Open ${report.title} for export`} title="CSV export" asChild><Link to={report.url as never}><Download className="h-4 w-4" /></Link></Button>
                        <Button variant="ghost" size="icon" aria-label={isFavorite ? `Remove ${report.title} from favorites` : `Add ${report.title} to favorites`} title="Favorite" onClick={() => toggleFavorite(report.id)}><Star className={`h-4 w-4 ${isFavorite ? "fill-amber-400 text-amber-500" : ""}`} /></Button>
                        <Button size="sm" asChild onClick={() => recordRecent(report.id)}><Link to={report.url as never}>Open Report <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
              {!visibleReports.length && <Card className="border-dashed p-10 text-center"><FileBarChart className="mx-auto h-8 w-8 text-muted-foreground/60" /><p className="mt-3 font-medium">No reports found</p><p className="mt-1 text-sm text-muted-foreground">Try changing your search or category filter.</p></Card>}
            </div>
          </main>

          <aside className="space-y-4">
            <Card className="border-border/70 bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between"><h2 className="font-semibold">My Reports</h2><span className="text-xs text-primary">{favoriteReports.length}</span></div>
              <div className="mt-3 space-y-1">
                {favoriteReports.map((report) => <Link key={report.id} to={report.url as never} onClick={() => recordRecent(report.id)} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />{report.title}</Link>)}
                {!favoriteReports.length && <p className="py-3 text-sm leading-5 text-muted-foreground">No favorite reports yet.<br />Star a report to access it quickly here.</p>}
              </div>
            </Card>
            <Card className="border-border/70 bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between"><h2 className="font-semibold">Recently Viewed</h2><span className="text-xs text-primary">{recentReports.length}</span></div>
              <div className="mt-3 space-y-1">
                {recentReports.map((report, index) => <Link key={report.id} to={report.url as never} onClick={() => recordRecent(report.id)} className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-muted"><span className="text-sm">{report.title}</span><span className="text-[11px] text-muted-foreground">{index === 0 ? "Today" : `${index}d ago`}</span></Link>)}
                {!recentReports.length && <p className="py-3 text-sm text-muted-foreground">No recently viewed reports.</p>}
              </div>
            </Card>
            <Card className="border-primary/15 bg-primary/[0.04] p-4 shadow-sm">
              <div className="flex items-center gap-2 font-semibold"><Info className="h-4 w-4 text-primary" /> Reporting Information</div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">All reports include Print and CSV export. Data is sourced from posted journal entries only — draft journals do not affect figures.</p>
              <p className="mt-2 text-xs text-muted-foreground">Base currency: <span className="font-semibold text-foreground">{baseCurrency}</span>{user ? " · Tenant reporting" : ""}</p>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
