import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/purchasing/payments")({
  component: () => {
    const m = modules["purchasing.payments"];
    return <ModulePage {...m} />;
  },
});
