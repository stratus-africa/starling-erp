import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/super-admin/invoices")({
  component: () => <Navigate to="/super-admin/billing/subscriptions" replace />,
});
