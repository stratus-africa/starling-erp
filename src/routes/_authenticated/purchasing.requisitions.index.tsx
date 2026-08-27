import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { requisitionFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/purchasing/requisitions/")({
  component: () => (
    <DataModulePage
      title="Purchase Requisitions"
      description="Internal purchase requests raised by departments before a purchase order is issued."
      table="purchase_requisitions"
      fields={requisitionFields}
      entityLabel="Requisition"
      attachments={true}
      searchColumn="number"
      rowHref={(r) => `/purchasing/requisitions/${r.id}`}
      createHref="/purchasing/requisitions/new"
    />
  ),
});
