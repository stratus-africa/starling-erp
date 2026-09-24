import { createFileRoute } from "@tanstack/react-router";
import { SupplierCreateEditWindow } from "@/components/supplier-create-edit-modal";
import { Party360Page } from "@/components/party-360-page";
import { supplierFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/purchasing/suppliers/$id")({
  validateSearch: (search: Record<string, unknown>): { edit?: boolean } =>
    search.edit === true || search.edit === "true" || search.edit === "1" ? { edit: true } : {},
  component: SupplierRoute,
});

function SupplierRoute() {
    const { id } = Route.useParams();
    const { edit: editOnly } = Route.useSearch();
    const navigate = Route.useNavigate();

    if (id === "new" || editOnly) {
      return (
        <SupplierCreateEditWindow
          id={id === "new" ? "new" : id}
          fields={supplierFields}
          onOpenChange={(open) => {
            if (!open) {
               if (id === "new") window.history.back();
               else navigate({ to: "/purchasing/suppliers/$id", params: { id }, search: {}, replace: true });
            }
          }}
          onSaved={(newId) => {
             navigate({ to: "/purchasing/suppliers/$id", params: { id: newId }, search: {}, replace: true });
          }}
        />
      );
    }

    return <Party360Page id={id} kind="supplier" fields={supplierFields} />;
}
