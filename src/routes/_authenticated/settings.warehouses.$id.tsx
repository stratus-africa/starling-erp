import { createFileRoute } from "@tanstack/react-router";
import { RecordEditor } from "@/components/record-editor";
import { warehouseFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/settings/warehouses/$id")({
  head: () => ({
    meta: [
      { title: "Warehouse Settings | AURORA ERP" },
      { name: "description", content: "Create, view, and update warehouse settings." },
      { property: "og:title", content: "Warehouse Settings | AURORA ERP" },
      { property: "og:description", content: "Create, view, and update warehouse settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WarehouseSettingsEditorPage,
});

function WarehouseSettingsEditorPage() {
  const { id } = Route.useParams();
  return (
    <RecordEditor
      id={id}
      table="warehouses"
      fields={warehouseFields}
      entityLabel="Warehouse"
      listHref="/settings/warehouses"
      writeRoles={["tenant_admin", "super_admin", "inventory"]}
      permissionModule="inventory"
    />
  );
}