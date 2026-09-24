import { useEffect } from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { FieldShell } from "@/components/field/field-ui";
import { startFieldOfflineCache } from "@/lib/field-offline-cache";
import { syncAll } from "@/lib/field-sync";

export const Route = createFileRoute("/_authenticated/field")({
  head: () => ({
    meta: [
      { title: "Field Sales — Stratus ERP" },
      { name: "description", content: "Mobile field sales: customers, leads, quotes, orders and payments." },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
  }),
  component: FieldLayout,
});

function FieldLayout() {
  const qc = useQueryClient();
  useEffect(() => {
    const stop = startFieldOfflineCache(qc);
    // send anything left in the queue from a previous session
    if (navigator.onLine) void syncAll();
    return stop;
  }, [qc]);
  return (
    <FieldShell>
      <Outlet />
    </FieldShell>
  );
}
