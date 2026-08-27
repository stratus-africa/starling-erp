import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { shipmentFields } from "@/lib/module-validation-schemas";

export const Route = createFileRoute("/_authenticated/sales/shipments/")({
  component: () => (
    <DataModulePage
      title="Shipments"
      description="Track outbound deliveries, carriers and tracking numbers."
      table="shipments"
      fields={shipmentFields}
      entityLabel="Shipment"
      attachments={true}
      searchColumn="number"
      rowHref={(r) => `/sales/shipments/${r.id}`}
      createHref="/sales/shipments/new"
    />
  ),
});
