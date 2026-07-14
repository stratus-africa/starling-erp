import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/reports/inventory")({
  component: () => {
    const m = modules["reports.inventory"];
    return <ModulePage {...m} />;
  },
});
