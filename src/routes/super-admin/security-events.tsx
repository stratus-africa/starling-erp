import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PageStub } from "@/components/super-admin/page-stub";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";

export const Route = createFileRoute("/super-admin/security-events")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.securityView}>
      <PageStub title="Security Events" description="Platform security signals, anomalies, and threat indicators."
        permission={PLATFORM_PERMISSIONS.securityView} />
    </PermissionGuard>
  ),
});
