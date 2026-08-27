import { createFileRoute } from "@tanstack/react-router";
import { RecordEditor } from "@/components/record-editor";
import { customerFields } from "@/lib/module-schemas";

export const Route = createFileRoute("/_authenticated/crm/customers/$id")({
  component: () => {
    const { id } = Route.useParams();
    return (
      <RecordEditor
        id={id}
        table="customers"
        fields={customerFields}
        entityLabel="Customer"
        listHref="/crm/customers"
        titleKey="name"
        writeRoles={["tenant_admin", "super_admin", "sales"]}
      />
    );
  },
});
