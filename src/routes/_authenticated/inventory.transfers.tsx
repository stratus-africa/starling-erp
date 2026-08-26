import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { inventoryTransferFields } from "@/lib/module-schemas";

export const Route = createFileRoute("/_authenticated/inventory/transfers")({
  component: () => (
    <DataModulePage title="Stock Transfers" description="Move stock between warehouses."
      table="inventory_transfers" entityLabel="Transfer" fields={inventoryTransferFields}
      writeRoles={["inventory"]} searchColumn="number"
      postAction={{ rpc: "post_transfer", paramName: "_transfer_id", label: "Post Transfer", showWhen: (row) => row.status !== "Completed" }} />
  ),
});
