import { createFileRoute } from "@tanstack/react-router";
import { InventoryDashboard } from "@/components/inventory-dashboard";

export const Route = createFileRoute("/_authenticated/dashboards/inventory")({
  component: InventoryDashboard,
});
