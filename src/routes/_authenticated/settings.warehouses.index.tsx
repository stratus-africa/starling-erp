import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { warehouseFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/settings/warehouses/")({
  component: () => (
    <DataModulePage
      title="Warehouses"
      description="Storage locations across your network."
      table="warehouses"
      fields={warehouseFields}
      entityLabel="Warehouse"
      attachments={false}
      searchColumn="name"
      rowHref={(row) => `/settings/warehouses/${row.id}`}
      createHref="/settings/warehouses/new"
      filterFields={[{ key: "status", label: "Status", options: ["Active", "Inactive"] }]}
    />
  ),
});
