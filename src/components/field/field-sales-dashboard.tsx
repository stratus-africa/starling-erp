import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, FileText, ShoppingCart, Wallet, AlertTriangle, Users, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatMoney, dbMinor } from "@/lib/field-money";

type Period = "30" | "90" | "365";
type Scope = "mine" | "team";

const minor = (v: unknown) => dbMinor(v);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

function since(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function FieldSalesDashboard({ compact = false }: { compact?: boolean }) {
  const { user, tenant, can } = useAuth();
  const [period, setPeriod] = useState<Period>("90");
  const [scope, setScope] = useState<Scope>("mine");
  const from = since(Number(period));
  const currency = (tenant as { currency?: string } | null)?.currency || "KES";

  const q = useQuery({
    queryKey: ["field-sales-dashboard", tenant?.id, from],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const [quotes, orders, invoices, payments, customers] = await Promise.all([
        supabase.from("sales_quotes").select("id,status,grand_total,converted_order_id,customer_id,salesperson_id,created_by,date").is("deleted_at", null).gte("date", from).limit(5000),
        supabase.from("sales_orders").select("id,status,grand_total,source_quote_id,customer_id,salesperson_id,created_by,date").is("deleted_at", null).gte("date", from).limit(5000),
        supabase.from("invoices").select("id,status,grand_total,amount_paid,balance_due,due_date,customer_id,salesperson_id,created_by,date").is("deleted_at", null).is("voided_at", null).gte("date", from).limit(5000),
        supabase.from("payments_received").select("id,amount,customer_id,created_by,date,status").is("deleted_at", null).is("voided_at", null).gte("date", from).limit(5000),
        supabase.from("customers").select("id,name").is("deleted_at", null).limit(5000),
      ]);
      for (const r of [quotes, orders, invoices, payments, customers]) if (r.error) throw r.error;
      return { quotes: quotes.data ?? [], orders: orders.data ?? [], invoices: invoices.data ?? [], payments: payments.data ?? [], customers: customers.data ?? [] };
    },
  });

  const m = useMemo(() => {
    if (!q.data) return null;
    const mine = <T extends { salesperson_id?: string | null; created_by?: string | null }>(r: T) =>
      scope === "team" || (r.salesperson_id ?? r.created_by) === user?.id;
    const quotes = q.data.quotes.filter(mine);
    const orders = q.data.orders.filter(mine);
    const invoices = q.data.invoices.filter((i) => mine(i) && (i.status ?? "").toLowerCase() !== "draft");
    const payments = q.data.payments.filter((p) => scope === "team" || p.created_by === user?.id);

    const decided = quotes.filter((x) => (x.status ?? "Draft") !== "Draft");
    const converted = quotes.filter((x) => x.converted_order_id || orders.some((o) => o.source_quote_id === x.id));
    const quoteValue = quotes.reduce((s, x) => s + minor(x.grand_total), 0);
    const convertedValue = converted.reduce((s, x) => s + minor(x.grand_total), 0);
    const orderValue = orders.reduce((s, x) => s + minor(x.grand_total), 0);
    const invoiced = invoices.reduce((s, x) => s + minor(x.grand_total), 0);
    const paidOnInvoices = invoices.reduce((s, x) => s + minor(x.amount_paid), 0);
    const collected = payments.reduce((s, x) => s + minor(x.amount), 0);
    const today = new Date().toISOString().slice(0, 10);
    const overdue = invoices.filter((x) => minor(x.balance_due) > 0 && x.due_date && x.due_date < today);
    const overdueValue = overdue.reduce((s, x) => s + minor(x.balance_due), 0);

    const names = new Map(q.data.customers.map((c) => [c.id, c.name]));
    const byCust = new Map<string, { id: string; name: string; quotes: number; orders: number; sales: number; paid: number; due: number }>();
    const get = (id: string | null) => {
      const k = id ?? "none";
      if (!byCust.has(k)) byCust.set(k, { id: k, name: names.get(k) ?? "Unknown customer", quotes: 0, orders: 0, sales: 0, paid: 0, due: 0 });
      return byCust.get(k)!;
    };
    quotes.forEach((x) => get(x.customer_id).quotes++);
    orders.forEach((x) => get(x.customer_id).orders++);
    invoices.forEach((x) => { const c = get(x.customer_id); c.sales += minor(x.grand_total); c.paid += minor(x.amount_paid); c.due += minor(x.balance_due); });
    const top = [...byCust.values()].filter((c) => c.sales > 0 || c.orders > 0 || c.quotes > 0).sort((a, b) => b.sales - a.sales).slice(0, 10);

    return {
      quotes: quotes.length, decided: decided.length, converted: converted.length,
      conversion: pct(converted.length, quotes.length), valueConversion: pct(convertedValue, quoteValue),
      quoteValue, orders: orders.length, orderValue, invoiced, paidOnInvoices, collected,
      collectionRate: pct(paidOnInvoices, invoiced), overdue: overdue.length, overdueValue, top,
    };
  }, [q.data, scope, user?.id]);

  const fmt = (v: number) => formatMoney(v, currency);
  const canTeam = can("sales.update") || can("reports.read");

  return (
    <div className={cn("space-y-4", compact ? "p-4" : "")}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border bg-card p-1">
          {(["30", "90", "365"] as Period[]).map((p) => (
            <Button key={p} size="sm" variant={period === p ? "default" : "ghost"} className="h-8" onClick={() => setPeriod(p)}>
              {p === "365" ? "12 months" : `${p} days`}
            </Button>
          ))}
        </div>
        {canTeam && (
          <div className="flex rounded-lg border bg-card p-1">
            <Button size="sm" variant={scope === "mine" ? "default" : "ghost"} className="h-8" onClick={() => setScope("mine")}>My sales</Button>
            <Button size="sm" variant={scope === "team" ? "default" : "ghost"} className="h-8" onClick={() => setScope("team")}>Whole team</Button>
          </div>
        )}
      </div>

      {q.isLoading || !m ? (
        q.error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="font-medium">Couldn't load the dashboard.</p>
            <p className="text-muted-foreground">{(q.error as Error).message}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => q.refetch()}>Retry</Button>
          </div>
        ) : <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className={cn("grid gap-3", compact ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4")}>
            <Kpi icon={FileText} label="Quotes" value={String(m.quotes)} sub={fmt(m.quoteValue)} />
            <Kpi icon={ShoppingCart} label="Sales orders" value={String(m.orders)} sub={fmt(m.orderValue)} />
            <Kpi icon={Wallet} label="Collected" value={fmt(m.collected)} sub={`of ${fmt(m.invoiced)} invoiced`} />
            <Kpi icon={AlertTriangle} label="Overdue" value={fmt(m.overdueValue)} sub={`${m.overdue} invoice${m.overdue === 1 ? "" : "s"}`} tone={m.overdue > 0 ? "warn" : undefined} />
          </div>

          <div className={cn("grid gap-3", compact ? "grid-cols-1" : "lg:grid-cols-2")}>
            <RateCard title="Quote to order conversion" rate={m.conversion}
              lines={[["Quotes raised", String(m.quotes)], ["Sent or decided", String(m.decided)], ["Turned into orders", String(m.converted)], ["By value", `${m.valueConversion}%`]]} />
            <RateCard title="Payment collection rate" rate={m.collectionRate}
              lines={[["Invoiced", fmt(m.invoiced)], ["Paid on those invoices", fmt(m.paidOnInvoices)], ["Still owed", fmt(m.invoiced - m.paidOnInvoices)], ["Payments received", fmt(m.collected)]]} />
          </div>

          <div className="rounded-2xl border bg-card">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <Users className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Customer performance</h3>
            </div>
            {m.top.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No sales activity in this period.</p>
            ) : compact ? (
              <div>
                {m.top.map((c) => (
                  <div key={c.id} className="border-b px-4 py-3 last:border-0">
                    <div className="flex justify-between gap-2"><span className="truncate font-medium">{c.name}</span><span className="shrink-0 font-semibold tabular-nums">{fmt(c.sales)}</span></div>
                    <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{c.quotes} quotes · {c.orders} orders</span><span>{pct(c.paid, c.sales)}% paid</span></div>
                    <Progress value={pct(c.paid, c.sales)} className="mt-2 h-1.5" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left">Customer</th>
                      <th className="px-4 py-2 text-right">Quotes</th>
                      <th className="px-4 py-2 text-right">Orders</th>
                      <th className="px-4 py-2 text-right">Invoiced</th>
                      <th className="px-4 py-2 text-right">Paid</th>
                      <th className="px-4 py-2 text-right">Owed</th>
                      <th className="px-4 py-2 text-right">Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.top.map((c) => (
                      <tr key={c.id} className="border-t">
                        <td className="px-4 py-2 font-medium">{c.name}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{c.quotes}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{c.orders}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmt(c.sales)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmt(c.paid)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmt(c.due)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{pct(c.paid, c.sales)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone }: { icon: typeof TrendingUp; label: string; value: string; sub: string; tone?: "warn" }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}<Icon className={cn("h-4 w-4", tone === "warn" ? "text-destructive" : "text-primary")} />
      </div>
      <div className="mt-2 truncate text-xl font-bold tabular-nums">{value}</div>
      <div className="truncate text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function RateCard({ title, rate, lines }: { title: string; rate: number; lines: [string, string][] }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-2xl font-bold tabular-nums text-primary">{rate}%</span>
      </div>
      <Progress value={Math.min(100, rate)} className="mt-3 h-2" />
      <dl className="mt-3 space-y-1.5 text-sm">
        {lines.map(([k, v]) => (
          <div key={k} className="flex justify-between"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium tabular-nums">{v}</dd></div>
        ))}
      </dl>
    </div>
  );
}
