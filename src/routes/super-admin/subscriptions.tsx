import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PageStub } from "@/components/super-admin/page-stub";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";

export const Route = createFileRoute("/super-admin/subscriptions")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.billingView}>
      <PageStub title="Subscriptions" description="Active and historical tenant subscription records."
        permission={PLATFORM_PERMISSIONS.billingView} />
    </PermissionGuard>
  ),
});
