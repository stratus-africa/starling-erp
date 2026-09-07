import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CalendarDays, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { db } from "@/lib/typed-db";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Overview = {
  gross_sales: number;
  orders: number;
  average_order_value: number;
  outstanding_ar: number;
  overdue_ar: number;
  collections: number;
  trend: Array<{ date: string; sales: number; collections: number }>;
};

const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getFullYear()}-01-01`;

export function SalesOverviewReportPage() {
  const { tenant } = useAuth();
  const [dateFrom, setDateFrom] = useState(yearStart);
  const [dateTo, setDateTo] = useState(today);
  const [currency, setCurrency] = useState(tenant?.currency ?? "KES");

  const report = useQuery({
    queryKey: ["sales", "overview", dateFrom, dateTo, currency],
    enabled: !!tenant?.id && !!dateFrom && !!dateTo,
    queryFn: async () => {
      const { data, error } = await db.rpc("get_sales_overview", {
        _date_from: dateFrom,
        _date_to: dateTo,
        _currency: currency || null,
      });
      if (error) throw error;
      return data as Overview;
    },
  });

  const data = report.data;
  const maxTrend = Math.max(
    ...(data?.trend ?? []).flatMap((item) => [item.sales, item.collections]),
    1,
  );

  return (
    <div className="min-h-full bg-muted/20 p-4 md:p-6 xl:p-8">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6">
        <header className="flex flex-col justify-between gap-4 border-b border-border/70 pb-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Reports / Sales</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
              <BarChart3 className="h-6 w-6 text-primary" /> Sales Overview
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Posted sales, collections, and receivables for the selected period.
            </p>
          </div>
          <Button variant="outline" onClick={() => report.refetch()} disabled={report.isFetching}>
            <RefreshCw
              className={report.isFetching ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"}
            />
            Refresh
          </Button>
        </header>

        <Card className="flex flex-col gap-4 p-4 md:flex-row md:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="sales-date-from">Date from</Label>
            <Input
              id="sales-date-from"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sales-date-to">Date to</Label>
            <Input
              id="sales-date-to"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sales-currency">Currency</Label>
            <Input
              id="sales-currency"
              value={currency}
              maxLength={3}
              onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground md:ml-auto">
            <CalendarDays className="h-4 w-4" /> Document date for sales, payment date for
            collections
          </div>
        </Card>

        {report.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading Sales Overview...
          </div>
        ) : report.isError ? (
          <Card className="p-6 text-sm text-destructive">
            Unable to load the sales overview. {report.error.message}
          </Card>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Kpi label="Gross Sales" value={data?.gross_sales ?? 0} currency={currency} />
              <Kpi label="Collections" value={data?.collections ?? 0} currency={currency} />
              <Kpi label="Outstanding AR" value={data?.outstanding_ar ?? 0} currency={currency} />
              <Kpi label="Overdue AR" value={data?.overdue_ar ?? 0} currency={currency} />
              <Kpi label="Orders" value={data?.orders ?? 0} suffix="orders" />
              <Kpi
                label="Average Order Value"
                value={data?.average_order_value ?? 0}
                currency={currency}
              />
            </section>
            <Card className="p-5">
              <h2 className="mb-4 text-sm font-semibold">Sales and Collections Trend</h2>
              {data?.trend.length ? (
                <div className="flex h-64 items-end gap-1 overflow-x-auto border-b border-border/70 pb-2">
                  {data.trend.map((item) => (
                    <div
                      className="flex min-w-7 flex-1 items-end gap-0.5"
                      title={`${item.date}: ${format(item.sales, currency)} sales, ${format(item.collections, currency)} collections`}
                      key={item.date}
                    >
                      <div
                        className="w-1/2 rounded-t bg-primary/70"
                        style={{ height: `${Math.max(2, (item.sales / maxTrend) * 100)}%` }}
                      />
                      <div
                        className="w-1/2 rounded-t bg-emerald-500/70"
                        style={{ height: `${Math.max(2, (item.collections / maxTrend) * 100)}%` }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No posted sales activity for this period.
                </p>
              )}
              <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                <span>
                  <i className="mr-1 inline-block h-2 w-2 rounded-full bg-primary/70" />
                  Sales
                </span>
                <span>
                  <i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500/70" />
                  Collections
                </span>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  currency,
  suffix,
}: {
  label: string;
  value: number;
  currency?: string;
  suffix?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-3 font-mono text-2xl font-bold">
        {suffix ? `${value.toLocaleString()} ${suffix}` : format(value, currency ?? "KES")}
      </p>
    </Card>
  );
}

function format(value: number, currency: string) {
  return `${currency} ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
