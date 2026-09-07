import { createFileRoute } from "@tanstack/react-router";
import { RoleDashboard, makeChart } from "@/components/role-dashboard";
import { Package, Truck, CheckCircle2, Clock, Plus, Printer } from "lucide-react";
import { useRoleDashboardData } from "@/hooks/use-role-dashboard-data";

export const Route = createFileRoute("/_authenticated/dashboards/logistics")({
  component: LogisticsDashboard,
});

function LogisticsDashboard() {
  const { data } = useRoleDashboardData();
  const logistics = data?.logistics;
  return (
    <RoleDashboard
      title="Logistics Manager Dashboard"
      subtitle="Packages, shipments, and delivery performance"
      metrics={[
        { label: "SOs to Fulfil", value: String(logistics?.fulfilment ?? 0), icon: Package },
        { label: "Awaiting Shipment", value: String(logistics?.awaitingShipment ?? 0), icon: Clock },
        { label: "Packed Today", value: String(logistics?.packedToday ?? 0), icon: Package },
        { label: "In Transit", value: String(logistics?.inTransit ?? 0), icon: Truck },
        { label: "Delivered MTD", value: String(logistics?.delivered ?? 0), icon: CheckCircle2 },
      ]}
      actions={[
        { label: "Create Package", to: "/sales/packages", icon: Plus },
        { label: "Create Shipment", to: "/sales/shipments", icon: Plus },
        { label: "Print Packing List", to: "/sales/packages", icon: Printer },
      ]}
      chart="bar" chartTitle="Packages by Warehouse (packed vs shipped)"
      chartData={logistics?.trend ?? makeChart([], [], [])}
      listTitle="Delivery Performance"
      list={logistics?.deliveries ?? []}
    />
  );
}
