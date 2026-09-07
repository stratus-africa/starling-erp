import { createFileRoute } from "@tanstack/react-router";
import { SupplierEditor } from "@/components/supplier-editor";
import { Party360Page } from "@/components/party-360-page";
import { supplierFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/purchasing/suppliers/$id")({
  component: () => {
    const { id } = Route.useParams();
    return id === "new" ? <SupplierEditor id={id} fields={supplierFields} /> : <Party360Page id={id} kind="supplier" fields={supplierFields} />;
  },
});
