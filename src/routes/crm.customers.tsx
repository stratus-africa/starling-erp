import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/crm/customers")({
  component: () => {
    const m = modules["crm.customers"];
    return <ModulePage {...m} />;
  },
});
