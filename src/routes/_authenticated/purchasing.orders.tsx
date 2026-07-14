import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/purchasing/orders")({
  component: () => {
    const m = modules["purchasing.orders"];
    return <ModulePage {...m} />;
  },
});
