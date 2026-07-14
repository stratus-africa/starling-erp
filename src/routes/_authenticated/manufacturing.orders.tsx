import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/manufacturing/orders")({
  component: () => {
    const m = modules["manufacturing.orders"];
    return <ModulePage {...m} />;
  },
});
