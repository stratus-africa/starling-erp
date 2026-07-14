import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/super-admin/settings")({
  component: () => {
    const m = modules["super-admin.settings"];
    return <ModulePage {...m} />;
  },
});
