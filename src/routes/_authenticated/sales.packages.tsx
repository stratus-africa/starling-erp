import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/sales/packages")({
  component: () => {
    const m = modules["sales.packages"];
    return <ModulePage {...m} />;
  },
});
