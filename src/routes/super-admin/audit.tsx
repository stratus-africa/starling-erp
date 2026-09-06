import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/super-admin/audit")({
  component: () => <Navigate to="/super-admin/security/audit" replace />,
});
