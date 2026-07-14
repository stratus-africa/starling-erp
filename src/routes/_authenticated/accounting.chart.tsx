import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { chartOfAccountFields } from "@/lib/module-schemas";

export const Route = createFileRoute("/accounting/chart")({
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
