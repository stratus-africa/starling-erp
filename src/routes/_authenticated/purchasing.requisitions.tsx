import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/purchasing/requisitions")({
  component: () => {
    const m = modules["purchasing.requisitions"];
    return <ModulePage {...m} />;
  },
});
