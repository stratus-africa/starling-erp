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
    />
  ),
});
