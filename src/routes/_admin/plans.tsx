import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { PlansAndEntitlementsPage } from "@/routes/super-admin/billing/plans";

export const Route = createFileRoute("/super-admin/plans")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.plansView}>
      <PlansAndEntitlementsPage />
    </PermissionGuard>
  ),
});
