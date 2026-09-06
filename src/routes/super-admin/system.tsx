import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { SystemHealthPage } from "@/routes/super-admin/monitoring/health";

export const Route = createFileRoute("/super-admin/system")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.systemView}>
      <SystemHealthPage />
    </PermissionGuard>
  ),
});
