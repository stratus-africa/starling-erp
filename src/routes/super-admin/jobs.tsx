import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PageStub } from "@/components/super-admin/page-stub";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";

export const Route = createFileRoute("/super-admin/jobs")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.systemView}>
      <PageStub title="Background Jobs" description="Scheduled tasks, queues, and job execution history."
        permission={PLATFORM_PERMISSIONS.systemView} />
    </PermissionGuard>
  ),
});
