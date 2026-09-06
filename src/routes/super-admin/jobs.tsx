import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { BackgroundJobsPage } from "@/routes/super-admin/monitoring/jobs";

export const Route = createFileRoute("/super-admin/jobs")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.systemView}>
      <BackgroundJobsPage />
    </PermissionGuard>
  ),
});
