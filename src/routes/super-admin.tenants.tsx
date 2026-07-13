import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/super-admin/tenants")({
  component: () => {
    const m = modules["super-admin.tenants"];
    return <ModulePage {...m} />;
  },
});
