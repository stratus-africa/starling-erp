import { TableStateRow, QueryError, QueryLoading } from "@/components/query-state";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, HandCoins, Loader2, Search, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApplySupplierCreditDialog } from "@/components/apply-supplier-credit-dialog";
import { useAuth } from "@/hooks/use-auth";
import { db } from "@/lib/typed-db";

type Row = Record<string, any>;

export interface SupplierSummary {
  id: string;
  name: string;
  code: string | null;
  currency: string;
  openBills: number;
  billsOutstanding: number;
  billedTotal: number;
  openOrders: number;
  ordersValue: number;
  paymentsTotal: number;
  creditBalance: number;
}

const num = (value: unknown) => Number(value ?? 0);

function money(value: number, currency: string) {
  return `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function loadSupplierLedger(supplierId?: string) {
  const scope = (query: any, column = "supplier_id") =>
    supplierId ? query.eq(column, supplierId) : query;

  const [suppliers, bills, orders, payments, credits, applications] = await Promise.all([
    scope(db.from("suppliers").select("id,name,code,currency,status").is("deleted_at", null).order("name"), "id"),
    scope(
      db
        .from("bills")
        .select("id,number,supplier_id,date,due_date,currency,grand_total,amount_paid,balance_due,status")
        .is("deleted_at", null)
        .is("voided_at", null),
    ),
    scope(
      db
        .from("purchase_orders")
        .select("id,number,supplier_id,date,currency,grand_total,status,billing_status,payment_status")
        .is("deleted_at", null),
    ),
    scope(
      db
        .from("payments_made")
        .select("id,number,supplier_id,date,currency,amount,status,mode")
        .is("deleted_at", null)
        .is("voided_at", null),
    ),
    scope(
      db
        .from("supplier_credit_notes")
        .select("id,number,supplier_id,date,currency,total,status")
        .is("deleted_at", null)
        .is("voided_at", null),
    ),
    db.from("supplier_credit_note_applications").select("credit_note_id,bill_id,amount").is("deleted_at", null),
  ]);

  for (const result of [suppliers, bills, orders, payments, credits, applications]) {
    if (result.error) throw result.error;
  }

  const applied = new Map<string, number>();
  for (const row of (applications.data ?? []) as Row[]) {
    applied.set(row.credit_note_id, (applied.get(row.credit_note_id) ?? 0) + num(row.amount));
  }

  const summaries: SupplierSummary[] = ((suppliers.data ?? []) as Row[]).map((supplier) => {
    const supplierBills = ((bills.data ?? []) as Row[]).filter((bill) => bill.supplier_id === supplier.id);
    const supplierOrders = ((orders.data ?? []) as Row[]).filter((order) => order.supplier_id === supplier.id);
    const supplierPayments = ((payments.data ?? []) as Row[]).filter((row) => row.supplier_id === supplier.id);
    const supplierCredits = ((credits.data ?? []) as Row[]).filter((row) => row.supplier_id === supplier.id);
    const outstandingBills = supplierBills.filter(
      (bill) => num(bill.balance_due ?? num(bill.grand_total) - num(bill.amount_paid)) > 0.005,
    );

    return {
      id: supplier.id,
      name: supplier.name,
      code: supplier.code ?? null,
      currency: supplier.currency ?? "KES",
      openBills: outstandingBills.length,
      billsOutstanding: outstandingBills.reduce(
        (sum, bill) => sum + num(bill.balance_due ?? num(bill.grand_total) - num(bill.amount_paid)),
        0,
      ),
      billedTotal: supplierBills.reduce((sum, bill) => sum + num(bill.grand_total), 0),
      openOrders: supplierOrders.filter((order) => !["Closed", "Cancelled"].includes(order.status)).length,
      ordersValue: supplierOrders.reduce((sum, order) => sum + num(order.grand_total), 0),
      paymentsTotal: supplierPayments.reduce((sum, row) => sum + num(row.amount), 0),
      creditBalance: supplierCredits
        .filter((row) => row.status === "Posted")
        .reduce((sum, row) => sum + Math.max(0, num(row.total) - (applied.get(row.id) ?? 0)), 0),
    };
  });

  return {
    summaries,
    bills: (bills.data ?? []) as Row[],
    orders: (orders.data ?? []) as Row[],
    payments: (payments.data ?? []) as Row[],
    credits: (credits.data ?? []) as Row[],
    applied,
  };
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-base font-semibold tabular-nums ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

/** Full-page dashboard listing every supplier's balances. */
export function SupplierDashboardPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [applyOpen, setApplyOpen] = useState(false);
  const canApply = can(["purchasing.credits.apply", "purchasing.post"]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["supplier-dashboard"],
    queryFn: () => loadSupplierLedger(),
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = data?.summaries ?? [];
    if (!term) return list;
    return list.filter(
      (row) => row.name?.toLowerCase().includes(term) || (row.code ?? "").toLowerCase().includes(term),
    );
  }, [data, search]);

  const currency = rows[0]?.currency ?? "KES";
  const totals = rows.reduce(
    (acc, row) => ({
      outstanding: acc.outstanding + row.billsOutstanding,
      credits: acc.credits + row.creditBalance,
      payments: acc.payments + row.paymentsTotal,
      orders: acc.orders + row.ordersValue,
    }),
    { outstanding: 0, credits: 0, payments: 0, orders: 0 },
  );

  return (
    <div className="flex w-full flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Store className="h-5 w-5" /> Supplier Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Outstanding bills, purchase orders, payments and available credits for every supplier.
          </p>
        </div>
        {canApply && (
          <Button size="sm" onClick={() => setApplyOpen(true)}>
            <HandCoins className="mr-1.5 h-4 w-4" /> Apply Credit
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Bills outstanding" value={money(totals.outstanding, currency)} tone="text-destructive" />
        <Metric label="Credit balance" value={money(totals.credits, currency)} tone="text-emerald-600" />
        <Metric label="Payments made" value={money(totals.payments, currency)} />
        <Metric label="Purchase orders" value={money(totals.orders, currency)} />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search suppliers…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {isError ? (
        <QueryError error={error} retry={() => refetch()} label="We couldn't load supplier balances." />
      ) : isLoading ? (
        <div className="grid min-h-48 place-items-center rounded-lg border">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted/60 text-[11px] font-semibold uppercase text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-2.5 text-left">Supplier</th>
                <th className="px-3 py-2.5 text-right">Open bills</th>
                <th className="px-3 py-2.5 text-right">Bills outstanding</th>
                <th className="px-3 py-2.5 text-right">Open orders</th>
                <th className="px-3 py-2.5 text-right">Payments made</th>
                <th className="px-3 py-2.5 text-right">Credit balance</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No suppliers found.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <div className="text-sm font-medium">{row.name}</div>
                    {row.code && <div className="font-mono text-[10px] text-muted-foreground">{row.code}</div>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.openBills}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                    {money(row.billsOutstanding, row.currency)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.openOrders}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                    {money(row.paymentsTotal, row.currency)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-emerald-600">
                    {money(row.creditBalance, row.currency)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      to="/purchasing/suppliers/$id"
                      params={{ id: row.id }}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Open <ArrowRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ApplySupplierCreditDialog open={applyOpen} onOpenChange={setApplyOpen} />
    </div>
  );
}

/** Compact account summary shown on an individual supplier page. */
export function SupplierAccountSummary({ supplierId }: { supplierId: string }) {
  const { can } = useAuth();
  const [applyOpen, setApplyOpen] = useState(false);
  const canApply = can(["purchasing.credits.apply", "purchasing.post"]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["supplier-dashboard", supplierId],
    enabled: Boolean(supplierId) && supplierId !== "new",
    queryFn: () => loadSupplierLedger(supplierId),
  });

  const summary = data?.summaries.find((row) => row.id === supplierId);
  const currency = summary?.currency ?? "KES";
  const outstanding = (data?.bills ?? [])
    .filter((bill) => num(bill.balance_due ?? num(bill.grand_total) - num(bill.amount_paid)) > 0.005)
    .slice(0, 6);
  const payments = (data?.payments ?? []).slice(0, 5);

  if (isError) return <QueryError error={error} retry={() => refetch()} label="We couldn't load this supplier's account." />;
  if (isLoading) {
    return (
      <div className="grid min-h-24 place-items-center rounded-lg border">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Supplier account</h2>
        {canApply && (
          <Button size="sm" variant="outline" onClick={() => setApplyOpen(true)}>
            <HandCoins className="mr-1.5 h-4 w-4" /> Apply Credit
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Bills outstanding"
          value={money(summary?.billsOutstanding ?? 0, currency)}
          tone="text-destructive"
        />
        <Metric label="Total billed" value={money(summary?.billedTotal ?? 0, currency)} />
        <Metric label="Payments made" value={money(summary?.paymentsTotal ?? 0, currency)} />
        <Metric
          label="Credit balance"
          value={money(summary?.creditBalance ?? 0, currency)}
          tone="text-emerald-600"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="overflow-hidden rounded-lg border">
          <div className="border-b bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase text-muted-foreground">
            Outstanding bills
          </div>
          <table className="w-full text-sm">
            <tbody>
              {outstanding.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-xs text-muted-foreground">No outstanding bills.</td>
                </tr>
              )}
              {outstanding.map((bill) => (
                <tr key={bill.id} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs text-primary">{bill.number ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{bill.due_date ?? bill.date ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                    {money(num(bill.balance_due ?? num(bill.grand_total) - num(bill.amount_paid)), bill.currency ?? currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-lg border">
          <div className="border-b bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase text-muted-foreground">
            Recent payments
          </div>
          <table className="w-full text-sm">
            <tbody>
              {payments.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-xs text-muted-foreground">No payments yet.</td>
                </tr>
              )}
              {payments.map((payment) => (
                <tr key={payment.id} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs text-primary">{payment.number ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{payment.date ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                    {money(num(payment.amount), payment.currency ?? currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ApplySupplierCreditDialog open={applyOpen} onOpenChange={setApplyOpen} />
    </div>
  );
}
