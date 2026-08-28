import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PageStub } from "@/components/super-admin/page-stub";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";

export const Route = createFileRoute("/super-admin/integrations")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.settingsView}>
      <PageStub title="Integrations" description="Third-party integrations and webhook configuration."
        permission={PLATFORM_PERMISSIONS.settingsView} />
    </PermissionGuard>
  ),
});
