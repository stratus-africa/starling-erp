import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { productionOrderFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/manufacturing/orders/")({
  component: () => (
    <DataModulePage
      title="Manufacturing Orders"
      description="Plan, reserve, and track MTO and MTS production."
      table="production_orders"
      entityLabel="Manufacturing Order"
      fields={productionOrderFields}
      writeRoles={["manufacturing"]}
      searchColumn="number"
      rowHref={(row) => `/manufacturing/orders/${row.id}`}
      createHref="/manufacturing/orders/new"
      filterFields={[
        { key: "manufacturing_type", label: "Type", options: ["MTO", "MTS"] },
        {
          key: "source_type",
          label: "Source",
          options: ["sales_order", "production_plan", "stock_replenishment", "manual_manufacturing"],
        },
        { key: "planned_start_from", label: "Start From", options: [], type: "date" },
        { key: "planned_start_to", label: "Start To", options: [], type: "date" },
        {
          key: "status",
          label: "Status",
          options: [
            "Draft",
            "Planned",
            "Confirmed",
            "Material Reserved",
            "Released",
            "In Progress",
            "Quality Check",
            "Completed",
            "Closed",
            "Cancelled",
          ],
        },
      ]}
      postAction={{
        rpc: "post_production_order",
        paramName: "_order_id",
        label: "Complete & Post",
        showWhen: (row) => row.status === "Quality Check",
      }}
      voidAction={{ entityType: "production_order", permission: "manufacturing.void" }}
    />
  ),
});
