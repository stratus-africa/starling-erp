import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/super-admin/users")({
  component: () => {
    const m = modules["super-admin.users"];
    return <ModulePage {...m} />;
  },
});
