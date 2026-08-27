import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { productionOrderFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/manufacturing/orders")({
  component: () => (
    <DataModulePage
      title="Production Orders"
      description="Plan and track manufacturing runs."
      table="production_orders"
      entityLabel="Production Order"
      fields={productionOrderFields}
      writeRoles={["manufacturing"]}
      searchColumn="number"
      postAction={{
        rpc: "post_production_order",
        paramName: "_order_id",
        label: "Complete & Post",
        showWhen: (row) => row.status !== "Completed",
      }}
      voidAction={{ entityType: "production_order", permission: "manufacturing.void" }}
    />
  ),
});
