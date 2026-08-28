/**
 * PermissionGuard
 *
 * Wraps any super-admin page section.  If the current admin does not have
 * the required platform permission the guard renders a "permission denied"
 * panel instead of the children.
 *
 * This is a defence-in-depth measure — the DB RPCs also check permissions
 * server-side.  The guard prevents the UI from even attempting the RPC.
 *
 * Usage:
 *   <PermissionGuard permission={PLATFORM_PERMISSIONS.tenantsView}>
 *     <TenantsContent />
 *   </PermissionGuard>
 *
 *   <PermissionGuard permission={[PLATFORM_PERMISSIONS.plansView, PLATFORM_PERMISSIONS.billingView]}>
 *     ...
 *   </PermissionGuard>
 */

import { type ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import type { PlatformPermission } from "@/lib/platform-permissions";

interface Props {
  permission: PlatformPermission | PlatformPermission[];
  children:   ReactNode;
  /** Custom denied message */
  message?:   string;
}

export function PermissionGuard({ permission, children, message }: Props) {
  const { canPlatform } = usePlatformAuth();

  if (!canPlatform(permission)) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <ShieldAlert className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-sm font-semibold">Permission required</h3>
        <p className="text-xs text-muted-foreground max-w-xs">
          {message ?? "Your platform role does not have permission to access this section."}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
