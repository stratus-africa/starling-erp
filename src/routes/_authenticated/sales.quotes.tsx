import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/sales/quotes")({
  component: () => {
    const m = modules["sales.quotes"];
    return <ModulePage {...m} />;
  },
});
