import { createFileRoute } from "@tanstack/react-router";
import { RoleDashboard, makeChart } from "@/components/role-dashboard";
import { Factory, Cog, PlayCircle, AlertTriangle, Plus, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/dashboards/production")({
  component: () => (
    <RoleDashboard
      title="Production Manager Dashboard"
      subtitle="Shop-floor throughput, orders, and material readiness"
      metrics={[
        { label: "SOs → Production", value: "8", icon: Factory },
        { label: "Production Orders", value: "16", icon: Cog },
        { label: "Active Runs", value: "3", icon: PlayCircle },
        { label: "Completed MTD", value: "42", delta: "+18%", up: true, icon: CheckCircle2 },
        { label: "Material Shortages", value: "4", delta: "+1", up: false, icon: AlertTriangle },
      ]}
      actions={[
        { label: "New Production Order", to: "/manufacturing/orders", icon: Plus },
        { label: "Start Run", to: "/manufacturing/runs", icon: PlayCircle },
      ]}
      chart="bar" chartTitle="Production Capacity — Planned vs Actual"
      chartData={makeChart(["Mon","Tue","Wed","Thu","Fri","Sat"],[60,72,68,80,74,50],[58,70,66,78,80,45])}
      listTitle="Raw Material Alerts"
      list={[
        { primary: "Corrugated Box 60cm", secondary: "240 pc · reorder at 500", status: "Low", tone: "warning" },
        { primary: "Cold Rolled Steel 2mm", secondary: "4,820 kg · above reorder", status: "OK", tone: "success" },
        { primary: "Rubber Gasket 12mm", secondary: "0 pc · out of stock", status: "Critical", tone: "destructive" },
        { primary: "Aluminium Rivet M4", secondary: "1,200 pc · above reorder", status: "OK", tone: "success" },
      ]}
    />
  ),
});
