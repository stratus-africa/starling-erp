import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { packageFields } from "@/lib/module-validation-schemas";

export const Route = createFileRoute("/_authenticated/sales/packages/")({
  component: () => (
    <DataModulePage
      title="Packages"
      description="Pack items from sales orders for shipment."
      table="packages"
      fields={packageFields}
      entityLabel="Package"
      attachments={true}
      searchColumn="number"
      rowHref={(r) => `/sales/packages/${r.id}`}
      createHref="/sales/packages/new"
    />
  ),
});
