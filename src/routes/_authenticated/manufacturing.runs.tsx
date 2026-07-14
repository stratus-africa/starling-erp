import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/manufacturing/runs")({
  component: () => {
    const m = modules["manufacturing.runs"];
    return <ModulePage {...m} />;
  },
});
