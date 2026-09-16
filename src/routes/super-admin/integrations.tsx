import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/super-admin/integrations")({
  component: () => <Navigate to="/super-admin/settings" replace />,
});
