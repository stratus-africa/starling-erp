import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/settings/notifications")({
  component: () => {
    const m = modules["settings.notifications"];
    return <ModulePage {...m} />;
  },
});
