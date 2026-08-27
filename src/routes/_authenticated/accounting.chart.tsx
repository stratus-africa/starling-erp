import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { chartOfAccountFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/accounting/chart")({
  component: () => (
    <DataModulePage
      title="Chart of Accounts"
      description="General ledger account structure."
      table="chart_of_accounts"
      fields={chartOfAccountFields}
      entityLabel="Account"
      attachments={false}
    />
  ),
});
