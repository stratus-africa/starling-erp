import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PageStub } from "@/components/super-admin/page-stub";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";

export const Route = createFileRoute("/super-admin/features")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.featuresView}>
      <PageStub title="Feature Flags" description="Enable and disable feature flags per tenant."
        permission={PLATFORM_PERMISSIONS.featuresView} />
    </PermissionGuard>
  ),
});
