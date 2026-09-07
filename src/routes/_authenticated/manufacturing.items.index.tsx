import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { itemFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/manufacturing/items/")({
  component: () => (
    <DataModulePage
      title="Production Items"
      description="Items used in manufacturing — finished goods, raw materials and sub-assemblies."
      table="items"
      entityLabel="Item"
      fields={itemFields.filter((f) =>
        // Show the same columns as the inventory items list
        !["category_id", "barcode", "manufacturer", "model", "description"].includes(f.key)
      )}
      permissionModule="manufacturing"
      writeRoles={["manufacturing"]}
      searchColumn="name"
      rowHref={(row) => `/manufacturing/items/${row.id}`}
      filterFields={[
        {
          key: "type",
          label: "Type",
          options: ["Finished Good", "Raw Material", "Sub-assembly", "Consumable"],
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
