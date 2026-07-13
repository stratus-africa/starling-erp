import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/sales/payments")({
  component: () => {
    const m = modules["sales.payments"];
    return <ModulePage {...m} />;
  },
});
