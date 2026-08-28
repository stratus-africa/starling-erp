import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PageStub } from "@/components/super-admin/page-stub";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";

export const Route = createFileRoute("/super-admin/users")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.usersView}>
      <PageStub title="Users" description="All users across every tenant on the platform."
        permission={PLATFORM_PERMISSIONS.usersView} />
    </PermissionGuard>
  ),
});
