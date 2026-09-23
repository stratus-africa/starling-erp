import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { UserPlus, Target, FileText, ShoppingCart, Wallet } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/typed-db";
import { NotificationBell, useFieldAccess, money, Loading, StatusPill } from "@/components/field/field-ui";
import { formatMoney, dbMinor } from "@/lib/field-money";

export const Route = createFileRoute("/_authenticated/field/")({
  head: () => ({ meta: [{ title: "Home — Field Sales" }] }),
  component: FieldHome,
});

function FieldHome() {
  const { profile, tenant, user } = useAuth();
  const a = useFieldAccess();
  const cur = tenant?.currency ?? "KES";

  const { data, isLoading } = useQuery({
    queryKey: ["field", "dashboard", a.crm],
    queryFn: async () => {
      const head = { count: "exact" as const, head: true };
      const [c, q, o, inv, rc, rq, ro, rp, rl] = await Promise.all([
        a.customers ? supabase.from("customers").select("id", head).is("deleted_at", null) : null,
        a.sales ? supabase.from("sales_quotes").select("id", head).is("deleted_at", null).in("status", ["Draft", "Sent", "Viewed"]) : null,
        a.sales ? supabase.from("sales_orders").select("id", head).is("deleted_at", null).not("status", "in", "(Closed,Cancelled,Delivered)") : null,
        a.invoices ? supabase.from("invoices").select("balance_due").is("deleted_at", null).gt("balance_due", 0).not("status", "in", "(Draft,Cancelled,Voided)") : null,
        a.customers ? supabase.from("customers").select("id,name,created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(3) : null,
        a.sales ? supabase.from("sales_quotes").select("id,number,status,grand_total,currency,created_at,customers(name)").is("deleted_at", null).order("created_at", { ascending: false }).limit(3) : null,
        a.sales ? supabase.from("sales_orders").select("id,number,status,grand_total,currency,created_at,customers(name)").is("deleted_at", null).order("created_at", { ascending: false }).limit(3) : null,
        a.payments ? supabase.from("payments_received").select("id,number,amount,currency,created_at,customer_id,customers(name)").is("deleted_at", null).order("created_at", { ascending: false }).limit(3) : null,
        a.leads ? db.from("crm_leads").select("id,name,status,created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(3) : null,
      ]);
      const outstanding = ((inv?.data ?? []) as any[]).reduce((s, r) => s + dbMinor(r.balance_due), 0);
      const recent = [
        ...((rc?.data ?? []) as any[]).map((r) => ({ key: "c" + r.id, to: "/field/customers/$id", params: { id: r.id }, title: r.name, sub: "Customer created", at: r.created_at })),
        ...((rl?.data ?? []) as any[]).map((r) => ({ key: "l" + r.id, to: "/field/leads/$id", params: { id: r.id }, title: r.name, sub: "Lead", status: r.status, at: r.created_at })),
        ...((rq?.data ?? []) as any[]).map((r) => ({ key: "q" + r.id, to: "/field/sales/$kind/$id", params: { kind: "quote", id: r.id }, title: `${r.number} · ${r.customers?.name ?? ""}`, sub: money(r.grand_total, r.currency), status: r.status, at: r.created_at })),
        ...((ro?.data ?? []) as any[]).map((r) => ({ key: "o" + r.id, to: "/field/sales/$kind/$id", params: { kind: "order", id: r.id }, title: `${r.number} · ${r.customers?.name ?? ""}`, sub: money(r.grand_total, r.currency), status: r.status, at: r.created_at })),
        ...((rp?.data ?? []) as any[]).map((r) => ({ key: "p" + r.id, to: "/field/customers/$id", params: { id: r.customer_id }, title: `${r.number ?? "Payment"} · ${r.customers?.name ?? ""}`, sub: `Payment ${money(r.amount, r.currency)}`, at: r.created_at })),
      ].sort((x, y) => (y.at ?? "").localeCompare(x.at ?? "")).slice(0, 10);
      return { customers: c?.count ?? 0, quotes: q?.count ?? 0, orders: o?.count ?? 0, outstanding, recent };
    },
  });

  const name = profile?.full_name || user?.email || "";
  const initials = name.split(/\s|@/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");

  const actions = [
    { show: a.customersCreate, to: "/field/customers/new", label: "Customer", icon: UserPlus },
    { show: a.leadsCreate, to: "/field/leads/new", label: "Lead", icon: Target },
    { show: a.salesCreate, to: "/field/sales/new", search: { kind: "quote" }, label: "Quote", icon: FileText },
    { show: a.salesCreate, to: "/field/sales/new", search: { kind: "order" }, label: "Sales Order", icon: ShoppingCart },
    { show: a.paymentsCreate, to: "/field/payments/new", label: "Payment", icon: Wallet },
  ].filter((x) => x.show);

  const cards = [
    { show: a.customers, label: "Customers", value: String(data?.customers ?? "—"), to: "/field/customers" },
    { show: a.sales, label: "Open Quotes", value: String(data?.quotes ?? "—"), to: "/field/sales" },
    { show: a.sales, label: "Sales Orders", value: String(data?.orders ?? "—"), to: "/field/sales" },
    { show: a.invoices, label: "Outstanding", value: data ? formatMoney(data.outstanding, cur) : "—", to: "/field/payments" },
  ].filter((x) => x.show);

  return (
    <div>
      <header className="flex items-center gap-3 bg-primary px-4 pb-6 pt-5 text-primary-foreground">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-foreground/15 text-sm font-bold">{initials || "?"}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{name}</div>
          <div className="truncate text-xs opacity-80">{tenant?.name}</div>
        </div>
        <div className="rounded-full bg-primary-foreground/10"><NotificationBell /></div>
      </header>
      <div className="-mt-4 grid grid-cols-2 gap-3 px-4">
        {cards.map((c) => (
          <Link key={c.label} to={c.to as never} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className="mt-1 truncate text-xl font-semibold tabular-nums">{c.value}</div>
          </Link>
        ))}
      </div>
      <section className="px-4 pt-6">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Quick actions</h2>
        <div className="grid grid-cols-3 gap-3">
          {actions.map((x) => (
            <Link key={x.label} to={x.to as never} search={x.search as never} className="flex h-24 flex-col items-center justify-center gap-2 rounded-xl border bg-card text-sm font-medium active:bg-muted">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><x.icon className="h-5 w-5" /></span>
              + {x.label}
            </Link>
          ))}
        </div>
      </section>
      <section className="pt-6">
        <h2 className="mb-1 px-4 text-sm font-semibold text-muted-foreground">Recent activity</h2>
        {isLoading ? <Loading /> : (data?.recent ?? []).length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground">Nothing yet.</p> : data!.recent.map((r: any) => (
          <Link key={r.key} to={r.to} params={r.params} className="flex min-h-14 items-center gap-3 border-b px-4 py-2 active:bg-muted">
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{r.title}</div><div className="truncate text-xs text-muted-foreground">{r.sub}</div></div>
            {r.status && <StatusPill status={r.status} />}
          </Link>
        ))}
      </section>
    </div>
  );
}
