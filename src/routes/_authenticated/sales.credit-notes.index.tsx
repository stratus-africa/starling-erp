import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { creditNoteFields } from "@/lib/module-schemas";

export const Route = createFileRoute("/_authenticated/sales/credit-notes/")({
  component: () => (
    <DataModulePage
      title="Credit Notes"
      description="Customer credit notes, returns and refunds against invoices."
      table="credit_notes"
      fields={creditNoteFields}
      entityLabel="Credit Note"
      attachments={true}
      searchColumn="number"
      rowHref={(r) => `/sales/credit-notes/${r.id}`}
      createHref="/sales/credit-notes/new"
    />
  ),
});
