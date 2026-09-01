import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { itemFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/inventory/items")({
  component: () => (
    <DataModulePage
      title="Items"
      description="Products, raw materials, assemblies and services."
      table="items"
      fields={itemFields}
      entityLabel="Item"
      attachments={false}
      searchColumn="name"
      rowHref={(row) => `/inventory/items/${row.id}`}
      createHref="/inventory/items/new"
      filterFields={[
        {
          key: "type",
          label: "Type",
          options: ["Finished Good", "Raw Material", "Sub-assembly", "Service", "Consumable"],
        },
        {
          key: "status",
          label: "Status",
          options: ["Active", "Inactive"],
        },
      ]}
    />
  ),
});
