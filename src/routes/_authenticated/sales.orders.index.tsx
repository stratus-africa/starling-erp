import { createFileRoute } from "@tanstack/react-router";
import { DocumentViewWindow } from "@/components/document-view-window";

export const Route = createFileRoute("/_authenticated/sales/orders/")({
  component: () => (
    <DocumentViewWindow
      kind="order"
      title="Sales Orders"
      description="Manage confirmed customer orders through to delivery."
      table="sales_orders"
      fields={[]}
      searchColumn="number"
      filters={[
        {
          key: "status",
          label: "Status",
          options: ["Draft", "Confirmed", "Processing", "Packed", "Shipped", "Delivered", "Invoiced", "Cancelled"],
        },
      ]}
    />
  ),
});
