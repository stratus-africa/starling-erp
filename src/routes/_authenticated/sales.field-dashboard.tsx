import { createFileRoute } from "@tanstack/react-router";
import { FieldSalesDashboard } from "@/components/field/field-sales-dashboard";

export const Route = createFileRoute("/_authenticated/sales/field-dashboard")({
  head: () => ({
    meta: [
      { title: "Field Sales Dashboard — Starling ERP" },
      { name: "description", content: "Customer performance, quote to order conversion and payment collection." },
    ],
  }),
  component: () => (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Field Sales Dashboard</h1>
        <p className="text-sm text-muted-foreground">Customer performance, quote to order conversion and payment collection.</p>
      </div>
      <FieldSalesDashboard />
    </div>
  ),
});
