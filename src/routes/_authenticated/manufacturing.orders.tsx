import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { productionOrderFields } from "@/lib/module-schemas";

export const Route = createFileRoute("/_authenticated/manufacturing/orders")({
  component: () => (
    <DataModulePage title="Production Orders" description="Plan and track manufacturing runs."
      table="production_orders" entityLabel="Production Order" fields={productionOrderFields}
      writeRoles={["manufacturing"]} searchColumn="number" />
  ),
});
