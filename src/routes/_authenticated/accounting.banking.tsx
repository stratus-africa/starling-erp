import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { bankAccountFields } from "@/lib/module-schemas";

export const Route = createFileRoute("/_authenticated/accounting/banking")({
  component: () => (
    <DataModulePage title="Banking" description="Bank accounts, balances, and reconciliation."
      table="bank_accounts" entityLabel="Bank Account" fields={bankAccountFields}
      writeRoles={["accounting"]} searchColumn="name" />
  ),
});
