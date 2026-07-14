import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/accounting/banking")({
  component: () => {
    const m = modules["accounting.banking"];
    return <ModulePage {...m} />;
  },
});
