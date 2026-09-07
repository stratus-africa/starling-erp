import { createFileRoute } from "@tanstack/react-router";
import { RoleDashboard, makeChart } from "@/components/role-dashboard";
import { Factory, Cog, PlayCircle, AlertTriangle, Plus, CheckCircle2 } from "lucide-react";
import { useRoleDashboardData } from "@/hooks/use-role-dashboard-data";

export const Route = createFileRoute("/_authenticated/dashboards/production")({
  component: ProductionDashboard,
});

function ProductionDashboard() {
  const { data } = useRoleDashboardData();
  const production = data?.production;
  return (
    <RoleDashboard
      title="Production Manager Dashboard"
      subtitle="Shop-floor throughput, orders, and material readiness"
      metrics={[
        { label: "SOs → Production", value: String(production?.salesOrders ?? 0), icon: Factory },
        { label: "Production Orders", value: String(production?.orders ?? 0), icon: Cog },
        { label: "Active Runs", value: String(production?.activeRuns ?? 0), icon: PlayCircle },
        { label: "Completed MTD", value: String(production?.completed ?? 0), icon: CheckCircle2 },
        { label: "Material Shortages", value: String(production?.shortages ?? 0), icon: AlertTriangle },
      ]}
      actions={[
        { label: "New Production Order", to: "/manufacturing/orders", icon: Plus },
        { label: "Start Run", to: "/manufacturing/runs", icon: PlayCircle },
      ]}
      chart="bar" chartTitle="Production Capacity — Planned vs Actual"
      chartData={production?.trend ?? makeChart([], [], [])}
      listTitle="Raw Material Alerts"
      list={production?.alerts ?? []}
    />
  );
}
