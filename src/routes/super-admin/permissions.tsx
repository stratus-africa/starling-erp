/**
 * Super Admin — Workspace Permission Matrices
 *
 * Route: /super-admin/permissions
 * Lists every workspace and lets a platform admin edit that workspace's
 * role permission matrix (stored as tenant-scoped overrides).
 */

import { Fragment, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Layers, Loader2, Search, Shield } from "lucide-react";

import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { db } from "@/lib/typed-db";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/super-admin/permissions")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.tenantsView}>
      <WorkspacePermissionsContent />
    </PermissionGuard>
  ),
});

type TenantRow = {
  id: string;
  name: string;
  slug: string | null;
  status: string | null;
  override_count: number;
  user_count: number;
};

type PermissionRow = { code: string; module: string; action: string; description: string | null };

const ACCOUNTING_ROLES = ["accountant", "finance_clerk", "auditor", "accounting"];
const OTHER_ROLES = ["sales", "purchasing", "inventory", "manufacturing", "viewer"];
const ACCOUNTING_MODULES = new Set(["accounting", "banking", "payments", "reports"]);

const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function Matrix({
  permissions,
  roles,
  grants,
  overrides,
  changing,
  onToggle,
  canEdit,
}: {
  permissions: PermissionRow[];
  roles: string[];
  grants: Set<string>;
  overrides: Map<string, boolean>;
  changing: string | null;
  onToggle: (role: string, code: string, enabled: boolean) => void;
  canEdit: boolean;
}) {
  const sections = permissions.reduce<Record<string, PermissionRow[]>>((groups, permission) => {
    const key = permission.module.split(".").map(titleCase).join(" · ");
    (groups[key] ??= []).push(permission);
    return groups;
  }, {});

  const isGranted = (role: string, code: string) => overrides.get(`${role}:${code}`) ?? grants.has(`${role}:${code}`);

  if (permissions.length === 0) {
    return <div className="rounded-lg border p-6 text-sm text-muted-foreground">No permissions defined.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[780px] text-sm">
        <thead className="bg-muted/60">
          <tr className="border-b text-[11px] font-semibold uppercase text-muted-foreground">
            <th className="w-72 px-3 py-2.5 text-left">Permission</th>
            {roles.map((role) => (
              <th key={role} className="min-w-24 px-3 py-2.5 text-center">
                {titleCase(role)}
              </th>
            ))}
            <th className="w-56 px-3 py-2.5 text-left">Code</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(sections).map(([section, rows]) => (
            <Fragment key={section}>
              <tr className="border-t bg-muted/30">
                <td colSpan={roles.length + 2} className="px-3 py-1.5 text-[11px] font-bold uppercase text-primary">
                  {section}
                </td>
              </tr>
              {rows.map((permission) => (
                <tr key={permission.code} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-3 py-2 pl-6 text-xs font-medium">
                    {permission.description ?? titleCase(permission.action)}
                  </td>
                  {roles.map((role) => {
                    const key = `${role}:${permission.code}`;
                    const checked = isGranted(role, permission.code);
                    return (
                      <td key={role} className="px-3 py-2 text-center">
                        <div className="flex justify-center">
                          <Checkbox
                            aria-label={`${checked ? "Disable" : "Enable"} ${permission.code} for ${titleCase(role)}`}
                            checked={checked}
                            disabled={!canEdit || changing === key}
                            onCheckedChange={(value) => onToggle(role, permission.code, value === true)}
                          />
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2">
                    <code className="select-all text-[10px] text-muted-foreground">{permission.code}</code>
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WorkspacePermissionsContent() {
  const { hasPermission } = usePlatformAuth();
  const queryClient = useQueryClient();
  const canEdit = hasPermission(PLATFORM_PERMISSIONS.tenantsUpdate);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["platform-tenant-permission-matrices"],
    queryFn: async () => {
      const { data: result, error: rpcError } = await db.rpc("admin_list_tenant_permission_matrices");
      if (rpcError) throw rpcError;
      const payload = (result ?? {}) as {
        tenants?: TenantRow[];
        permissions?: PermissionRow[];
        grants?: { role: string; permission_code: string }[];
        overrides?: { tenant_id: string; role: string; permission_code: string; enabled: boolean }[];
      };
      return {
        tenants: payload.tenants ?? [],
        permissions: payload.permissions ?? [],
        grants: payload.grants ?? [],
        overrides: payload.overrides ?? [],
      };
    },
  });

  const update = useMutation({
    mutationFn: async (vars: { tenantId: string; role: string; code: string; enabled: boolean }) => {
      const { error: rpcError } = await db.rpc("admin_set_tenant_role_permission_override", {
        _tenant_id: vars.tenantId,
        _role: vars.role,
        _permission_code: vars.code,
        _enabled: vars.enabled,
      });
      if (rpcError) throw rpcError;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platform-tenant-permission-matrices"] });
      toast.success("Permission updated");
    },
    onError: (err: Error) => toast.error(err.message || "Permission update failed"),
  });

  const tenants = data?.tenants ?? [];
  const activeId = selected ?? tenants[0]?.id ?? null;
  const active = tenants.find((tenant) => tenant.id === activeId) ?? null;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tenants;
    return tenants.filter(
      (tenant) => tenant.name?.toLowerCase().includes(term) || (tenant.slug ?? "").toLowerCase().includes(term),
    );
  }, [tenants, search]);

  const grants = useMemo(
    () => new Set((data?.grants ?? []).map((row) => `${row.role}:${row.permission_code}`)),
    [data?.grants],
  );

  const overrides = useMemo(
    () =>
      new Map(
        (data?.overrides ?? [])
          .filter((row) => row.tenant_id === activeId)
          .map((row) => [`${row.role}:${row.permission_code}`, Boolean(row.enabled)] as [string, boolean]),
      ),
    [data?.overrides, activeId],
  );

  const permissions = data?.permissions ?? [];
  const accountingPermissions = permissions.filter((p) => ACCOUNTING_MODULES.has(p.module.split(".")[0]));
  const otherPermissions = permissions.filter((p) => !ACCOUNTING_MODULES.has(p.module.split(".")[0]));
  const changing = update.isPending ? `${update.variables?.role}:${update.variables?.code}` : null;

  const toggle = (role: string, code: string, enabled: boolean) => {
    if (!activeId) return;
    update.mutate({ tenantId: activeId, role, code, enabled });
  };

  return (
    <div className="flex w-full flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Layers className="h-5 w-5" /> Workspace Permission Matrices
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Pick a workspace, then tick or untick a permission to change what each role can do inside it.
          Workspace administrators always keep full access.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="h-fit overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search workspaces…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-8 bg-background pl-8 text-sm"
              />
            </div>
          </div>
          <div className="max-h-[70vh] divide-y overflow-y-auto">
            {isLoading && (
              <div className="grid place-items-center py-10">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">No workspaces found.</div>
            )}
            {filtered.map((tenant) => (
              <button
                key={tenant.id}
                type="button"
                onClick={() => setSelected(tenant.id)}
                className={`flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 ${
                  tenant.id === activeId ? "bg-primary/5" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    {tenant.name}
                  </span>
                  {tenant.status && (
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {tenant.status}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-mono">{tenant.slug ?? "—"}</span>
                  <span>·</span>
                  <span>
                    {tenant.user_count} user{tenant.user_count === 1 ? "" : "s"}
                  </span>
                  <span>·</span>
                  <span>
                    {tenant.override_count} custom rule{tenant.override_count === 1 ? "" : "s"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{active?.name ?? "Select a workspace"}</h2>
            {active && (
              <Badge variant="secondary" className="text-[11px]">
                {overrides.size} custom rule{overrides.size === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
          {!canEdit && (
            <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <Shield className="mt-0.5 h-4 w-4" />
              You can review these matrices but not change them.
            </div>
          )}
          {isLoading || !active ? (
            <div className="grid min-h-48 place-items-center rounded-lg border">
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <span className="text-sm text-muted-foreground">Pick a workspace to see its matrix.</span>
              )}
            </div>
          ) : (
            <Tabs defaultValue="accounting" className="w-full">
              <TabsList className="h-auto w-full justify-start overflow-x-auto">
                <TabsTrigger value="accounting">Accounting Permission Matrix</TabsTrigger>
                <TabsTrigger value="other">Other Module Matrix</TabsTrigger>
              </TabsList>
              <TabsContent value="accounting" className="pt-3">
                <Matrix
                  permissions={accountingPermissions}
                  roles={ACCOUNTING_ROLES}
                  grants={grants}
                  overrides={overrides}
                  changing={changing}
                  onToggle={toggle}
                  canEdit={canEdit}
                />
              </TabsContent>
              <TabsContent value="other" className="pt-3">
                <Matrix
                  permissions={otherPermissions}
                  roles={OTHER_ROLES}
                  grants={grants}
                  overrides={overrides}
                  changing={changing}
                  onToggle={toggle}
                  canEdit={canEdit}
                />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
