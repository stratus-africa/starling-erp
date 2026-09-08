import { createFileRoute } from "@tanstack/react-router";
import { DocumentViewWindow } from "@/components/document-view-window";

export const Route = createFileRoute("/_authenticated/purchasing/orders/")({
  component: () => (
    <DocumentViewWindow
      kind="po"
      title="Purchase Orders"
      description="Manage supplier orders through approval, delivery, and billing."
      table="purchase_orders"
      fields={[]}
      searchColumn="number"
      filters={[{ key: "status", label: "Status", options: ["Draft", "Pending Approval", "Approved", "Sent", "Acknowledged", "Closed", "Cancelled"] }]}
    />
  ),
});
