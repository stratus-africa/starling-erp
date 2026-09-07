import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const today = () => new Date().toISOString().slice(0, 10);
const monthAgo = () => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
};
type Collections = {
  opening_ar: number;
  invoices: number;
  payments: number;
  credit_notes: number;
  closing_ar: number;
  collection_rate: number;
  dso: number;
  overdue_percent: number;
  overdue_invoices: Array<Record<string, string | number>>;
  upcoming_invoices: Array<Record<string, string | number>>;
  unallocated_payments: Array<Record<string, string | number>>;
};
export function CollectionsReportPage() {
  const { tenant } = useAuth();
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const report = useQuery({
    queryKey: ["sales", "collections", from, to],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await db.rpc("get_collections_report", {
        _date_from: from,
        _date_to: to,
        _customer_id: null,
      });
      if (error) throw error;
      return data as Collections;
    },
  });
  const data = report.data;
  const currency = tenant?.currency ?? "KES";
  return (
    <div className="min-h-full bg-muted/20 p-4 md:p-6">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-5">
        <header className="flex items-center justify-between border-b pb-5">
          <div>
            <p className="text-xs text-muted-foreground">Reports / Sales</p>
            <h1 className="mt-1 text-2xl font-bold">Collections</h1>
          </div>
          <Button variant="outline" onClick={() => report.refetch()}>
            <RefreshCw
              className={report.isFetching ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"}
            />
            Refresh
          </Button>
        </header>
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <Field label="Date from" value={from} onChange={setFrom} />
          <Field label="Date to" value={to} onChange={setTo} />
        </Card>
        {report.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : report.isError ? (
          <Card className="p-5 text-sm text-destructive">
            Unable to load collections. {report.error.message}
          </Card>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Opening AR", data?.opening_ar],
                ["Invoices", data?.invoices],
                ["Payments", data?.payments],
                ["Credit Notes", data?.credit_notes],
                ["Closing AR", data?.closing_ar],
                ["Collection Rate", data?.collection_rate, "%"],
                ["DSO", data?.dso, "days"],
                ["Overdue", data?.overdue_percent, "%"],
              ].map(([label, value, suffix]) => (
                <Card className="p-4" key={String(label)}>
                  <p className="text-xs uppercase text-muted-foreground">{label}</p>
                  <p className="mt-2 font-mono text-xl font-semibold">
                    {suffix
                      ? `${Number(value ?? 0).toFixed(1)}${suffix === "%" ? "%" : ` ${suffix}`}`
                      : money(Number(value ?? 0), currency)}
                  </p>
                </Card>
              ))}
            </section>
            <List
              title="Overdue Invoices"
              rows={data?.overdue_invoices ?? []}
              href="/sales/invoices"
              currency={currency}
              empty="No overdue invoices."
            />
            <List
              title="Upcoming Due Invoices"
              rows={data?.upcoming_invoices ?? []}
              href="/sales/invoices"
              currency={currency}
              empty="No upcoming invoices."
            />
            <List
              title="Unallocated Payments"
              rows={data?.unallocated_payments ?? []}
              href="/sales/payments"
              currency={currency}
              empty="No unallocated payments."
            />
          </>
        )}
      </div>
    </div>
  );
}
function List({
  title,
  rows,
  href,
  currency,
  empty,
}: {
  title: string;
  rows: Array<Record<string, string | number>>;
  href: string;
  currency: string;
  empty: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b p-4">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {rows.length ? (
        <div className="divide-y">
          {rows.slice(0, 50).map((row, index) => (
            <a
              className="flex items-center justify-between p-4 text-sm hover:bg-muted/30"
              href={href}
              key={String(row.id ?? index)}
            >
              <span>
                <span className="font-mono font-medium">{row.number ?? "Transaction"}</span>
                <span className="ml-3 text-muted-foreground">{row.date ?? row.due_date ?? ""}</span>
              </span>
              <span className="font-mono">
                {money(Number(row.balance_due ?? row.amount ?? 0), currency)}
              </span>
            </a>
          ))}
        </div>
      ) : (
        <p className="p-6 text-sm text-muted-foreground">{empty}</p>
      )}
    </Card>
  );
}
function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Input type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
function money(value: number, currency: string) {
  return `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
