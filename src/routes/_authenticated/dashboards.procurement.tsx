import { createFileRoute } from "@tanstack/react-router";
import { RoleDashboard, makeChart } from "@/components/role-dashboard";
import { ClipboardList, ShoppingBag, Truck, AlertTriangle, Plus, CheckCircle2 } from "lucide-react";
import { useRoleDashboardData } from "@/hooks/use-role-dashboard-data";

export const Route = createFileRoute("/_authenticated/dashboards/procurement")({
  component: ProcurementDashboard,
});

function ProcurementDashboard() {
  const { data } = useRoleDashboardData();
  const procurement = data?.procurement;
  return (
    <RoleDashboard
      title="Procurement Manager Dashboard"
      subtitle="Requisitions, purchase orders, and supplier deliveries"
      metrics={[
        { label: "Pending Requisitions", value: String(procurement?.pendingRequisitions ?? 0), icon: ClipboardList },
        { label: "Approved Requisitions", value: String(procurement?.approvedRequisitions ?? 0), icon: CheckCircle2 },
        { label: "Open Purchase Orders", value: String(procurement?.openPurchaseOrders ?? 0), icon: ShoppingBag },
        { label: "Deliveries This Week", value: String(procurement?.deliveriesThisWeek ?? 0), icon: Truck },
        { label: "Low Stock Items", value: String(procurement?.lowStock ?? 0), icon: AlertTriangle },
      ]}
      actions={[
        { label: "New Requisition", to: "/purchasing/requisitions", icon: Plus },
        { label: "New Purchase Order", to: "/purchasing/orders", icon: Plus },
      ]}
      chart="line" chartTitle="Purchasing Trend — Committed vs Delivered"
      chartData={procurement?.trend ?? makeChart([], [], [])}
      listTitle="Supplier Performance"
      list={procurement?.suppliers ?? []}
    />
  );
}
