import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/settings/numbering")({
  component: () => {
    const m = modules["settings.numbering"];
    return <ModulePage {...m} />;
  },
});
