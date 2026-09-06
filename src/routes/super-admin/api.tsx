import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { ApiMonitoringPage } from "@/routes/super-admin/monitoring/api";

export const Route = createFileRoute("/super-admin/api")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.systemView}>
      <ApiMonitoringPage />
    </PermissionGuard>
  ),
});
