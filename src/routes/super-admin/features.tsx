import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { FeatureFlagsManagementPage } from "@/routes/super-admin/platform/features";

export const Route = createFileRoute("/super-admin/features")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.featuresView}>
      <FeatureFlagsManagementPage />
    </PermissionGuard>
  ),
});
