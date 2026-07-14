import { createFileRoute } from "@tanstack/react-router";
import { RoleDashboard, makeChart } from "@/components/role-dashboard";
import { Package, Truck, CheckCircle2, Clock, Plus, Printer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboards/logistics")({
  component: () => (
    <RoleDashboard
      title="Logistics Manager Dashboard"
      subtitle="Packages, shipments, and delivery performance"
      metrics={[
        { label: "SOs to Fulfil", value: "24", icon: Package },
        { label: "Awaiting Shipment", value: "12", delta: "+3", up: false, icon: Clock },
        { label: "Packed Today", value: "18", delta: "+22%", up: true, icon: Package },
        { label: "In Transit", value: "7", icon: Truck },
        { label: "Delivered MTD", value: "128", delta: "+16%", up: true, icon: CheckCircle2 },
      ]}
      actions={[
        { label: "Create Package", to: "/sales/packages", icon: Plus },
        { label: "Create Shipment", to: "/sales/shipments", icon: Plus },
        { label: "Print Packing List", to: "/sales/packages", icon: Printer },
      ]}
      chart="bar" chartTitle="Packages by Warehouse (packed vs shipped)"
      chartData={makeChart(["Nairobi","Mombasa","Cairo","Dubai"],[42,18,26,14],[38,15,22,12])}
      listTitle="Delivery Performance"
      list={[
        { primary: "On-time deliveries", secondary: "This month", status: "94%", tone: "success" },
        { primary: "Delayed shipments", secondary: "Awaiting driver update", status: "3", tone: "warning" },
        { primary: "SHP-00420 — Fedex Egypt", secondary: "Cairo → Alexandria · ETA 13 Jul", status: "In Transit", tone: "info" },
        { primary: "SHP-00419 — In-house Fleet", secondary: "Nairobi → Nakuru", status: "In Transit", tone: "info" },
      ]}
    />
  ),
});
