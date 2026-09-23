import { createFileRoute, Outlet } from "@tanstack/react-router";
import { FieldShell } from "@/components/field/field-ui";

export const Route = createFileRoute("/_authenticated/field")({
  head: () => ({
    meta: [
      { title: "Field Sales — Stratus ERP" },
      { name: "description", content: "Mobile field sales: customers, leads, quotes, orders and payments." },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
  }),
  component: () => (
    <FieldShell>
      <Outlet />
    </FieldShell>
  ),
});
