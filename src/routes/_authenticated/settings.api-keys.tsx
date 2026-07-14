import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/settings/api-keys")({
  component: () => {
    const m = modules["settings.api-keys"];
    return <ModulePage {...m} />;
  },
});
