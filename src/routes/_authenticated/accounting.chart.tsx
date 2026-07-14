import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/accounting/chart")({
  component: () => {
    const m = modules["accounting.chart"];
    return <ModulePage {...m} />;
  },
});
