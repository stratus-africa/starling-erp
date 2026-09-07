import { createFileRoute } from "@tanstack/react-router";
import { RoleDashboard, makeChart } from "@/components/role-dashboard";
import { TrendingUp, DollarSign, FileText, Receipt, Wallet, Plus, ShoppingCart } from "lucide-react";
import { useRoleDashboardData } from "@/hooks/use-role-dashboard-data";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/dashboards/sales")({
  component: SalesDashboard,
});

function SalesDashboard() {
  const { tenant } = useAuth();
  const { data } = useRoleDashboardData();
  const sales = data?.sales;
  const currency = tenant?.currency_symbol ?? tenant?.currency ?? "KES";
  const money = (value: number) => `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <RoleDashboard
      title="Sales Manager Dashboard"
      subtitle="Pipeline, revenue, and collections at a glance"
      metrics={[
        { label: "Quotes", value: String(sales?.quotes ?? 0), icon: FileText },
        { label: "Sales Orders", value: String(sales?.orders ?? 0), icon: ShoppingCart },
        { label: "Invoiced MTD", value: money(sales?.invoiced ?? 0), icon: Receipt },
        { label: "Collected", value: money(sales?.collected ?? 0), icon: Wallet },
        { label: "Outstanding", value: money(sales?.outstanding ?? 0), icon: DollarSign },
      ]}
      actions={[
        { label: "New Quote", to: "/sales/quotes", icon: Plus },
        { label: "New Invoice", to: "/sales/invoices", icon: Plus },
        { label: "Record Payment", to: "/sales/payments", icon: Plus },
      ]}
      chart="line"
      chartTitle="Sales Trend — Revenue vs Collections"
      chartData={sales?.trend ?? makeChart([], [], [])}
      listTitle="Top Selling Products"
      list={sales?.products ?? []}
    />
  );
}
