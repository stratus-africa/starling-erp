import { createFileRoute } from "@tanstack/react-router";
import { RecordEditor } from "@/components/record-editor";
import { productionOrderFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/manufacturing/orders/new")({
  component: ProductionOrderNewPage,
});

function ProductionOrderNewPage() {
  return (
    <RecordEditor
      id="new"
      table="production_orders"
      fields={productionOrderFields}
      entityLabel="Production Order"
      listHref="/manufacturing/orders"
      titleKey="number"
      writeRoles={["manufacturing"]}
      permissionModule="manufacturing"
    />
  );
}
