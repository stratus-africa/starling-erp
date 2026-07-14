import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { supplierFields } from "@/lib/module-schemas";

export const Route = createFileRoute("/purchasing/suppliers")({
  component: () => (
    <DataModulePage
      title="Suppliers"
      description="Vendor master and payment terms."
      table="suppliers"
      fields={supplierFields}
      entityLabel="Supplier"
      attachments={false}
    />
  ),
});
