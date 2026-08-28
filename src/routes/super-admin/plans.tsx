import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PageStub } from "@/components/super-admin/page-stub";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";

export const Route = createFileRoute("/super-admin/plans")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.plansView}>
      <PageStub title="Plans" description="Subscription plan catalogue and pricing configuration."
        permission={PLATFORM_PERMISSIONS.plansView} />
    </PermissionGuard>
  ),
});
