import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, CheckCircle2, Factory, Gauge, PackageCheck, RefreshCw } from "lucide-react";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type DashboardPayload = {
  kpis: Record<string, number>;
  production_dates: { today: number; upcoming: number; overdue: number };
  recent_orders: Array<Record<string, unknown>>;
  shortage_orders: Array<Record<string, string>>;
};

const number = (value: unknown) => Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

function MetricCard({ label, value, icon: Icon, tone = "text-primary" }: { label: string; value: unknown; icon: typeof Factory; tone?: string }) {
  return <Card className="min-h-[112px]"><CardContent className="flex h-full flex-col justify-between p-4"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span><Icon className={`h-4 w-4 ${tone}`} /></div><span className="font-mono text-2xl font-semibold tabular-nums">{number(value)}</span></CardContent></Card>;
}

export function ManufacturingDashboard() {
  const { can } = useAuth();
  const dashboard = useQuery({
    queryKey: ["manufacturing-dashboard"],
    enabled: can("manufacturing.read"),
    queryFn: async () => {
      const { data, error } = await (db as any).rpc("get_manufacturing_dashboard");
      if (error) throw error;
      return data as DashboardPayload;
    },
  });

  if (!can("manufacturing.read")) return <div className="p-6 text-sm text-muted-foreground">You do not have permission to view Manufacturing.</div>;
  const data = dashboard.data;
  const kpis = data?.kpis;
  const dates = data?.production_dates;

  return <div className="flex flex-col gap-5 p-4 md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight">Manufacturing</h1><p className="text-sm text-muted-foreground">Production overview and manufacturing activity.</p></div><Button variant="outline" size="icon" onClick={() => dashboard.refetch()} disabled={dashboard.isFetching} aria-label="Refresh manufacturing dashboard"><RefreshCw className={`h-4 w-4 ${dashboard.isFetching ? "animate-spin" : ""}`} /></Button></div>

    <section aria-labelledby="order-kpis"><h2 id="order-kpis" className="mb-3 text-sm font-semibold">Manufacturing Orders</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[["Manufacturing Orders", kpis?.orders, Factory], ["Draft", kpis?.draft, Gauge], ["Planned", kpis?.planned, CalendarClock], ["In Production", kpis?.in_production, Factory], ["Completed", kpis?.completed, CheckCircle2]].map(([label, value, icon]) => dashboard.isLoading ? <Skeleton key={String(label)} className="h-28" /> : <MetricCard key={String(label)} label={String(label)} value={value} icon={icon as typeof Factory} />)}</div></section>
    <div className="grid gap-5 xl:grid-cols-3">
      <Card><CardHeader><CardTitle className="text-sm">Production</CardTitle></CardHeader><CardContent className="grid grid-cols-3 gap-3"><MetricCard label="Units Planned" value={kpis?.units_planned} icon={Factory} /><MetricCard label="Units In Production" value={kpis?.units_in_production} icon={Factory} tone="text-warning" /><MetricCard label="Units Completed" value={kpis?.units_completed} icon={CheckCircle2} tone="text-success" /></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Demand</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3"><MetricCard label="MTO Orders" value={kpis?.mto_orders} icon={Factory} /><MetricCard label="MTS Orders" value={kpis?.mts_orders} icon={PackageCheck} /></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Materials</CardTitle></CardHeader><CardContent className="grid grid-cols-3 gap-3"><MetricCard label="Available" value={kpis?.materials_available} icon={PackageCheck} tone="text-success" /><MetricCard label="Shortages" value={kpis?.material_shortages} icon={AlertTriangle} tone="text-destructive" /><MetricCard label="Awaiting Materials" value={kpis?.orders_awaiting_materials} icon={AlertTriangle} tone="text-warning" /></CardContent></Card>
    </div>

    <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
      <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-sm">Recent Manufacturing Orders</CardTitle><Button variant="link" size="sm" asChild><Link to="/manufacturing/orders">View all</Link></Button></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-muted/30 text-xs text-muted-foreground"><tr><th className="p-3 text-left">MO</th><th className="p-3 text-left">Type</th><th className="p-3 text-left">Product</th><th className="p-3 text-right">Quantity</th><th className="p-3 text-left">Status</th><th className="p-3 text-right">Progress</th><th className="p-3 text-left">Planned Completion</th></tr></thead><tbody>{dashboard.isLoading ? <tr><td colSpan={7} className="p-8 text-center"><Skeleton className="mx-auto h-5 w-48" /></td></tr> : (data?.recent_orders ?? []).length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No Manufacturing Orders yet.</td></tr> : data?.recent_orders.map((order) => <tr key={String(order.id)} className="border-t"><td className="p-3"><Link className="font-mono text-primary hover:underline" to="/manufacturing/orders/$id" params={{ id: String(order.id) }}>{String(order.number)}</Link></td><td className="p-3"><Badge variant="outline">{String(order.manufacturing_type ?? "—")}</Badge></td><td className="p-3">{String(order.product_name ?? "—")}</td><td className="p-3 text-right font-mono">{number(order.quantity)}</td><td className="p-3">{String(order.status)}</td><td className="p-3 text-right font-mono">{number(order.progress)}%</td><td className="p-3">{order.planned_end ? new Date(`${String(order.planned_end)}T00:00:00`).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td></tr>)}</tbody></table></div></CardContent></Card>
      <div className="flex flex-col gap-5"><Card><CardHeader><CardTitle className="text-sm">Manufacture Strategy</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3"><div className="rounded-md border bg-muted/20 p-4"><p className="text-xs text-muted-foreground">Manufacture to Order</p><p className="mt-1 font-mono text-2xl font-semibold">{number(kpis?.mto_orders)}</p><p className="text-xs text-muted-foreground">Sales-linked orders</p></div><div className="rounded-md border bg-muted/20 p-4"><p className="text-xs text-muted-foreground">Manufacture to Stock</p><p className="mt-1 font-mono text-2xl font-semibold">{number(kpis?.mts_orders)}</p><p className="text-xs text-muted-foreground">Inventory replenishment</p></div></CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Production Timing</CardTitle></CardHeader><CardContent className="grid grid-cols-3 gap-3"><div><p className="text-xs text-muted-foreground">Today</p><p className="font-mono text-xl font-semibold">{number(dates?.today)}</p></div><div><p className="text-xs text-muted-foreground">Upcoming</p><p className="font-mono text-xl font-semibold">{number(dates?.upcoming)}</p></div><div><p className="text-xs text-muted-foreground">Overdue</p><p className="font-mono text-xl font-semibold text-destructive">{number(dates?.overdue)}</p></div></CardContent></Card></div>
    </div>

    <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-sm">Material Shortages</CardTitle><Badge variant="outline">{number(data?.shortage_orders.length)} orders</Badge></CardHeader><CardContent>{(data?.shortage_orders ?? []).length === 0 ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-success" />No active Manufacturing Orders are blocked by material shortages.</div> : <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{data?.shortage_orders.map((order) => <div key={order.id} className="flex items-center justify-between gap-3 rounded-md border p-3"><div><Link className="font-mono text-sm text-primary hover:underline" to="/manufacturing/orders/$id" params={{ id: order.id }}>{order.number}</Link><p className="text-sm">{order.product_name}</p></div><Badge variant="destructive">{order.status}</Badge></div>)}</div>}</CardContent></Card>
  </div>;
}
