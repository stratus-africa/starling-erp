import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/accounting/reconciliation")({
  component: () => {
    const m = modules["accounting.reconciliation"];
    return <ModulePage {...m} />;
  },
});
