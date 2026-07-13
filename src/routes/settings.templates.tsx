import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/settings/templates")({
  component: () => {
    const m = modules["settings.templates"];
    return <ModulePage {...m} />;
  },
});
