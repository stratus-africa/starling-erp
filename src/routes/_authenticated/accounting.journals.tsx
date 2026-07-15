import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { journalEntryFields } from "@/lib/module-schemas";

export const Route = createFileRoute("/_authenticated/accounting/journals")({
  component: () => (
    <DataModulePage title="Manual Journals" description="Post double-entry journals to the general ledger."
      table="journal_entries" entityLabel="Journal Entry" fields={journalEntryFields}
      writeRoles={["accounting"]} searchColumn="number" />
  ),
});
