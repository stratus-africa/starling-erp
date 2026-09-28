import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, MinusCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";

export const Route = createFileRoute("/super-admin/roles")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.adminsView}>
      <RolesContent />
    </PermissionGuard>
  ),
});

interface PlatformRoleRow {
  name: string;
  description: string | null;
  is_system: boolean;
}

interface PlatformPermissionRow {
  code: string;
  module: string;
  action: string;
  description: string | null;
}

interface RolePermissionRow {
  role_name: string;
  permission_code: string;
}

const labelize = (value: string) =>
  value
    .replace(/^platform\./, "")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

function RolesContent() {
  const query = useQuery({
    queryKey: ["super-admin", "platform-role-matrix"],
    queryFn: async () => {
      const [rolesResult, permissionsResult, assignmentsResult] = await Promise.all([
        (supabase as any).from("platform_roles").select("name, description, is_system").order("name"),
        (supabase as any).from("platform_permissions").select("code, module, action, description").order("module").order("code"),
        (supabase as any).from("platform_role_permissions").select("role_name, permission_code").order("role_name").order("permission_code"),
      ]);

      if (rolesResult.error) throw rolesResult.error;
      if (permissionsResult.error) throw permissionsResult.error;
      if (assignmentsResult.error) throw assignmentsResult.error;

      return {
        roles: (rolesResult.data ?? []) as PlatformRoleRow[],
        permissions: (permissionsResult.data ?? []) as PlatformPermissionRow[],
        assignments: (assignmentsResult.data ?? []) as RolePermissionRow[],
      };
    },
  });

  const roles = query.data?.roles ?? [];
  const permissions = query.data?.permissions ?? [];
  const assignmentSet = new Set(
    (query.data?.assignments ?? []).map((row) => `${row.role_name}:${row.permission_code}`),
  );
  const modules = Array.from(new Set(permissions.map((permission) => permission.module)));

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Roles & Permissions</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Current platform roles and permission assignments from the access-control database.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {query.isLoading && (
        <Card className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading platform roles…
        </Card>
      )}

      {query.isError && (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <ShieldCheck className="h-8 w-8 text-destructive" />
          <div>
            <p className="text-sm font-semibold">Unable to load roles and permissions</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {query.error instanceof Error ? query.error.message : "The live access-control records could not be loaded."}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>Retry</Button>
        </Card>
      )}

      {!query.isLoading && !query.isError && roles.length === 0 && (
        <Card className="p-10 text-center text-sm text-muted-foreground">No platform roles are configured.</Card>
      )}

      {!query.isLoading && !query.isError && roles.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {roles.map((role) => {
              const assigned = (query.data?.assignments ?? []).filter((row) => row.role_name === role.name).length;
              return (
                <Card key={role.name} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{labelize(role.name)}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {role.description || "No description has been recorded for this role."}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{assigned}</span>
                  </div>
                  <p className="mt-3 font-mono text-[10px] text-muted-foreground">{role.name}</p>
                </Card>
              );
            })}
          </div>

          {permissions.length === 0 ? (
            <Card className="p-10 text-center text-sm text-muted-foreground">No platform permissions are configured.</Card>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60">
                    <tr className="border-b">
                      <th className="w-64 px-4 py-2.5 text-left text-[11px] font-semibold uppercase text-muted-foreground">Permission</th>
                      {roles.map((role) => (
                        <th key={role.name} className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase text-muted-foreground whitespace-nowrap">
                          {labelize(role.name)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map((module) => (
                      <PermissionModule
                        key={module}
                        module={module}
                        permissions={permissions.filter((permission) => permission.module === module)}
                        roles={roles}
                        assignmentSet={assignmentSet}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PermissionModule({
  module,
  permissions,
  roles,
  assignmentSet,
}: {
  module: string;
  permissions: PlatformPermissionRow[];
  roles: PlatformRoleRow[];
  assignmentSet: Set<string>;
}) {
  return (
    <>
      <tr className="border-b border-t bg-muted/20">
        <td colSpan={roles.length + 1} className="px-4 py-1.5 text-[11px] font-bold uppercase text-muted-foreground">
          {labelize(module)}
        </td>
      </tr>
      {permissions.map((permission) => (
        <tr key={permission.code} className="border-b hover:bg-muted/20">
          <td className="px-4 py-2 pl-8">
            <p className="text-xs font-medium">{permission.description || labelize(permission.action)}</p>
            <p className="font-mono text-[10px] text-muted-foreground">{permission.code}</p>
          </td>
          {roles.map((role) => {
            const assigned = assignmentSet.has(`${role.name}:${permission.code}`);
            return (
              <td key={role.name} className="px-3 py-2 text-center">
                {assigned ? (
                  <CheckCircle2 className="mx-auto h-3.5 w-3.5 text-emerald-500" aria-label="Assigned" />
                ) : (
                  <MinusCircle className="mx-auto h-3.5 w-3.5 text-muted-foreground/20" aria-label="Not assigned" />
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}