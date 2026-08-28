import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PageStub } from "@/components/super-admin/page-stub";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";

export const Route = createFileRoute("/super-admin/announcements")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.announcementsView}>
      <PageStub title="Announcements" description="Platform-wide announcements broadcast to all tenants."
        permission={PLATFORM_PERMISSIONS.announcementsView} />
    </PermissionGuard>
  ),
});
