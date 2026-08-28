import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { expenseFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/purchasing/expenses/")({
  component: () => (
    <DataModulePage
      title="Expenses"
      description="Track operational, travel and overhead expenses."
      table="expenses"
      fields={expenseFields}
      entityLabel="Expense"
      rowHref={(r) => `/purchasing/expenses/${r.id}`}
      createHref="/purchasing/expenses/new"
      postAction={{
        rpc: "post_expense",
        paramName: "_expense_id",
        label: "Post",
        showWhen: (row) => !row.posted_at && row.status !== "Voided",
      }}
      postPermission="purchasing.post"
      voidAction={{
        permission: "purchasing.void",
        entityType: "expense",
        label: "Void",
        reason: "Expense voided and reversed",
        showWhen: (row) => !!row.posted_at && !row.voided_at,
      }}
      filterFields={[{ key: "status", label: "Status", options: ["Draft", "Posted", "Voided"] }]}
    />
  ),
});
