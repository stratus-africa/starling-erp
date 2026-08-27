import { createFileRoute } from "@tanstack/react-router";
import { RoleDashboard, makeChart } from "@/components/role-dashboard";
import { useSalesDashboard } from "@/hooks/use-sales-dashboard";
import { DollarSign, FileText, Plus, Receipt, ShoppingCart, Wallet } from "lucide-react";

const metricIcons = [DollarSign, Wallet, FileText, ShoppingCart, Receipt] as const;

function SalesDashboard() {
  const { data, isLoading, error } = useSalesDashboard();

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading sales dashboard…</div>;
  }

  if (error || !data) {
    return <div className="p-6 text-sm text-destructive">Unable to load sales dashboard.</div>;
  }

  const metrics = data.metrics.map((metric, index) => ({
    label: metric.label,
    value:
      metric.key.includes("sales") || metric.key.includes("receivables")
        ? new Intl.NumberFormat("en-KE", {
            style: "currency",
            currency: "KES",
            maximumFractionDigits: 0,
          }).format(metric.value)
        : metric.value.toLocaleString("en-KE"),
    icon: metricIcons[index] ?? Receipt,
    href: metric.href,
  }));

  const chartData = makeChart(
    data.trend.map((point) => point.x),
    data.trend.map((point) => point.a),
    data.trend.map((point) => point.b),
  );

  return (
    <RoleDashboard
      title="Sales Manager Dashboard"
      subtitle="Pipeline, revenue, and collections at a glance"
      metrics={metrics}
      actions={[
        { label: "New Quote", to: "/sales/quotes", icon: Plus },
        { label: "New Invoice", to: "/sales/invoices", icon: Plus },
        { label: "Record Payment", to: "/sales/payments", icon: Plus },
      ]}
      chart="line"
      chartTitle="Sales Trend — Revenue vs Collections"
      chartData={chartData}
      listTitle="Top Selling Products"
      list={data.top_products}
    />
  );
}

export const Route = createFileRoute("/_authenticated/dashboards/sales")({
  component: SalesDashboard,
});
