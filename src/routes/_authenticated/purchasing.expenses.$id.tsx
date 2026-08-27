import { createFileRoute } from "@tanstack/react-router";
import { RecordEditor } from "@/components/record-editor";
import { expenseFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/purchasing/expenses/$id")({
  component: () => {
    const { id } = Route.useParams();
    return (
      <RecordEditor
        id={id}
        table="expenses"
        fields={expenseFields}
        entityLabel="Expense"
        listHref="/purchasing/expenses"
        titleKey="number"
        writeRoles={["tenant_admin", "super_admin", "purchasing", "accounting"]}
      />
    );
  },
});
