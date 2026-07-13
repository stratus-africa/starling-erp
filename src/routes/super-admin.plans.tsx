import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/super-admin/plans")({
  component: () => {
    const m = modules["super-admin.plans"];
    return <ModulePage {...m} />;
  },
});
