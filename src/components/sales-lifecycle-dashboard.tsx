import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  DollarSign,
  FileText,
  Loader2,
  Package,
  Receipt,
  RefreshCw,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type Dashboard = {
  metrics: Record<string, number>;
  trend: Array<{ x: string; sales: number; collections: number }>;
  top_customers: Array<{ name: string; value: number }>;
  top_products: Array<{ name: string; value: number }>;
  aging: Record<string, number>;
  quote_funnel: Record<string, number>;
};
export function SalesLifecycleDashboard() {
  const { tenant } = useAuth();
  const currency = tenant?.currency_symbol ?? tenant?.currency ?? "KES";
  const query = useQuery({
    queryKey: ["dashboard", "sales-lifecycle"],
    queryFn: async () => {
      const { data, error } = await db.rpc("get_sales_lifecycle_dashboard");
      if (error) throw error;
      return data as Dashboard;
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });
  const data = query.data;
  const metrics = data?.metrics ?? {};
  const maxTrend = Math.max(
    ...(data?.trend ?? []).flatMap((item) => [item.sales, item.collections]),
    1,
  );
  const maxCustomer = Math.max(...(data?.top_customers ?? []).map((item) => item.value), 1);
  const maxProduct = Math.max(...(data?.top_products ?? []).map((item) => item.value), 1);
  if (query.isLoading)
    return (
      <div className="p-8">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  if (query.isError)
    return (
      <Card className="m-6 p-6 text-sm text-destructive">
        Unable to load Sales dashboard. {query.error.message}
      </Card>
    );
  const cards = [
    ["Today's Sales", metrics.todays_sales, DollarSign],
    ["MTD Sales", metrics.mtd_sales, Receipt],
    ["Orders", metrics.orders, ShoppingCart],
    ["Quotes Awaiting Response", metrics.quotes_awaiting_response, FileText],
    ["Orders Awaiting Fulfillment", metrics.orders_awaiting_fulfillment, Package],
    ["Outstanding AR", metrics.outstanding_ar, Wallet],
    ["Overdue AR", metrics.overdue_ar, Wallet],
    ["Unallocated Payments", metrics.unallocated_payments, DollarSign],
  ] as const;
  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Sales / Overview</p>
          <h1 className="mt-1 text-2xl font-bold">Sales Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Aggregated lifecycle, collections, and receivables.
          </p>
        </div>
        <Button variant="outline" onClick={() => query.refetch()}>
          <RefreshCw className={query.isFetching ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
          Refresh
        </Button>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value, Icon]) => (
          <Card className="p-4" key={label}>
            <div className="flex justify-between">
              <p className="text-xs uppercase text-muted-foreground">{label}</p>
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-3 font-mono text-xl font-semibold">
              {label === "Orders" || label.includes("Awaiting")
                ? Number(value ?? 0).toLocaleString()
                : format(Number(value ?? 0), currency)}
            </p>
          </Card>
        ))}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold">Sales and Collections Trend</h2>
          <div className="flex h-52 items-end gap-1 border-b">
            {(data?.trend ?? []).map((item) => (
              <div
                className="flex flex-1 items-end gap-0.5"
                title={`${item.x}: ${format(item.sales, currency)} sales`}
                key={item.x}
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
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold">AR Aging</h2>
          {Object.entries(data?.aging ?? {}).map(([bucket, value]) => (
            <div className="mb-3" key={bucket}>
              <div className="mb-1 flex justify-between text-xs">
                <span>{bucket}</span>
                <span className="font-mono">{format(Number(value), currency)}</span>
              </div>
              <Progress
                value={(Number(value) / Math.max(...Object.values(data?.aging ?? {}), 1)) * 100}
              />
            </div>
          ))}
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Ranked
          title="Top Customers"
          rows={data?.top_customers ?? []}
          max={maxCustomer}
          currency={currency}
        />
        <Ranked
          title="Top Products"
          rows={data?.top_products ?? []}
          max={maxProduct}
          currency={currency}
        />
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold">Quote Funnel</h2>
          {["created", "sent", "viewed", "accepted"].map((key) => (
            <div className="flex justify-between border-b py-2 text-sm last:border-0" key={key}>
              <span className="capitalize">{key}</span>
              <strong>{data?.quote_funnel?.[key] ?? 0}</strong>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
function Ranked({
  title,
  rows,
  max,
  currency,
}: {
  title: string;
  rows: Array<{ name: string; value: number }>;
  max: number;
  currency: string;
}) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      {rows.map((row) => (
        <div className="mb-3" key={row.name}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="truncate">{row.name}</span>
            <span className="font-mono">{format(row.value, currency)}</span>
          </div>
          <Progress value={(row.value / max) * 100} />
        </div>
      ))}
      {!rows.length && <p className="text-sm text-muted-foreground">No data for this period.</p>}
    </Card>
  );
}
function format(value: number, currency: string) {
  return `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
