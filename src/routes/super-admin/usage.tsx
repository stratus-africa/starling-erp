import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PageStub } from "@/components/super-admin/page-stub";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";

export const Route = createFileRoute("/super-admin/usage")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.systemView}>
      <PageStub title="Usage" description="Storage, user counts, and resource consumption per tenant."
        permission={PLATFORM_PERMISSIONS.systemView} />
    </PermissionGuard>
  ),
});
