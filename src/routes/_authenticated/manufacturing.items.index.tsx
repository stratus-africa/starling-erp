import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { itemFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/manufacturing/items")({
  component: () => (
    <DataModulePage
      title="Production Items"
      description="Finished goods and sub-assemblies produced in-house."
      table="items"
      entityLabel="Item"
      fields={itemFields}
      writeRoles={["manufacturing"]}
      searchColumn="name"
      attachments={false}
      rowHref={(r) => `/manufacturing/items/${r.id}`}
      createHref="/manufacturing/items/new"
    />
  ),
});
