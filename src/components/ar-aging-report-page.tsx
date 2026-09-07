import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, RefreshCw } from "lucide-react";
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
type Aging = {
  buckets: Record<string, number>;
  rows: Array<Record<string, string | number>>;
  invoices: Array<Record<string, string | number>>;
};
export function ArAgingReportPage() {
  const { tenant } = useAuth();
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [customer, setCustomer] = useState("");
  const report = useQuery({
    queryKey: ["sales", "ar-aging", from, to, customer],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await db.rpc("get_ar_aging", {
        _date_from: from,
        _date_to: to,
        _customer_id: customer || null,
        _salesperson_id: null,
      });
      if (error) throw error;
      return data as Aging;
    },
  });
  const data = report.data;
  const buckets = Object.entries(data?.buckets ?? {});
  const max = Math.max(...buckets.map(([, value]) => Number(value)), 1);
  const exportCsv = () => {
    const header = "Customer,Current,1-30,31-60,61-90,90+,Total\n";
    const rows = (data?.rows ?? [])
      .map((row) =>
        [
          row.name,
          row.current,
          row.days_1_30,
          row.days_31_60,
          row.days_61_90,
          row.over_90,
          row.total,
        ].join(","),
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "ar-aging.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <ReportShell
      title="Accounts Receivable Aging"
      onRefresh={() => report.refetch()}
      refreshing={report.isFetching}
    >
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Field label="Date from" value={from} onChange={setFrom} />
        <Field label="As of date" value={to} onChange={setTo} />
        <Field label="Customer ID (optional)" value={customer} onChange={setCustomer} />
        <Button variant="outline" onClick={exportCsv} disabled={!data}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </Card>
      {report.isLoading ? (
        <Loading />
      ) : report.isError ? (
        <ErrorText message={report.error.message} />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {buckets.map(([label, value]) => (
              <Card className="p-4" key={label}>
                <p className="text-xs uppercase text-muted-foreground">
                  {label.replaceAll("_", " ")}
                </p>
                <p className="mt-2 font-mono text-xl font-semibold">
                  {money(Number(value), tenant?.currency ?? "KES")}
                </p>
              </Card>
            ))}
          </section>
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold">Aging Distribution</h2>
            <div className="flex h-44 items-end gap-4 border-b">
              {buckets.map(([label, value]) => (
                <div className="flex flex-1 flex-col items-center gap-2" key={label}>
                  <div
                    className="w-full rounded-t bg-primary/70"
                    style={{ height: `${Math.max(3, (Number(value) / max) * 100)}%` }}
                  />
                  <span className="text-xs text-muted-foreground">
                    {label.replaceAll("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    {["Customer", "Current", "1-30", "31-60", "61-90", "90+", "Total"].map(
                      (head) => (
                        <th className="p-3 text-right first:text-left" key={head}>
                          {head}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(data?.rows ?? []).map((row) => (
                    <tr className="border-t" key={String(row.customer_id)}>
                      <td className="p-3">
                        <a
                          className="text-primary hover:underline"
                          href={`/crm/customers/${row.customer_id}`}
                        >
                          {row.name}
                        </a>
                      </td>
                      {["current", "days_1_30", "days_31_60", "days_61_90", "over_90", "total"].map(
                        (key) => (
                          <td className="p-3 text-right font-mono" key={key}>
                            {money(Number(row[key] ?? 0), tenant?.currency ?? "KES")}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data?.rows.length && (
              <p className="p-8 text-center text-sm text-muted-foreground">
                No outstanding receivables.
              </p>
            )}
          </Card>
        </>
      )}
    </ReportShell>
  );
}
function ReportShell({
  title,
  children,
  onRefresh,
  refreshing,
}: {
  title: string;
  children: React.ReactNode;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="min-h-full bg-muted/20 p-4 md:p-6">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-5">
        <header className="flex items-center justify-between border-b pb-5">
          <div>
            <p className="text-xs text-muted-foreground">Reports / Sales</p>
            <h1 className="mt-1 text-2xl font-bold">{title}</h1>
          </div>
          <Button variant="outline" onClick={onRefresh}>
            <RefreshCw className={refreshing ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
            Refresh
          </Button>
        </header>
        {children}
      </div>
    </div>
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
      <Input
        type={label.includes("date") || label.includes("Date") ? "date" : "text"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
function Loading() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading AR aging...
    </div>
  );
}
function ErrorText({ message }: { message: string }) {
  return <Card className="p-5 text-sm text-destructive">Unable to load AR aging. {message}</Card>;
}
function money(value: number, currency: string) {
  return `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
