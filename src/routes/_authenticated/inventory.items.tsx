import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/inventory/items")({
  component: () => {
    const m = modules["inventory.items"];
    return <ModulePage {...m} />;
  },
});
