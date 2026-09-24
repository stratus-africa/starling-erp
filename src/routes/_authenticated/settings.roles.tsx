import { Fragment, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ChevronRight, Layers, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { db } from "@/lib/typed-db";
import { CustomRolesManager, type CustomRole } from "@/components/custom-roles-manager";

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
  { role: "field_sales", label: "Field Sales", description: "Mobile app: customers, leads, quotes, sales orders and customer payments.", modules: ["Customers", "Leads", "Quotes", "Orders", "Payments"], badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20" },
  { role: "purchasing", label: "Purchasing", description: "Suppliers, requisitions, purchase orders, bills, and expenses.", modules: ["Purchasing"], badge: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20" },
  { role: "inventory", label: "Inventory", description: "Items, warehouses, adjustments, and stock transfers.", modules: ["Inventory"], badge: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20" },
  { role: "manufacturing", label: "Manufacturing", description: "Bills of materials and production orders.", modules: ["Manufacturing"], badge: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20" },
  { role: "viewer", label: "Viewer", description: "Read-only access where permissions are enabled.", modules: ["Read access"], badge: "bg-muted text-muted-foreground border-border" },
];

const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const ACTION_COLUMNS = [
  { key: "view", label: "View", actions: ["read", "view"] },
  { key: "create", label: "Create", actions: ["create"] },
  { key: "edit", label: "Edit", actions: ["update", "edit", "manage"] },
  { key: "delete", label: "Delete", actions: ["delete", "archive"] },
  { key: "approve", label: "Approve", actions: ["approve", "reject", "request"] },
  { key: "post", label: "Post", actions: ["post", "accounting_post", "reconcile", "allocate"] },
] as const;

interface PermissionSubject {
  key: string;
  label: string;
  permissions: PermissionRow[];
}

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

function PermissionMatrix({ permissions, role, grants, overrides, changing, onToggle }: {
  permissions: PermissionRow[];
  role: string;
  grants: Set<string>;
  overrides: Map<string, boolean>;
  changing: Set<string>;
  onToggle: (permissions: string[], enabled: boolean) => void;
}) {
  const sections = permissions.reduce<Record<string, Record<string, PermissionSubject>>>((groups, permission) => {
    const moduleParts = permission.module.split(".");
    const section = titleCase(moduleParts[0] ?? permission.module);
    const codeParts = permission.code.split(".");
    const subjectKey = codeParts.length > 2 ? codeParts.slice(1, -1).join(".") : moduleParts.slice(1).join(".") || moduleParts[0] || permission.module;
    const subjectLabel = titleCase(subjectKey || permission.module);
    groups[section] ??= {};
    groups[section][subjectKey] ??= { key: `${section}:${subjectKey}`, label: subjectLabel, permissions: [] };
    groups[section][subjectKey].permissions.push(permission);
    return groups;
  }, {});

  const isGranted = (code: string) => {
    if (role === "tenant_admin") return true;
    return overrides.get(`${role}:${code}`) ?? grants.has(`${role}:${code}`);
  };

  const actionFor = (permission: PermissionRow) => permission.code.split(".").at(-1) ?? permission.action;
  const permissionsForColumn = (subject: PermissionSubject, actions: readonly string[]) =>
    subject.permissions.filter((permission) => actions.includes(actionFor(permission)));
  const otherPermissions = (subject: PermissionSubject) => subject.permissions.filter((permission) =>
    !ACTION_COLUMNS.some((column) => (column.actions as readonly string[]).includes(actionFor(permission))),
  );
  const toggleCell = (cellPermissions: PermissionRow[]) => {
    if (cellPermissions.length === 0 || role === "tenant_admin") return;
    const shouldEnable = cellPermissions.some((permission) => !isGranted(permission.code));
    onToggle(cellPermissions.map((permission) => permission.code), shouldEnable);
  };

  return (
    <div className="space-y-3">
      {Object.entries(sections).map(([section, subjectMap]) => {
        const subjects = Object.values(subjectMap);
        return (
          <section key={section} className="overflow-hidden rounded-md border bg-card">
            <div className="border-b bg-muted/55 px-3 py-2 text-sm font-semibold">{section}</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] table-fixed text-xs">
                <thead>
                  <tr className="border-b bg-background text-muted-foreground">
                    <th className="w-[34%] px-3 py-2 text-left font-medium">Particulars</th>
                    <th className="w-14 px-2 py-2 text-center font-medium">Full</th>
                    {ACTION_COLUMNS.map((column) => <th key={column.key} className="w-16 px-2 py-2 text-center font-medium">{column.label}</th>)}
                    <th className="w-20 px-2 py-2 text-center font-medium">Others</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((subject) => {
                    const allGranted = subject.permissions.every((permission) => isGranted(permission.code));
                    const rowChanging = subject.permissions.some((permission) => changing.has(`${role}:${permission.code}`));
                    const other = otherPermissions(subject);
                    return (
                      <tr key={subject.key} className="border-b last:border-b-0 hover:bg-muted/20">
                        <td className="px-3 py-2">
                          <p className="font-medium">{subject.label}</p>
                          {subject.permissions.length === 1 && subject.permissions[0]?.description ? <p className="mt-0.5 text-[10px] text-muted-foreground">{subject.permissions[0].description}</p> : null}
                        </td>
                        <td className="px-2 py-2"><div className="flex justify-center"><Checkbox aria-label={`Toggle full access to ${subject.label}`} checked={allGranted} disabled={role === "tenant_admin" || rowChanging} onCheckedChange={() => onToggle(subject.permissions.map((permission) => permission.code), !allGranted)} /></div></td>
                        {ACTION_COLUMNS.map((column) => {
                          const cell = permissionsForColumn(subject, column.actions);
                          const checked = cell.length > 0 && cell.every((permission) => isGranted(permission.code));
                          return <td key={column.key} className="px-2 py-2"><div className="flex justify-center">{cell.length > 0 ? <Checkbox aria-label={`${column.label} ${subject.label}`} checked={checked} disabled={role === "tenant_admin" || cell.some((permission) => changing.has(`${role}:${permission.code}`))} onCheckedChange={() => toggleCell(cell)} /> : <span className="text-muted-foreground/30">—</span>}</div></td>;
                        })}
                        <td className="px-2 py-2"><div className="flex justify-center">{other.length > 0 ? <Checkbox aria-label={`Other permissions for ${subject.label}`} checked={other.every((permission) => isGranted(permission.code))} disabled={role === "tenant_admin" || other.some((permission) => changing.has(`${role}:${permission.code}`))} onCheckedChange={() => toggleCell(other)} /> : <span className="text-muted-foreground/30">—</span>}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function RolesPage() {
  const { can, tenant, refresh } = useAuth();
  const queryClient = useQueryClient();
  const allowed = can("settings.roles");
  const [selectedRole, setSelectedRole] = useState("accountant");

  const { data, isLoading } = useQuery({
    queryKey: ["role-permission-matrix", tenant?.id],
    enabled: allowed && !!tenant?.id,
    queryFn: async () => {
      if (!tenant?.id) return { permissions: [], grants: [], overrides: [], customRoles: [] as CustomRole[] };
      const [permissionResult, grantResult, overrideResult, customResult] = await Promise.all([
        db.from("permissions").select("code,module,action,description").order("module").order("code"),
        db.from("role_permissions").select("role,permission_code"),
        db.from("tenant_role_permission_overrides").select("role,permission_code,enabled").eq("tenant_id", tenant.id),
        db.from("tenant_custom_roles").select("id,role_key,label,description").eq("tenant_id", tenant.id).order("label"),
      ]);
      if (permissionResult.error) throw permissionResult.error;
      if (grantResult.error) throw grantResult.error;
      if (overrideResult.error) throw overrideResult.error;
      return { permissions: (permissionResult.data ?? []) as PermissionRow[], grants: grantResult.data ?? [], overrides: overrideResult.data ?? [], customRoles: (customResult.data ?? []) as CustomRole[] };
    },
  });

  const updatePermission = useMutation({
    mutationFn: async ({ role, permissions, enabled }: { role: string; permissions: string[]; enabled: boolean }) => {
      const results = await Promise.all(permissions.map((permission) => db.rpc("set_role_permission_override", { _role: role, _permission_code: permission, _enabled: enabled })));
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
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
  const customRoles = data?.customRoles ?? [];
  const labels: Record<string, string> = Object.fromEntries([...ALL_ROLES.map((r) => [r.role, r.label]), ...customRoles.map((r) => [r.role_key, r.label])]);
  const descriptions: Record<string, string> = Object.fromEntries([...ALL_ROLES.map((r) => [r.role, r.description]), ...customRoles.map((r) => [r.role_key, r.description ?? "Custom workspace role."])]);
  const selectableRoles = useMemo(() => [...ALL_ROLES.filter((role) => role.role !== "super_admin").map((role) => role.role), ...customRoles.map((role) => role.role_key)], [customRoles]);
  const refreshMatrix = () => queryClient.invalidateQueries({ queryKey: ["role-permission-matrix", tenant?.id] });
  const changing = new Set(updatePermission.isPending ? updatePermission.variables?.permissions.map((permission) => `${updatePermission.variables?.role}:${permission}`) : []);

  if (!allowed) return <div className="p-6 text-sm text-muted-foreground">Administrator access required.</div>;

  return (
    <div className="flex w-full flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold"><Layers className="h-5 w-5 text-primary" /> Roles &amp; Permissions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Control access to every workspace module and transaction.</p>
        </div>
        <Link to="/settings/users" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">Assign roles <ArrowRight className="h-4 w-4" /></Link>
      </div>
      <Tabs defaultValue="matrix" className="w-full">
        <TabsList className="h-9 w-full justify-start rounded-none border-b bg-transparent p-0">
          <TabsTrigger value="roles" className="h-9 rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">All Roles</TabsTrigger>
          <TabsTrigger value="matrix" className="h-9 rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">Segmented Access Control</TabsTrigger>
        </TabsList>
        <TabsContent value="roles" className="pt-3">
          <div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Available roles for this workspace.</p><Link to="/settings/users" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">Assign roles <ArrowRight className="h-4 w-4" /></Link></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{ALL_ROLES.map((role) => <RoleCard key={role.role} spec={role} />)}</div>
          <div className="mt-6"><CustomRolesManager roles={customRoles} builtIn={ALL_ROLES.filter((r) => r.role !== "super_admin")} onChanged={refreshMatrix} /></div>
        </TabsContent>
        <TabsContent value="matrix" className="space-y-4 pt-4">
          <div className="flex items-center gap-1 text-xs text-muted-foreground"><span>General</span><ChevronRight className="h-3 w-3" /><span className="font-medium text-foreground">Segmented Access Control</span></div>
          <section className="rounded-md border bg-card">
            <div className="grid gap-4 p-4 md:grid-cols-[180px_minmax(280px,520px)] md:items-center">
              <label className="text-xs font-medium text-muted-foreground">Role Name</label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>{selectableRoles.map((role) => <SelectItem key={role} value={role}>{labels[role] ?? titleCase(role)}</SelectItem>)}</SelectContent>
              </Select>
              <span className="text-xs font-medium text-muted-foreground">Description</span>
              <p className="text-sm leading-relaxed">{descriptions[selectedRole]}</p>
            </div>
            <div className="flex items-start gap-2 border-t bg-primary/5 px-4 py-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
              <div><p className="text-xs font-semibold">Access for {labels[selectedRole] ?? titleCase(selectedRole)} users</p><p className="mt-0.5 text-[11px] text-muted-foreground">Changes apply to every user assigned this role in the current workspace. Tenant Admin access is protected.</p></div>
            </div>
          </section>
          {isLoading ? <div className="grid min-h-48 place-items-center rounded-md border"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : <PermissionMatrix permissions={data?.permissions ?? []} role={selectedRole} grants={grants} overrides={overrides} changing={changing} onToggle={(permissions, enabled) => updatePermission.mutate({ role: selectedRole, permissions, enabled })} />}
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
