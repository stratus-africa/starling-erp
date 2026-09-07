import { Fragment } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Layers, Loader2, Shield } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { db } from "@/lib/typed-db";

interface RoleSpec {
  role: string;
  label: string;
  description: string;
  modules: string[];
  badge: string;
}

interface PermissionRow {
  code: string;
  module: string;
  action: string;
  description: string | null;
}

const ALL_ROLES: RoleSpec[] = [
  { role: "super_admin", label: "Super Admin", description: "Platform-wide access across all workspaces.", modules: ["Everything"], badge: "bg-primary/10 text-primary border-primary/20" },
  { role: "tenant_admin", label: "Tenant Admin", description: "Full workspace access, including users, roles, and settings.", modules: ["Everything in workspace"], badge: "bg-primary/10 text-primary border-primary/20" },
  { role: "accountant", label: "Accountant", description: "Full accounting, banking, payment, and reporting capability.", modules: ["Accounting", "Banking", "Payments", "Reports"], badge: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20" },
  { role: "finance_clerk", label: "Finance Clerk", description: "Day-to-day accounting entry and reporting access.", modules: ["Accounting", "Reports"], badge: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20" },
  { role: "auditor", label: "Auditor", description: "Read-focused financial and operational review access.", modules: ["Accounting", "Reports", "Operations"], badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20" },
  { role: "accounting", label: "Accounting", description: "General accounting, banking, payments, and reports access.", modules: ["Accounting", "Banking", "Payments", "Reports"], badge: "bg-muted text-muted-foreground border-border" },
  { role: "sales", label: "Sales", description: "Customers, quotes, orders, invoices, and receipts.", modules: ["CRM", "Sales", "Payments"], badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20" },
  { role: "purchasing", label: "Purchasing", description: "Suppliers, requisitions, purchase orders, bills, and expenses.", modules: ["Purchasing"], badge: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20" },
  { role: "inventory", label: "Inventory", description: "Items, warehouses, adjustments, and stock transfers.", modules: ["Inventory"], badge: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20" },
  { role: "manufacturing", label: "Manufacturing", description: "Bills of materials and production orders.", modules: ["Manufacturing"], badge: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20" },
  { role: "viewer", label: "Viewer", description: "Read-only access where permissions are enabled.", modules: ["Read access"], badge: "bg-muted text-muted-foreground border-border" },
];

const ACCOUNTING_ROLES = ["tenant_admin", "accountant", "finance_clerk", "auditor", "accounting"];
const OTHER_ROLES = ["tenant_admin", "sales", "purchasing", "inventory", "manufacturing", "viewer"];
const ACCOUNTING_MODULES = new Set(["accounting", "banking", "payments", "reports"]);

const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function RoleCard({ spec }: { spec: RoleSpec }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold ${spec.badge}`}>{spec.role}</span>
        <Link to="/settings/users" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">Assign <ArrowRight className="h-3 w-3" /></Link>
      </div>
      <h3 className="text-sm font-semibold">{spec.label}</h3>
      <p className="text-xs leading-relaxed text-muted-foreground">{spec.description}</p>
      <div className="mt-0.5 flex flex-wrap gap-1">
        {spec.modules.map((module) => <span key={module} className="rounded border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">{module}</span>)}
      </div>
    </div>
  );
}

function PermissionMatrix({ permissions, roles, grants, overrides, changing, onToggle }: {
  permissions: PermissionRow[];
  roles: string[];
  grants: Set<string>;
  overrides: Map<string, boolean>;
  changing: string | null;
  onToggle: (role: string, permission: string, enabled: boolean) => void;
}) {
  const sections = permissions.reduce<Record<string, PermissionRow[]>>((groups, permission) => {
    const key = permission.module.split(".").map(titleCase).join(" · ");
    (groups[key] ??= []).push(permission);
    return groups;
  }, {});

  const isGranted = (role: string, code: string) => {
    if (role === "tenant_admin") return true;
    return overrides.get(`${role}:${code}`) ?? grants.has(`${role}:${code}`);
  };

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[780px] text-sm">
        <thead className="bg-muted/60">
          <tr className="border-b text-[11px] font-semibold uppercase text-muted-foreground">
            <th className="w-72 px-3 py-2.5 text-left">Permission</th>
            {roles.map((role) => <th key={role} className="min-w-24 px-3 py-2.5 text-center">{titleCase(role)}</th>)}
            <th className="w-56 px-3 py-2.5 text-left">Code</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(sections).map(([section, rows]) => (
            <Fragment key={section}>
              <tr className="border-t bg-muted/30"><td colSpan={roles.length + 2} className="px-3 py-1.5 text-[11px] font-bold uppercase text-primary">{section}</td></tr>
              {rows.map((permission) => (
                <tr key={permission.code} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-3 py-2 pl-6">
                    <div className="text-xs font-medium">{permission.description ?? titleCase(permission.action)}</div>
                  </td>
                  {roles.map((role) => {
                    const key = `${role}:${permission.code}`;
                    return (
                      <td key={role} className="px-3 py-2 text-center">
                        <div className="flex justify-center">
                          <Checkbox
                            aria-label={`${isGranted(role, permission.code) ? "Disable" : "Enable"} ${permission.description ?? permission.code} for ${titleCase(role)}`}
                            checked={isGranted(role, permission.code)}
                            disabled={role === "tenant_admin" || changing === key}
                            onCheckedChange={(checked) => onToggle(role, permission.code, checked === true)}
                          />
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2"><code className="select-all text-[10px] text-muted-foreground">{permission.code}</code></td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RolesPage() {
  const { can, tenant, refresh } = useAuth();
  const queryClient = useQueryClient();
  const allowed = can("settings.roles");

  const { data, isLoading } = useQuery({
    queryKey: ["role-permission-matrix", tenant?.id],
    enabled: allowed && !!tenant?.id,
    queryFn: async () => {
      if (!tenant?.id) return { permissions: [], grants: [], overrides: [] };
      const [permissionResult, grantResult, overrideResult] = await Promise.all([
        db.from("permissions").select("code,module,action,description").order("module").order("code"),
        db.from("role_permissions").select("role,permission_code"),
        db.from("tenant_role_permission_overrides").select("role,permission_code,enabled").eq("tenant_id", tenant.id),
      ]);
      if (permissionResult.error) throw permissionResult.error;
      if (grantResult.error) throw grantResult.error;
      if (overrideResult.error) throw overrideResult.error;
      return { permissions: (permissionResult.data ?? []) as PermissionRow[], grants: grantResult.data ?? [], overrides: overrideResult.data ?? [] };
    },
  });

  const updatePermission = useMutation({
    mutationFn: async ({ role, permission, enabled }: { role: string; permission: string; enabled: boolean }) => {
      const { error } = await db.rpc("set_role_permission_override", { _role: role, _permission_code: permission, _enabled: enabled });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["role-permission-matrix", tenant?.id] });
      await refresh();
      toast.success("Permission updated");
    },
    onError: (error: Error) => toast.error(error.message || "Permission update failed"),
  });

  const grants = new Set<string>((data?.grants ?? []).map((row: any) => `${row.role}:${row.permission_code}`));
  const overrides = new Map<string, boolean>((data?.overrides ?? []).map((row: any) => [`${row.role}:${row.permission_code}`, Boolean(row.enabled)] as [string, boolean]));
  const accountingPermissions = (data?.permissions ?? []).filter((permission) => ACCOUNTING_MODULES.has(permission.module.split(".")[0]));
  const otherPermissions = (data?.permissions ?? []).filter((permission) => !ACCOUNTING_MODULES.has(permission.module.split(".")[0]));
  const changing = updatePermission.isPending ? `${updatePermission.variables?.role}:${updatePermission.variables?.permission}` : null;

  if (!allowed) return <div className="p-6 text-sm text-muted-foreground">Administrator access required.</div>;

  const matrix = (permissions: PermissionRow[], roles: string[]) => isLoading ? (
    <div className="grid min-h-48 place-items-center rounded-lg border"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  ) : (
    <PermissionMatrix permissions={permissions} roles={roles} grants={grants} overrides={overrides} changing={changing} onToggle={(role, permission, enabled) => updatePermission.mutate({ role, permission, enabled })} />
  );

  return (
    <div className="flex w-full flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Layers className="h-5 w-5" /> Roles &amp; Permissions</h1>
        <p className="mt-1 text-sm text-muted-foreground">Assign roles to users and tailor each role’s access for this workspace.</p>
      </div>
      <Tabs defaultValue="roles" className="w-full">
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="roles">All Roles</TabsTrigger>
          <TabsTrigger value="accounting">Accounting Permission Matrix</TabsTrigger>
          <TabsTrigger value="other">Other Module Matrix</TabsTrigger>
        </TabsList>
        <TabsContent value="roles" className="pt-3">
          <div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Available roles for this workspace.</p><Link to="/settings/users" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">Assign roles <ArrowRight className="h-4 w-4" /></Link></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{ALL_ROLES.map((role) => <RoleCard key={role.role} spec={role} />)}</div>
        </TabsContent>
        <TabsContent value="accounting" className="space-y-3 pt-3">
          <div className="flex items-start gap-2"><Shield className="mt-0.5 h-4 w-4 text-primary" /><p className="text-xs text-muted-foreground">Tick or untick a permission to change access. Tenant Admin always retains full access.</p></div>
          {matrix(accountingPermissions, ACCOUNTING_ROLES)}
        </TabsContent>
        <TabsContent value="other" className="space-y-3 pt-3">
          <div className="flex items-start gap-2"><Shield className="mt-0.5 h-4 w-4 text-primary" /><p className="text-xs text-muted-foreground">Permissions are grouped by module. Changes apply only to this workspace.</p></div>
          {matrix(otherPermissions, OTHER_ROLES)}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/settings/roles")({
  component: RolesPage,
  head: () => ({ meta: [
    { title: "Roles & Permissions | AURORA ERP" },
    { name: "description", content: "Manage workspace roles and permission matrices." },
    { property: "og:title", content: "Roles & Permissions | AURORA ERP" },
    { property: "og:description", content: "Manage workspace roles and permission matrices." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});
