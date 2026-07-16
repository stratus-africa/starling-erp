import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_admin/")({
  component: () => <Navigate to="/admin/tenants" />,
});
