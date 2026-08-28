import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PageStub } from "@/components/super-admin/page-stub";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";

export const Route = createFileRoute("/super-admin/support-sessions")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.supportView}>
      <PageStub title="Support Sessions" description="Active and historical tenant impersonation sessions."
        permission={PLATFORM_PERMISSIONS.supportView} />
    </PermissionGuard>
  ),
});
