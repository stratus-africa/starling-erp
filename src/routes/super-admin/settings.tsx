import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PageStub } from "@/components/super-admin/page-stub";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";

export const Route = createFileRoute("/super-admin/settings")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.settingsView}>
      <PageStub title="Platform Settings" description="Platform-wide configuration applied to every tenant."
        permission={PLATFORM_PERMISSIONS.settingsView} />
    </PermissionGuard>
  ),
});
