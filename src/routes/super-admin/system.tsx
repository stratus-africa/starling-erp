import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PageStub } from "@/components/super-admin/page-stub";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";

export const Route = createFileRoute("/super-admin/system")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.systemView}>
      <PageStub title="System Health" description="Infrastructure metrics, uptime, and database health."
        permission={PLATFORM_PERMISSIONS.systemView} />
    </PermissionGuard>
  ),
});
