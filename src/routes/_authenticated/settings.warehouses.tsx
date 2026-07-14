import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/settings/warehouses")({
  component: () => {
    const m = modules["settings.warehouses"];
    return <ModulePage {...m} />;
  },
});
