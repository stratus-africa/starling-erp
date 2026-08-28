import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PageStub } from "@/components/super-admin/page-stub";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";

export const Route = createFileRoute("/super-admin/sessions")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.securityView}>
      <PageStub title="Sessions" description="Active authentication sessions across the platform."
        permission={PLATFORM_PERMISSIONS.securityView} />
    </PermissionGuard>
  ),
});
