import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { inventoryAdjustmentFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/inventory/adjustments")({
  component: () => (
    <DataModulePage
      title="Inventory Adjustments"
      description="Post stock adjustments with a reason."
      table="inventory_adjustments"
      entityLabel="Adjustment"
      fields={inventoryAdjustmentFields}
      writeRoles={["inventory"]}
      searchColumn="number"
      postAction={{
        rpc: "post_adjustment",
        paramName: "_adjustment_id",
        label: "Post",
        showWhen: (row) => row.status !== "Posted",
      }}
      voidAction={{ entityType: "adjustment", permission: "inventory.void" }}
    />
  ),
});
