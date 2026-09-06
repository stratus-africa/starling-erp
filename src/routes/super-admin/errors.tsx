import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { ErrorMonitoringPage } from "@/routes/super-admin/monitoring/errors";

export const Route = createFileRoute("/super-admin/errors")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.systemView}>
      <ErrorMonitoringPage />
    </PermissionGuard>
  ),
});
