import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { purchaseOrderFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/purchasing/orders/")({
  component: () => (
    <DataModulePage
      title="Purchase Orders"
      description="Confirmed orders with suppliers."
      table="purchase_orders"
      fields={purchaseOrderFields}
      entityLabel="Purchase Order"
      attachments={true}
      searchColumn="number"
      rowHref={(r) => `/purchasing/orders/${r.id}`}
      createHref="/purchasing/orders/new"
    />
  ),
});
