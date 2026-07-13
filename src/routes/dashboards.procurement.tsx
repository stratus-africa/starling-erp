import { createFileRoute } from "@tanstack/react-router";
import { RoleDashboard, makeChart } from "@/components/role-dashboard";
import { ClipboardList, ShoppingBag, Truck, AlertTriangle, Plus, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/dashboards/procurement")({
  component: () => (
    <RoleDashboard
      title="Procurement Manager Dashboard"
      subtitle="Requisitions, purchase orders, and supplier deliveries"
      metrics={[
        { label: "Pending Requisitions", value: "6", icon: ClipboardList },
        { label: "Approved Requisitions", value: "11", delta: "+3", up: true, icon: CheckCircle2 },
        { label: "Open Purchase Orders", value: "18", icon: ShoppingBag },
        { label: "Deliveries This Week", value: "9", icon: Truck },
        { label: "Low Stock Items", value: "14", delta: "+2", up: false, icon: AlertTriangle },
      ]}
      actions={[
        { label: "New Requisition", to: "/purchasing/requisitions", icon: Plus },
        { label: "New Purchase Order", to: "/purchasing/orders", icon: Plus },
      ]}
      chart="line" chartTitle="Purchasing Trend — Committed vs Delivered"
      chartData={makeChart(["Feb","Mar","Apr","May","Jun","Jul"],[142,168,181,172,198,214],[130,155,175,168,190,180])}
      listTitle="Supplier Performance"
      list={[
        { primary: "Global Steel Co.", secondary: "On-time 96% · avg lead 12d", status: "A+", tone: "success" },
        { primary: "AutoParts Middle East", secondary: "On-time 91% · avg lead 8d", status: "A", tone: "success" },
        { primary: "Prime Packaging Ltd", secondary: "On-time 82% · avg lead 5d", status: "B", tone: "warning" },
        { primary: "Delta Chemicals", secondary: "On-time 68% · avg lead 21d", status: "C", tone: "destructive" },
      ]}
    />
  ),
});
