import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/sales/orders")({
  component: () => {
    const m = modules["sales.orders"];
    return <ModulePage {...m} />;
  },
});
