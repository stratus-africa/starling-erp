import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Layers, ArrowRight, Check, Minus, Shield } from "lucide-react";

// ─── Permission matrix data ───────────────────────────────────────────────────
// Columns: tenant_admin | accountant | finance_clerk | auditor | accounting(legacy) | sales | cashier | purchasing | viewer

type Access = "full" | "none" | "note";

interface MatrixRow {
  permission: string;
  code: string;
  tenant_admin: Access;
  accountant: Access;
  finance_clerk: Access;
  auditor: Access;
  accounting: Access; // legacy role
  note?: string; // shown when Access = "note"
}

interface MatrixSection {
  label: string;
  color: string; // Tailwind text color class
  headerBg: string; // Tailwind bg class for section header
  rows: MatrixRow[];
}

const Y: Access = "full";
const N: Access = "none";

const ACCOUNTING_MATRIX: MatrixSection[] = [
  {
    label: "General Access",
    color: "text-blue-700 dark:text-blue-400",
    headerBg: "bg-blue-500/8 border-blue-500/15",
    rows: [
      {
        permission: "View accounting module",
        code: "accounting.view",
        tenant_admin: Y,
        accountant: Y,
        finance_clerk: Y,
        auditor: Y,
        accounting: Y,
      },
      {
        permission: "Create records",
        code: "accounting.create",
        tenant_admin: Y,
        accountant: Y,
        finance_clerk: Y,
        auditor: N,
        accounting: Y,
      },
      {
        permission: "Update records",
        code: "accounting.update",
        tenant_admin: Y,
        accountant: Y,
        finance_clerk: Y,
        auditor: N,
        accounting: Y,
      },
      {
        permission: "Delete records",
        code: "accounting.delete",
        tenant_admin: Y,
        accountant: Y,
        finance_clerk: N,
        auditor: N,
        accounting: N,
      },
    ],
  },
  {
    label: "Journal Entries",
    color: "text-violet-700 dark:text-violet-400",
    headerBg: "bg-violet-500/8 border-violet-500/15",
    rows: [
      {
        permission: "Create journals",
        code: "accounting.journal.create",
        tenant_admin: Y,
        accountant: Y,
        finance_clerk: Y,
        auditor: N,
        accounting: Y,
      },
      {
        permission: "Edit draft journals",
        code: "accounting.journal.update",
        tenant_admin: Y,
        accountant: Y,
        finance_clerk: Y,
        auditor: N,
        accounting: Y,
      },
      {
        permission: "Post to GL",
        code: "accounting.journal.post",
        tenant_admin: Y,
        accountant: Y,
        finance_clerk: N,
        auditor: N,
        accounting: Y,
      },
      {
        permission: "Void & reverse",
        code: "accounting.journal.void",
        tenant_admin: Y,
        accountant: Y,
        finance_clerk: N,
        auditor: N,
        accounting: Y,
      },
    ],
  },
  {
    label: "Chart of Accounts",
    color: "text-emerald-700 dark:text-emerald-400",
    headerBg: "bg-emerald-500/8 border-emerald-500/15",
    rows: [
      {
        permission: "Create accounts",
        code: "accounting.accounts.create",
        tenant_admin: Y,
        accountant: Y,
        finance_clerk: N,
        auditor: N,
        accounting: Y,
      },
      {
        permission: "Update accounts",
        code: "accounting.accounts.update",
        tenant_admin: Y,
        accountant: Y,
        finance_clerk: Y,
        auditor: N,
        accounting: Y,
      },
      {
        permission: "Delete accounts",
        code: "accounting.accounts.delete",
        tenant_admin: Y,
        accountant: Y,
        finance_clerk: N,
        auditor: N,
        accounting: N,
      },
    ],
  },
  {
    label: "Reports",
    color: "text-amber-700 dark:text-amber-400",
    headerBg: "bg-amber-500/8 border-amber-500/15",
    rows: [
      {
        permission: "View financial reports",
        code: "accounting.reports.view",
        tenant_admin: Y,
        accountant: Y,
        finance_clerk: Y,
        auditor: Y,
        accounting: Y,
      },
    ],
  },
  {
    label: "Periods & Settings",
    color: "text-red-700 dark:text-red-400",
    headerBg: "bg-red-500/8 border-red-500/15",
    rows: [
      {
        permission: "Manage accounting periods",
        code: "accounting.periods.manage",
        tenant_admin: Y,
        accountant: Y,
        finance_clerk: N,
        auditor: N,
        accounting: N,
      },
      {
        permission: "View bank reconciliation",
        code: "accounting.reconciliation.view",
        tenant_admin: Y,
        accountant: Y,
        finance_clerk: Y,
        auditor: Y,
        accounting: Y,
      },
      {
        permission: "Perform bank reconciliation",
        code: "accounting.reconciliation.manage",
        tenant_admin: Y,
        accountant: Y,
        finance_clerk: N,
        auditor: N,
        accounting: Y,
      },
      {
        permission: "Accounting settings",
        code: "accounting.settings.manage",
        tenant_admin: Y,
        accountant: Y,
        finance_clerk: N,
        auditor: N,
        accounting: N,
      },
    ],
  },
];

// All application roles with descriptions
interface RoleSpec {
  role: string;
  badge: string; // badge variant color classes
  label: string;
  description: string;
  modules: string[];
  isNew?: boolean;
}

const ALL_ROLES: RoleSpec[] = [
  {
    role: "super_admin",
    badge: "bg-primary/10 text-primary border-primary/20",
    label: "Super Admin",
    description: "Platform-wide access. Can switch tenants and view all audit logs.",
    modules: ["Everything"],
  },
  {
    role: "tenant_admin",
    badge: "bg-primary/10 text-primary border-primary/20",
    label: "Tenant Admin",
    description: "Full access within the tenant. Manages users, roles, and settings.",
    modules: ["Everything in tenant"],
  },
  {
    role: "accountant",
    badge: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
    label: "Accountant",
    description: "Full accounting capability — journals, posting, voiding, reconciliation, reports, and settings.",
    modules: ["Accounting", "Banking", "Payments", "Reports"],
    isNew: true,
  },
  {
    role: "finance_clerk",
    badge: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
    label: "Finance Clerk",
    description:
      "Can create and update journals and accounts, view reports and reconciliation. Cannot post, void, or change settings.",
    modules: ["Accounting (limited)", "Reports"],
    isNew: true,
  },
  {
    role: "auditor",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    label: "Auditor",
    description: "Read-only across all accounting, reports, GL, trial balance, and reconciliation status.",
    modules: ["Accounting (read)", "Reports", "Sales (read)", "Purchasing (read)", "Inventory (read)"],
    isNew: true,
  },
  {
    role: "accounting",
    badge: "bg-muted text-muted-foreground border-border",
    label: "Accounting (legacy)",
    description: "Original accounting role — equivalent to Accountant. Kept for backward compatibility.",
    modules: ["Accounting", "Banking", "Payments", "Reports"],
  },
  {
    role: "sales",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    label: "Sales",
    description: "CRM, quotes, sales orders, invoices, payments received.",
    modules: ["CRM", "Sales", "Payments"],
  },
  {
    role: "cashier",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    label: "Cashier",
    description: "POS sales, sales accounting posting, and customer payments.",
    modules: ["POS", "Sales posting", "Payments"],
  },
  {
    role: "purchasing",
    badge: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20",
    label: "Purchasing",
    description: "Suppliers, purchase orders, bills, expenses, payments made.",
    modules: ["Purchasing"],
  },
  {
    role: "inventory",
    badge: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20",
    label: "Inventory",
    description: "Items, warehouses, adjustments, and stock transfers.",
    modules: ["Inventory"],
  },
  {
    role: "manufacturing",
    badge: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
    label: "Manufacturing",
    description: "Bill of materials and production orders.",
    modules: ["Manufacturing"],
  },
  {
    role: "viewer",
    badge: "bg-muted text-muted-foreground border-border",
    label: "Viewer",
    description: "Read-only access across the tenant.",
    modules: ["All (read)"],
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function AccessCell({ access }: { access: Access }) {
  if (access === "full") {
    return (
      <td className="px-3 py-2 text-center">
        <Check className="mx-auto h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
      </td>
    );
  }
  return (
    <td className="px-3 py-2 text-center">
      <Minus className="mx-auto h-3.5 w-3.5 text-muted-foreground/30" strokeWidth={2} />
    </td>
  );
}

function SectionHeader({ section }: { section: MatrixSection }) {
  return (
    <tr className={`border-t ${section.headerBg}`}>
      <td colSpan={7} className="px-3 py-1.5">
        <span className={`text-[11px] font-bold uppercase tracking-widest ${section.color}`}>{section.label}</span>
      </td>
    </tr>
  );
}

function RoleCard({ spec }: { spec: RoleSpec }) {
  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold font-mono ${spec.badge}`}
          >
            {spec.role}
          </span>
          {spec.isNew && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wide">
              New
            </span>
          )}
        </div>
        <Link to="/settings/users" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
          Assign <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{spec.description}</p>
      <div className="flex flex-wrap gap-1 mt-0.5">
        {spec.modules.map((m) => (
          <span key={m} className="rounded border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function RolesPage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-6xl">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Layers className="h-5 w-5" /> Roles &amp; Permissions
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Roles are enforced server-side via centralized permissions, RPC guards, and Supabase RLS. The UI mirrors those
          permissions. Assign roles on the{" "}
          <Link to="/settings/users" className="text-primary underline">
            Users
          </Link>{" "}
          screen.
        </p>
      </div>

      {/* ── Role cards ── */}
      <section>
        <h2 className="text-sm font-semibold mb-3">All Roles</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ALL_ROLES.map((r) => (
            <RoleCard key={r.role} spec={r} />
          ))}
        </div>
      </section>

      <Separator />

      {/* ── Accounting permission matrix ── */}
      <section>
        <div className="flex items-center gap-2 mb-1">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Accounting Permission Matrix</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          The accounting module uses granular permission codes. Legacy role holders (
          <code className="font-mono">accounting</code>) retain full access for backward compatibility. New deployments
          should use <code className="font-mono">accountant</code>, <code className="font-mono">finance_clerk</code>, or{" "}
          <code className="font-mono">auditor</code> as appropriate.
        </p>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr className="border-b text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 text-left w-64">Permission</th>
                <th className="px-3 py-2.5 text-center w-24 whitespace-nowrap">Tenant Admin</th>
                <th className="px-3 py-2.5 text-center w-24 whitespace-nowrap">
                  <span className="text-violet-600 dark:text-violet-400">Accountant</span>
                </th>
                <th className="px-3 py-2.5 text-center w-24 whitespace-nowrap">
                  <span className="text-blue-600 dark:text-blue-400">Finance Clerk</span>
                </th>
                <th className="px-3 py-2.5 text-center w-20 whitespace-nowrap">
                  <span className="text-amber-600 dark:text-amber-400">Auditor</span>
                </th>
                <th className="px-3 py-2.5 text-center w-24 whitespace-nowrap text-muted-foreground/60">
                  Accounting
                  <br />
                  <span className="text-[9px] font-normal normal-case">(legacy)</span>
                </th>
                <th className="px-3 py-2.5 text-left text-muted-foreground/50 w-52">Permission code</th>
              </tr>
            </thead>
            <tbody>
              {ACCOUNTING_MATRIX.map((section) => (
                <>
                  <SectionHeader key={`hdr-${section.label}`} section={section} />
                  {section.rows.map((row) => (
                    <tr key={row.code} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 text-xs font-medium pl-6">{row.permission}</td>
                      <AccessCell access={row.tenant_admin} />
                      <AccessCell access={row.accountant} />
                      <AccessCell access={row.finance_clerk} />
                      <AccessCell access={row.auditor} />
                      <AccessCell access={row.accounting} />
                      <td className="px-3 py-2">
                        <code className="text-[10px] font-mono text-muted-foreground/60 select-all">{row.code}</code>
                      </td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Legend ── */}
        <div className="mt-3 flex items-center gap-5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
            Granted
          </span>
          <span className="flex items-center gap-1.5">
            <Minus className="h-3.5 w-3.5 text-muted-foreground/40" strokeWidth={2} />
            Not granted
          </span>
          <span className="ml-auto">tenant_admin and super_admin bypass permission checks at the database level.</span>
        </div>
      </section>

      <Separator />

      {/* ── Non-accounting modules summary ── */}
      <section>
        <h2 className="text-sm font-semibold mb-3">Other Module Permissions</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr className="border-b text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 text-left">Module</th>
                <th className="px-3 py-2.5 text-center">Sales</th>
                <th className="px-3 py-2.5 text-center">Cashier</th>
                <th className="px-3 py-2.5 text-center">Purchasing</th>
                <th className="px-3 py-2.5 text-center">Inventory</th>
                <th className="px-3 py-2.5 text-center">Manufacturing</th>
                <th className="px-3 py-2.5 text-center">Viewer</th>
              </tr>
            </thead>
            <tbody>
              {[
                { module: "CRM", sales: Y, cashier: N, purchasing: N, inventory: N, manufacturing: N, viewer: Y },
                { module: "Sales", sales: Y, cashier: Y, purchasing: N, inventory: N, manufacturing: N, viewer: Y },
                { module: "Payments", sales: Y, cashier: Y, purchasing: Y, inventory: N, manufacturing: N, viewer: Y },
                {
                  module: "Purchasing",
                  sales: N,
                  cashier: N,
                  purchasing: Y,
                  inventory: N,
                  manufacturing: N,
                  viewer: Y,
                },
                { module: "Inventory", sales: N, cashier: N, purchasing: N, inventory: Y, manufacturing: Y, viewer: Y },
                {
                  module: "Manufacturing",
                  sales: N,
                  cashier: N,
                  purchasing: N,
                  inventory: N,
                  manufacturing: Y,
                  viewer: Y,
                },
                { module: "Approvals", sales: Y, cashier: Y, purchasing: Y, inventory: Y, manufacturing: Y, viewer: Y },
              ].map((row) => (
                <tr key={row.module} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2 text-xs font-medium">{row.module}</td>
                  <AccessCell access={row.sales} />
                  <AccessCell access={row.cashier} />
                  <AccessCell access={row.purchasing} />
                  <AccessCell access={row.inventory} />
                  <AccessCell access={row.manufacturing} />
                  <AccessCell access={row.viewer} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          ✓ in this table means the role gets at least read + create + update access for that module. Post and void
          permissions follow the same role but require explicit assignment.
        </p>
      </section>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/settings/roles")({
  component: RolesPage,
});
