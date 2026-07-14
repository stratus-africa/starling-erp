import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/purchasing/bills")({
  component: () => {
    const m = modules["purchasing.bills"];
    return <ModulePage {...m} />;
  },
});
