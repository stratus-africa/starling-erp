import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { modules } from "@/lib/modules";

export const Route = createFileRoute("/inventory/ledger")({
  component: () => {
    const m = modules["inventory.ledger"];
    return <ModulePage {...m} />;
  },
});
