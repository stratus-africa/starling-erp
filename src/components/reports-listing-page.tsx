import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BarChart3, CalendarDays, Download, FileBarChart, Info, Printer, Search, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatCompactBaseCurrency } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export type ReportCategory = string;
export type ReportDefinition = { id: string; title: string; description: string; url: string; category: ReportCategory; icon: ComponentType<{ className?: string }>; iconClass: string };
export type ReportKpi = { label: string; value: number | null; tone: string; icon: ComponentType<{ className?: string }>; suffix?: string };
export type ReportsListingConfig = { module: string; title: string; description: string; categories: string[]; reports: ReportDefinition[]; kpis: ReportKpi[]; reportingInformation: string; accent: string; currencyKpis?: boolean };

const db = supabase as any;
const keyFor = (tenantId: string, module: string, type: string) => `reports:${tenantId}:${module}:${type}`;

function dateLabel(value: string) { return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }); }

function Kpi({ item, loading, currency }: { item: ReportKpi; loading: boolean; currency: string }) {
  const Icon = item.icon;
  const value = item.value == null ? "—" : item.suffix ? `${item.value.toLocaleString()} ${item.suffix}` : formatCompactBaseCurrency(item.value, currency);
  return <Card className="flex min-h-[116px] flex-col justify-between border-border/70 p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{item.label}</span><span className={`flex h-8 w-8 items-center justify-center rounded-full ${item.tone}`}><Icon className="h-4 w-4" /></span></div>{loading ? <Skeleton className="h-8 w-28" /> : <p className="font-mono text-2xl font-bold tabular-nums">{value}</p>}<p className="text-xs text-muted-foreground">Current reporting period</p></Card>;
}

export function ReportsListingPage({ config }: { config: ReportsListingConfig }) {
  const { tenant } = useAuth();
  const tenantId = tenant?.id;
  const currency = tenant?.currency ?? "KES";
  const today = new Date().toISOString().slice(0, 10);
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(config.categories[0] ?? "All");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    try {
      setFavorites(JSON.parse(localStorage.getItem(keyFor(tenantId, config.module, "favorites")) ?? "[]"));
      setRecent(JSON.parse(localStorage.getItem(keyFor(tenantId, config.module, "recent")) ?? "[]"));
    } catch { setFavorites([]); setRecent([]); }
  }, [config.module, tenantId]);

  const summary = useQuery({
    queryKey: ["reports-summary", config.module, tenantId, yearStart, today],
    enabled: !!tenantId,
    queryFn: async () => {
      if (config.module === "financial") {
        const { data: accounts, error: accountError } = await db.from("chart_of_accounts").select("id,code,type").is("deleted_at", null).in("code", ["4000", "5000", "6000", "1150", "2100"]);
        if (accountError) throw accountError;
        const rows = accounts ?? [];
        const ids = rows.map((row: any) => row.id);
        if (!ids.length) return [0, 0, 0, 0];
        const { data: entries, error: entryError } = await db.from("journal_entries").select("id").is("deleted_at", null).eq("status", "Posted").gte("entry_date", yearStart).lte("entry_date", today);
        if (entryError) throw entryError;
        const entryIds = (entries ?? []).map((row: any) => row.id);
        if (!entryIds.length) return [0, 0, 0, 0];
        const { data: lines, error: lineError } = await db.from("journal_lines").select("account_id,debit,credit").in("journal_id", entryIds).in("account_id", ids);
        if (lineError) throw lineError;
        const map = new Map(rows.map((row: any) => [row.id, row])); let revenue = 0; let expenses = 0; let output = 0; let input = 0;
        for (const line of lines ?? []) { const account = map.get(line.account_id); const debit = Number(line.debit) || 0; const credit = Number(line.credit) || 0; if (account?.type === "Income") revenue += credit - debit; if (account?.type === "Expense") expenses += debit - credit; if (account?.code === "2100") output += credit - debit; if (account?.code === "1150") input += debit - credit; }
        return [revenue, expenses, revenue - expenses, output - input];
      }
      const table = config.module === "sales" ? "invoices" : config.module === "purchases" ? "purchase_orders" : config.module === "inventory" ? "items" : "production_orders";
      const result = await db.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null);
      if (result.error) throw result.error;
      return config.kpis.map((item) => item.suffix ? result.count ?? 0 : null);
    },
  });

  const kpis = config.kpis.map((item, index) => ({ ...item, value: summary.data?.[index] ?? item.value }));
  const visible = useMemo(() => config.reports.filter((report) => { const q = search.trim().toLowerCase(); return (category === config.categories[0] || report.category === category) && (!q || `${report.title} ${report.description} ${report.category}`.toLowerCase().includes(q)); }), [category, config.categories, config.reports, search]);
  const favoriteReports = config.reports.filter((report) => favorites.includes(report.id));
  const recentReports = recent.map((id) => config.reports.find((report) => report.id === id)).filter(Boolean) as ReportDefinition[];
  const updateList = (type: "favorites" | "recent", values: string[]) => { if (tenantId) localStorage.setItem(keyFor(tenantId, config.module, type), JSON.stringify(values)); };
  const toggleFavorite = (id: string) => { const next = favorites.includes(id) ? favorites.filter((item) => item !== id) : [...favorites, id]; setFavorites(next); updateList("favorites", next); };
  const recordRecent = (id: string) => { const next = [id, ...recent.filter((item) => item !== id)].slice(0, 5); setRecent(next); updateList("recent", next); };
  const print = (report: ReportDefinition) => { recordRecent(report.id); const popup = window.open(report.url, "report-print"); if (popup) popup.addEventListener("load", () => popup.print(), { once: true }); };

  return <div className="min-h-full bg-muted/20 p-4 md:p-6 xl:p-8"><div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6"><header className="flex flex-col justify-between gap-4 border-b border-border/70 pb-5 lg:flex-row lg:items-end"><div className="flex items-start gap-2"><Button variant="ghost" size="icon" aria-label="Back" onClick={() => window.history.back()}><ArrowLeft className="h-4 w-4" /></Button><div><p className="text-xs font-medium text-muted-foreground">Reports / {config.title}</p><h1 className="mt-1 text-2xl font-bold tracking-tight">{config.title}</h1><p className="mt-1 text-sm text-muted-foreground">{config.description}</p></div></div><div className="flex items-center gap-2 rounded-lg border border-border/70 bg-card p-2 shadow-sm"><CalendarDays className="h-4 w-4 text-primary" /><span className="text-sm font-semibold">FY {new Date().getFullYear()}</span><span className="border-l px-2 text-xs text-muted-foreground">{dateLabel(yearStart)} – {dateLabel(today)}</span></div></header><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{kpis.map((item) => <Kpi key={item.label} item={item} loading={summary.isLoading} currency={currency} />)}</section><div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]"><main className="min-w-0 space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-lg font-semibold">Available Reports</h2><div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reports..." aria-label="Search reports" className="bg-card pl-9" /></div></div><div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Report categories">{config.categories.map((item) => <Button key={item} size="sm" variant={category === item ? "default" : "outline"} onClick={() => setCategory(item)}>{item}</Button>)}</div><div className="space-y-2">{visible.map((report) => { const Icon = report.icon; const favorite = favorites.includes(report.id); return <Card key={report.id} className="border-border/70 p-4 shadow-sm transition-colors hover:border-primary/35"><div className="flex flex-col gap-4 lg:flex-row lg:items-center"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${report.iconClass}`}><Icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{report.title}</h3><Badge variant="secondary" className="text-[10px]">{report.category}</Badge></div><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{report.description}</p><p className="mt-2 text-xs text-muted-foreground">Updated live · Print · CSV</p></div><div className="flex shrink-0 items-center gap-1 lg:justify-end"><Button variant="ghost" size="icon" aria-label={`Print ${report.title}`} title="Print" onClick={() => print(report)}><Printer className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`Export ${report.title}`} title="CSV export" asChild><Link to={report.url as never}><Download className="h-4 w-4" /></Link></Button><Button variant="ghost" size="icon" aria-label={favorite ? `Unfavorite ${report.title}` : `Favorite ${report.title}`} onClick={() => toggleFavorite(report.id)}><Star className={`h-4 w-4 ${favorite ? "fill-amber-400 text-amber-500" : ""}`} /></Button><Button size="sm" asChild onClick={() => recordRecent(report.id)}><Link to={report.url as never}>Open Report <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button></div></div></Card>; })}{!visible.length && <Card className="border-dashed p-10 text-center"><FileBarChart className="mx-auto h-8 w-8 text-muted-foreground/60" /><p className="mt-3 font-medium">No reports found</p><Button variant="link" onClick={() => { setSearch(""); setCategory(config.categories[0]); }}>Clear filters</Button></Card>}</div></main><aside className="space-y-4"><Card className="p-4 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-semibold">My Reports</h2><span className="text-xs text-primary">{favoriteReports.length}</span></div><div className="mt-3 space-y-1">{favoriteReports.map((report) => <Link key={report.id} to={report.url as never} onClick={() => recordRecent(report.id)} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />{report.title}</Link>)}{!favoriteReports.length && <p className="py-3 text-sm text-muted-foreground">No favorite reports yet.</p>}</div></Card><Card className="p-4 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-semibold">Recently Viewed</h2><span className="text-xs text-primary">{recentReports.length}</span></div><div className="mt-3 space-y-1">{recentReports.map((report, index) => <Link key={report.id} to={report.url as never} onClick={() => recordRecent(report.id)} className="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-muted"><span>{report.title}</span><span className="text-[11px] text-muted-foreground">{index === 0 ? "Today" : `${index}d ago`}</span></Link>)}{!recentReports.length && <p className="py-3 text-sm text-muted-foreground">No recently viewed reports.</p>}</div></Card><Card className="border-primary/15 bg-primary/[0.04] p-4 shadow-sm"><div className="flex items-center gap-2 font-semibold"><Info className="h-4 w-4 text-primary" /> Reporting Information</div><p className="mt-3 text-xs leading-5 text-muted-foreground">{config.reportingInformation}</p><p className="mt-2 text-xs text-muted-foreground">Base currency: <span className="font-semibold text-foreground">{currency}</span></p></Card></aside></div></div></div>;
