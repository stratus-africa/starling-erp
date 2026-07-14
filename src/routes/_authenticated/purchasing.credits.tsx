import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/purchasing/credits")({
  component: () => {
    const m = modules["purchasing.credits"];
    return <ModulePage {...m} />;
  },
});
