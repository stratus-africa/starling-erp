import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { bomFields } from "@/lib/module-validation-schemas";

export const Route = createFileRoute("/_authenticated/manufacturing/bom/")({
  component: () => (
    <DataModulePage
      title="Bill of Materials"
      description="Define recipes for manufactured products."
      table="bom_headers"
      entityLabel="BOM"
      fields={bomFields}
      writeRoles={["manufacturing"]}
      searchColumn="code"
      rowHref={(row) => `/manufacturing/bom/${row.id}`}
      createHref="/manufacturing/bom/new"
    />
  ),
});
