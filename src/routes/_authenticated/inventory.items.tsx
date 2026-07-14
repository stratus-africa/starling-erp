import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { itemFields } from "@/lib/module-schemas";

export const Route = createFileRoute("/inventory/items")({
  component: () => (
    <DataModulePage
      title="Items"
      description="Products, raw materials, assemblies and services."
      table="items"
      fields={itemFields}
      entityLabel="Item"
      attachments={false}
    />
  ),
});
