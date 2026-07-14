import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { purchaseOrderFields } from "@/lib/module-schemas";

export const Route = createFileRoute("/purchasing/orders")({
  component: () => (
    <DataModulePage
      title="Purchase Orders"
      description="Confirmed orders with suppliers."
      table="purchase_orders"
      fields={purchaseOrderFields}
      entityLabel="Purchase Order"
      attachments={true}
    />
  ),
});
