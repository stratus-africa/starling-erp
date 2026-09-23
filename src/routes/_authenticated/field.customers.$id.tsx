import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, Mail, Pencil, FileText, ShoppingCart, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FieldHeader, Loading, ErrorBox, NoAccess, Chips, StatusPill, Row, Empty, useFieldAccess, money } from "@/components/field/field-ui";
import { dbMinor, formatMoney } from "@/lib/field-money";

export const Route = createFileRoute("/_authenticated/field/customers/$id")({
  head: () => ({ meta: [{ title: "Customer — Field Sales" }] }),
  component: CustomerDetail,
});

type Tab = "overview" | "quotes" | "orders" | "invoices" | "payments";

function CustomerDetail() {
  const { id } = Route.useParams();
  const a = useFieldAccess();
  const [tab, setTab] = useState<Tab>("overview");
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["customers", "field-detail", id],
    enabled: a.customers,
    queryFn: async () => {
      const [c, q, o, i, p] = await Promise.all([
        supabase.from("customers").select("*").eq("id", id).maybeSingle(),
        a.sales ? supabase.from("sales_quotes").select("id,number,date,status,grand_total,currency").eq("customer_id", id).is("deleted_at", null).order("date", { ascending: false }) : null,
        a.sales ? supabase.from("sales_orders").select("id,number,date,status,grand_total,currency").eq("customer_id", id).is("deleted_at", null).order("date", { ascending: false }) : null,
        a.invoices ? supabase.from("invoices").select("id,number,date,due_date,status,grand_total,balance_due,currency").eq("customer_id", id).is("deleted_at", null).order("date", { ascending: false }) : null,
        a.payments ? supabase.from("payments_received").select("id,number,date,amount,currency,mode,status").eq("customer_id", id).is("deleted_at", null).is("voided_at", null).order("date", { ascending: false }) : null,
      ]);
      if (c.error) throw c.error;
      return { c: c.data, quotes: q?.data ?? [], orders: o?.data ?? [], invoices: i?.data ?? [], payments: p?.data ?? [] };
    },
  });
  if (!a.customers) return <><FieldHeader title="Customer" back="/field/customers" /><NoAccess what="customers" /></>;
  if (isLoading) return <><FieldHeader title="Customer" back="/field/customers" /><Loading /></>;
  if (error || !data?.c) return <><FieldHeader title="Customer" back="/field/customers" /><ErrorBox error={error ?? new Error("Customer not found")} retry={refetch} /></>;
  const { c } = data;
  const cur = c.currency ?? "KES";
  const posted = data.invoices.filter((x: any) => !["Draft", "Cancelled", "Voided"].includes(x.status ?? ""));
  const outstanding = posted.reduce((s: number, x: any) => s + dbMinor(x.balance_due), 0);
  const sales = posted.reduce((s: number, x: any) => s + dbMinor(x.grand_total), 0);
  const paid = data.payments.reduce((s: number, x: any) => s + dbMinor(x.amount), 0);

  const act = [
    c.phone && { href: `tel:${c.phone}`, label: "Call", icon: Phone },
    c.email && { href: `mailto:${c.email}`, label: "Email", icon: Mail },
  ].filter(Boolean) as { href: string; label: string; icon: typeof Phone }[];

  const tabs: { value: Tab; label: string }[] = [{ value: "overview", label: "Overview" }];
  if (a.sales) tabs.push({ value: "quotes", label: `Quotes (${data.quotes.length})` }, { value: "orders", label: `Orders (${data.orders.length})` });
  if (a.invoices) tabs.push({ value: "invoices", label: `Invoices (${data.invoices.length})` });
  if (a.payments) tabs.push({ value: "payments", label: `Payments (${data.payments.length})` });

  return (
    <div>
      <FieldHeader title={c.name} back="/field/customers" right={a.customersEdit ? <Link to="/field/customers/new" search={{ edit: id }} aria-label="Edit" className="flex h-11 w-11 items-center justify-center"><Pencil className="h-5 w-5" /></Link> : null} />
      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-sm text-muted-foreground">
            <div>{c.code}</div><div>{c.phone}</div><div className="truncate">{c.email}</div>
          </div>
          <StatusPill status={c.status ?? "Active"} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Outstanding" v={formatMoney(outstanding, cur)} />
          <Stat label="Total sales" v={formatMoney(sales, cur)} />
          <Stat label="Payments" v={formatMoney(paid, cur)} />
        </div>
        <div className="grid grid-cols-4 gap-2">
          {act.map((x) => <a key={x.label} href={x.href} className="flex h-16 flex-col items-center justify-center gap-1 rounded-lg border text-xs"><x.icon className="h-5 w-5 text-primary" />{x.label}</a>)}
          {a.salesCreate && <Link to="/field/sales/new" search={{ kind: "quote", customer: id }} className="flex h-16 flex-col items-center justify-center gap-1 rounded-lg border text-xs"><FileText className="h-5 w-5 text-primary" />Quote</Link>}
          {a.salesCreate && <Link to="/field/sales/new" search={{ kind: "order", customer: id }} className="flex h-16 flex-col items-center justify-center gap-1 rounded-lg border text-xs"><ShoppingCart className="h-5 w-5 text-primary" />Order</Link>}
          {a.paymentsCreate && <Link to="/field/payments/new" search={{ customer: id }} className="flex h-16 flex-col items-center justify-center gap-1 rounded-lg border text-xs"><Wallet className="h-5 w-5 text-primary" />Payment</Link>}
        </div>
        <Chips value={tab} onChange={setTab} options={tabs} />
      </div>
      {tab === "overview" && (
        <dl className="space-y-3 px-4 pb-6 text-sm">
          {[["Type", c.industry], ["Tax / PIN", c.tax_id], ["Currency", c.currency], ["Payment terms", c.payment_terms], ["Address", c.billing_address], ["Notes", c.notes]].map(([k, v]) => v ? (
            <div key={k as string}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="whitespace-pre-line">{v}</dd></div>
          ) : null)}
        </dl>
      )}
      {tab === "quotes" && (data.quotes.length ? data.quotes.map((r: any) => <Row key={r.id} to="/field/sales/$kind/$id" params={{ kind: "quote", id: r.id }} title={r.number} subtitle={r.date} right={money(r.grand_total, r.currency)} meta={<StatusPill status={r.status} />} />) : <Empty text="No quotes." />)}
      {tab === "orders" && (data.orders.length ? data.orders.map((r: any) => <Row key={r.id} to="/field/sales/$kind/$id" params={{ kind: "order", id: r.id }} title={r.number} subtitle={r.date} right={money(r.grand_total, r.currency)} meta={<StatusPill status={r.status} />} />) : <Empty text="No sales orders." />)}
      {tab === "invoices" && (data.invoices.length ? data.invoices.map((r: any) => (
        <div key={r.id} className="flex min-h-16 items-center gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1"><div className="font-medium">{r.number}</div><div className="text-xs text-muted-foreground">{r.date}{r.due_date ? ` · due ${r.due_date}` : ""}</div></div>
          <div className="text-right text-sm"><div className="tabular-nums">{money(r.grand_total, r.currency)}</div><div className="text-xs text-muted-foreground">Due {money(r.balance_due, r.currency)}</div></div>
        </div>
      )) : <Empty text="No invoices." />)}
      {tab === "payments" && (data.payments.length ? data.payments.map((r: any) => (
        <div key={r.id} className="flex min-h-16 items-center gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1"><div className="font-medium">{r.number}</div><div className="text-xs text-muted-foreground">{r.date} · {r.mode}</div></div>
          <div className="text-right text-sm"><div className="tabular-nums">{money(r.amount, r.currency)}</div><StatusPill status={r.status} /></div>
        </div>
      )) : <Empty text="No payments." />)}
    </div>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return <div className="rounded-lg border bg-card p-2"><div className="text-[11px] text-muted-foreground">{label}</div><div className="truncate text-sm font-semibold tabular-nums">{v}</div></div>;
}
