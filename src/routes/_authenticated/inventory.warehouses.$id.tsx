import { createFileRoute } from "@tanstack/react-router";
import { RecordEditor } from "@/components/record-editor";
import { warehouseFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/inventory/warehouses/$id")({
  head: () => ({
    meta: [
      { title: "Warehouse | AURORA ERP" },
      { name: "description", content: "Create, view, and update a warehouse." },
      { property: "og:title", content: "Warehouse | AURORA ERP" },
      { property: "og:description", content: "Create, view, and update a warehouse." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WarehouseEditorPage,
});

function WarehouseEditorPage() {
  const { id } = Route.useParams();
  return (
    <RecordEditor
      id={id}
      table="warehouses"
      fields={warehouseFields}
      entityLabel="Warehouse"
      listHref="/inventory/warehouses"
      writeRoles={["tenant_admin", "super_admin", "inventory"]}
      permissionModule="inventory"
    />
  );
}