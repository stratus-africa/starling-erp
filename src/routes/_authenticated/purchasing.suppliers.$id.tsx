import { createFileRoute } from "@tanstack/react-router";
import { SupplierEditor } from "@/components/supplier-editor";
import { supplierFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/purchasing/suppliers/$id")({
  component: () => {
    const { id } = Route.useParams();
    return <SupplierEditor id={id} fields={supplierFields} />;
  },
});
