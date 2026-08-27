import { createFileRoute } from "@tanstack/react-router";
import { DocumentViewWindow } from "@/components/document-view-window";
import { salesOrderFields } from "@/lib/module-schemas";

export const Route = createFileRoute("/_authenticated/sales/orders/")({
  component: () => (
    <DocumentViewWindow
      kind="order"
      title="Sales Orders"
      description="Manage customer sales orders and fulfillment."
      table="sales_orders"
      fields={salesOrderFields}
      searchColumn="number"
      filters={[{ key: "status", label: "Status", options: salesOrderFields.find((f) => f.key === "status")?.options ?? [] }, { key: "currency", label: "Currency", options: ["USD","EUR","GBP","KES","AED","EGP","INR","ZAR"] }]}
    />
  ),
});
