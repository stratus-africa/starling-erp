import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { supplierCreditNoteFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/purchasing/credits")({
  component: () => (
    <DataModulePage
      title="Supplier Credits"
      description="Credits from suppliers to apply on future bills."
      table="supplier_credit_notes"
      fields={supplierCreditNoteFields}
      entityLabel="Supplier Credit"
      attachments={true}
      searchColumn="number"
      rowHref={(r) => `/purchasing/credits/${r.id}`}
      createHref="/purchasing/credits/new"
      writeRoles={["tenant_admin", "purchasing", "accounting", "finance_clerk"]}
      permissionModule="purchasing"
    />
  ),
});
