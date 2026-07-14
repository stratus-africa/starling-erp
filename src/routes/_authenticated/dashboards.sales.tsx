import { createFileRoute } from "@tanstack/react-router";
import { RoleDashboard, makeChart } from "@/components/role-dashboard";
import { TrendingUp, DollarSign, FileText, Receipt, Wallet, Plus, ShoppingCart } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboards/sales")({
  component: () => (
    <RoleDashboard
      title="Sales Manager Dashboard"
      subtitle="Pipeline, revenue, and collections at a glance"
      metrics={[
        { label: "Quotes", value: "38", delta: "+12%", up: true, icon: FileText },
        { label: "Sales Orders", value: "142", delta: "+8%", up: true, icon: ShoppingCart },
        { label: "Invoiced MTD", value: "$348,210", delta: "+14%", up: true, icon: Receipt },
        { label: "Collected", value: "$286,400", delta: "+9%", up: true, icon: Wallet },
        { label: "Outstanding", value: "$790,200", delta: "-3%", up: true, icon: DollarSign },
      ]}
      actions={[
        { label: "New Quote", to: "/sales/quotes", icon: Plus },
        { label: "New Invoice", to: "/sales/invoices", icon: Plus },
        { label: "Record Payment", to: "/sales/payments", icon: Plus },
      ]}
      chart="line" chartTitle="Sales Trend — Revenue vs Collections"
      chartData={makeChart(["W1","W2","W3","W4","W5","W6","W7"],[42,58,51,71,88,62,94],[38,45,49,66,72,58,80])}
      listTitle="Top Selling Products"
      list={[
        { primary: "Brake Assembly – Model X", secondary: "128 units · $11,392", status: "▲ 22%", tone: "success" },
        { primary: "Exhaust Manifold", secondary: "74 units · $8,214", status: "▲ 14%", tone: "success" },
        { primary: "Cold Rolled Steel 2mm", secondary: "1,820 kg · $3,367", status: "▲ 6%", tone: "info" },
        { primary: "On-site Installation", secondary: "42 hrs · $1,890", status: "▼ 4%", tone: "warning" },
      ]}
    />
  ),
});
