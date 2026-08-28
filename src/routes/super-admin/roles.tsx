import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS, PLATFORM_ROLE_LABELS, PLATFORM_ROLE_DESCRIPTIONS, PLATFORM_PERMISSION_GROUPS, PLATFORM_ROLE_PERMISSIONS, PLATFORM_ROLES } from "@/lib/platform-permissions";
import type { PlatformRole } from "@/lib/platform-permissions";
import { CheckCircle2, MinusCircle } from "lucide-react";

export const Route = createFileRoute("/super-admin/roles")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.adminsView}>
      <RolesContent />
    </PermissionGuard>
  ),
});

const ROLE_ORDER: PlatformRole[] = [
  PLATFORM_ROLES.superAdmin,
  PLATFORM_ROLES.platformAdmin,
  PLATFORM_ROLES.supportAdmin,
  PLATFORM_ROLES.billingAdmin,
  PLATFORM_ROLES.securityAdmin,
  PLATFORM_ROLES.readonly,
];

function RolesContent() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Roles & Permissions</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Platform role capability matrix. Authorization is always enforced server-side.
          This table is for reference only.
        </p>
      </div>

      {/* Role cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ROLE_ORDER.map((role) => (
          <div key={role} className="rounded-xl border bg-card p-4 space-y-2">
            <p className="text-sm font-semibold">{PLATFORM_ROLE_LABELS[role]}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{PLATFORM_ROLE_DESCRIPTIONS[role]}</p>
            <p className="font-mono text-[10px] text-muted-foreground/60">{role}</p>
          </div>
        ))}
      </div>

      {/* Permission matrix table */}
      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr className="border-b">
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-56">Permission</th>
                {ROLE_ORDER.map((role) => (
                  <th key={role} className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    {PLATFORM_ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLATFORM_PERMISSION_GROUPS.map((group) => (
                <>
                  <tr key={`grp-${group.module}`} className="bg-muted/20 border-t border-b">
                    <td colSpan={ROLE_ORDER.length + 1} className="px-4 py-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        {group.label}
                      </span>
                    </td>
                  </tr>
                  {group.permissions.map((perm) => (
                    <tr key={perm.code} className="border-b hover:bg-muted/20">
                      <td className="px-4 py-2 pl-8">
                        <p className="text-xs font-medium">{perm.label}</p>
                        <p className="font-mono text-[10px] text-muted-foreground/50">{perm.code}</p>
                      </td>
                      {ROLE_ORDER.map((role) => {
                        const has = PLATFORM_ROLE_PERMISSIONS[role].includes(perm.code);
                        return (
                          <td key={role} className="px-3 py-2 text-center">
                            {has
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                              : <MinusCircle  className="h-3.5 w-3.5 text-muted-foreground/20 mx-auto" />
                            }
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
