import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/inventory/warehouses")({
  component: () => {
    const m = modules["inventory.warehouses"];
    return <ModulePage {...m} />;
  },
});
