import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { billFields } from "@/lib/module-schemas";

export const Route = createFileRoute("/_authenticated/purchasing/bills/")({
  component: () => (
    <DataModulePage
      title="Bills"
      description="Supplier invoices awaiting payment."
      table="bills"
      fields={billFields}
      entityLabel="Bill"
      attachments={true}
      searchColumn="number"
      rowHref={(r) => `/purchasing/bills/${r.id}`}
      createHref="/purchasing/bills/new"
      voidAction={{ entityType: "bill", permission: "purchasing.void" }}
    />
  ),
});
