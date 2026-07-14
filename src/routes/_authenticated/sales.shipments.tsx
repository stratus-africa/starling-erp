import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/sales/shipments")({
  component: () => {
    const m = modules["sales.shipments"];
    return <ModulePage {...m} />;
  },
});
