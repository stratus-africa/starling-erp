import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/settings/payment-terms")({
  component: () => {
    const m = modules["settings.payment-terms"];
    return <ModulePage {...m} />;
  },
});
