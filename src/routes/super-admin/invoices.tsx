import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PageStub } from "@/components/super-admin/page-stub";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";

export const Route = createFileRoute("/super-admin/invoices")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.billingView}>
      <PageStub title="Invoices" description="Platform invoices and billing documents."
        permission={PLATFORM_PERMISSIONS.billingView} />
    </PermissionGuard>
  ),
});
