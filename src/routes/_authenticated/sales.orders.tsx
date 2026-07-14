import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { salesOrderFields } from "@/lib/module-schemas";

export const Route = createFileRoute("/_authenticated/sales/orders")({
  component: () => (
    <DataModulePage
      title="Sales Orders"
      description="Confirmed customer orders ready for fulfilment."
      table="sales_orders"
      fields={salesOrderFields}
      entityLabel="Sales Order"
      attachments={true}
    />
  ),
});
