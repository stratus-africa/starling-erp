import { createFileRoute } from "@tanstack/react-router";
import { RecordEditor } from "@/components/record-editor";
import { supplierFields } from "@/lib/module-validation-schemas";

export const Route = createFileRoute("/_authenticated/purchasing/suppliers/$id")({
  component: () => {
    const { id } = Route.useParams();
    return (
      <RecordEditor
        id={id}
        table="suppliers"
        fields={supplierFields}
        entityLabel="Supplier"
        listHref="/purchasing/suppliers"
        writeRoles={["tenant_admin", "super_admin", "purchasing"]}
      />
    );
  },
});
