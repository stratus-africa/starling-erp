import { createFileRoute } from "@tanstack/react-router";
import { ManufacturingDashboard } from "@/components/manufacturing-dashboard";

export const Route = createFileRoute("/_authenticated/dashboards/production")({
  component: ProductionDashboard,
});

function ProductionDashboard() {
  return <ManufacturingDashboard />;
}
