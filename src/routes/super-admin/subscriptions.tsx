import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { SubscriptionManagementPage } from "@/routes/super-admin/billing/subscriptions";

export const Route = createFileRoute("/super-admin/subscriptions")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.billingView}>
      <SubscriptionManagementPage />
    </PermissionGuard>
  ),
});
