import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Layers, ArrowRight } from "lucide-react";

const ROLE_MATRIX: { role: string; description: string; modules: string[] }[] = [
  { role: "super_admin",    description: "Platform-wide access. Can switch tenants and view all audit logs.", modules: ["Everything"] },
  { role: "tenant_admin",   description: "Full access within the tenant. Manages users, roles, and settings.", modules: ["Everything in tenant"] },
  { role: "sales",          description: "CRM, quotes, sales orders, invoices, payments received.", modules: ["CRM","Sales"] },
  { role: "purchasing",     description: "Suppliers, purchase orders, bills, payments made.", modules: ["Purchasing"] },
  { role: "inventory",      description: "Items, warehouses, adjustments, transfers.", modules: ["Inventory"] },
  { role: "accounting",     description: "Chart of accounts, banking, manual journals, reconciliation.", modules: ["Accounting"] },
  { role: "manufacturing",  description: "BOMs and production orders.", modules: ["Manufacturing"] },
  { role: "viewer",         description: "Read-only access across the tenant.", modules: ["All (read)"] },
];

function RolesPage() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Layers className="h-5 w-5" /> Roles & Permissions</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Roles are enforced server-side by Supabase RLS via <span className="font-mono text-xs">has_role()</span> and per-table policies.
          Assign roles to users on the <Link to="/settings/users" className="text-primary underline">Users</Link> screen.
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {ROLE_MATRIX.map((r) => (
          <Card key={r.role} className="p-4">
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="font-mono text-xs">{r.role}</Badge>
              <Link to="/settings/users" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                Assign <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <p className="text-sm text-foreground mt-2">{r.description}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {r.modules.map((m) => <Badge key={m} variant="outline" className="text-[10px]">{m}</Badge>)}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/settings/roles")({ component: RolesPage });
