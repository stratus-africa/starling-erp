import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PageStub } from "@/components/super-admin/page-stub";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";

export const Route = createFileRoute("/super-admin/errors")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.systemView}>
      <PageStub title="Errors" description="Platform-level error tracking and exception monitoring."
        permission={PLATFORM_PERMISSIONS.systemView} />
    </PermissionGuard>
  ),
});
