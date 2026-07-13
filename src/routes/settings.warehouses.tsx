import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/settings/warehouses")({
  component: () => {
    const m = modules["settings.warehouses"];
    return <ModulePage {...m} />;
  },
});
