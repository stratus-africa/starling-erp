import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/reports/sales")({
  component: () => {
    const m = modules["reports.sales"];
    return <ModulePage {...m} />;
  },
});
