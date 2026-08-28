import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PageStub } from "@/components/super-admin/page-stub";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";

export const Route = createFileRoute("/super-admin/admins")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.adminsView}>
      <PageStub title="Platform Admins" description="Grant and revoke platform administrator access."
        permission={PLATFORM_PERMISSIONS.adminsView} />
    </PermissionGuard>
  ),
});
