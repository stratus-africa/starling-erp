import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/reports/purchases")({
  component: () => {
    const m = modules["reports.purchases"];
    return <ModulePage {...m} />;
  },
});
