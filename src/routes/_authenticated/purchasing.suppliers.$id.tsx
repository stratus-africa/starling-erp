import { createFileRoute } from "@tanstack/react-router";
import { SupplierCreateEditWindow } from "@/components/supplier-create-edit-modal";
import { Party360Page } from "@/components/party-360-page";
import { supplierFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/purchasing/suppliers/$id")({
  component: () => {
    const { id } = Route.useParams();
    const params = new URLSearchParams(window.location.search);
    const editOnly = params.get("edit") === "1" || params.get("edit") === "true";

    if (id === "new" || editOnly) {
      return (
        <SupplierCreateEditWindow
          id={id === "new" ? "new" : id}
          fields={supplierFields}
          onOpenChange={(open) => {
            if (!open) {
              if (id === "new") window.history.back();
              else window.history.pushState({}, "", `${window.location.pathname}`);
            }
          }}
          onSaved={(newId) => {
            if (id === "new") window.history.replaceState({}, "", `/purchasing/suppliers/${newId}`);
            else window.history.replaceState({}, "", `${window.location.pathname}`);
          }}
        />
      );
    }

    return <Party360Page id={id} kind="supplier" fields={supplierFields} />;
  },
});
