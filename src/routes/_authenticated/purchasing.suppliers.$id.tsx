import { createFileRoute } from "@tanstack/react-router";
import { SupplierCreateEditModal } from "@/components/supplier-create-edit-modal";
import { Party360Page } from "@/components/party-360-page";
import { supplierFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/purchasing/suppliers/$id")({
  component: () => {
    const { id } = Route.useParams();
    return id === "new" ? (
      <SupplierCreateEditModal
        id="new"
        fields={supplierFields}
        onOpenChange={(open) => {
          if (!open) window.history.back();
        }}
        onSaved={(newId) => window.history.replaceState({}, "", `/purchasing/suppliers/${newId}`)}
      />
    ) : <Party360Page id={id} kind="supplier" fields={supplierFields} />;
  },
});
