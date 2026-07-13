import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/reports/manufacturing")({
  component: () => {
    const m = modules["reports.manufacturing"];
    return <ModulePage {...m} />;
  },
});
