import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PageStub } from "@/components/super-admin/page-stub";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";

export const Route = createFileRoute("/super-admin/payments")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.billingView}>
      <PageStub title="Payments" description="Payment transactions and billing history across all tenants."
        permission={PLATFORM_PERMISSIONS.billingView} />
    </PermissionGuard>
  ),
});
