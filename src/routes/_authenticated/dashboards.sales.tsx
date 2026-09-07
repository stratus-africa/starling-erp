import { createFileRoute } from "@tanstack/react-router";
import { SalesLifecycleDashboard } from "@/components/sales-lifecycle-dashboard";

export const Route = createFileRoute("/_authenticated/dashboards/sales")({
  component: SalesDashboard,
});

function SalesDashboard() {
  return <SalesLifecycleDashboard />;
}
