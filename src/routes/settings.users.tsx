import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/settings/users")({
  component: () => {
    const m = modules["settings.users"];
    return <ModulePage {...m} />;
  },
});
