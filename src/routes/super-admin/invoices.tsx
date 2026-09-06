/**
 * Super Admin � Platform Invoices
 * Route: /super-admin/invoices
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { db } from "@/lib/typed-db";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  FileText, Search, RefreshCw, Loader2, AlertCircle,
  DollarSign, CheckCircle2, Clock, XCircle, Filter,
} from "lucide-react";

export const Route = createFileRoute("/super-admin/invoices")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.billingView}>
      <InvoicesPage />
    </PermissionGuard>
  ),
});

// Invoices derive from tenant_subscriptions � we show billing history
// If a dedicated platform_invoices table is added later, swap the query.
interface InvoiceRow {
  id: string;
  tenant_id: string;
  tenant_name: string;
  plan_name: string;
  amount: number;
  currency: string;
  status: string;
  billing_cycle_start: string;
  billing_cycle_end: string;
  created_at: string;
}

const STATUS_BADGE: Record<string, string> = {
  active:    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  paid:      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  pending:   "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  past_due:  "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  trial:     "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
};

const fmtMoney = (n: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(n);

const dateFmt = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

function InvoicesPage() {
  const { canPlatform } = usePlatformAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: invoices = [], isLoading, error } = useQuery({
    queryKey: ["platform_invoices", refreshKey],
    staleTime: 60_000,
    queryFn: async () => {
      // Use tenant_subscriptions as the invoice source
      const { data, error } = await (db as any)
        .from("tenant_subscriptions")
        .select(`
          id, tenant_id, status, current_period_start, current_period_end,
          created_at, trial_ends_at,
          tenants!inner(name),
          billing_plans(name, price_monthly, price_yearly, currency)
        `)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        id: row.id,
        tenant_id: row.tenant_id,
        tenant_name: row.tenants?.name ?? "�",
        plan_name: row.billing_plans?.name ?? "�",
        amount: row.billing_plans?.price_monthly ?? 0,
        currency: row.billing_plans?.currency ?? "USD",
        status: row.status,
        billing_cycle_start: row.current_period_start ?? row.created_at,
        billing_cycle_end: row.current_period_end ?? "",
        created_at: row.created_at,
      })) as InvoiceRow[];
    },
  });

  const filtered = invoices.filter((row) => {
    const matchSearch =
      !search ||
      row.tenant_name.toLowerCase().includes(search.toLowerCase()) ||
      row.plan_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || row.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalMRR = invoices
    .filter((r) => r.status === "active")
    .reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Invoices</h1>
          <p className="text-sm text-muted-foreground">Billing records across all tenant subscriptions.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Records", value: invoices.length, icon: FileText, color: "text-primary" },
          { label: "Active", value: invoices.filter((r) => r.status === "active").length, icon: CheckCircle2, color: "text-emerald-600" },
          { label: "Trial", value: invoices.filter((r) => r.status === "trial").length, icon: Clock, color: "text-blue-600" },
          { label: "Past Due", value: invoices.filter((r) => r.status === "past_due").length, icon: XCircle, color: "text-destructive" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`h-9 w-9 rounded-lg bg-muted flex items-center justify-center ${kpi.color}`}>
                <kpi.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xl font-bold">{kpi.value}</div>
                <div className="text-xs text-muted-foreground">{kpi.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tenant or plan..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="past_due">Past Due</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} records</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Period Start</TableHead>
                <TableHead>Period End</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                    No billing records found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.tenant_name}</TableCell>
                    <TableCell>{row.plan_name}</TableCell>
                    <TableCell className="font-mono text-sm">{fmtMoney(row.amount, row.currency)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${STATUS_BADGE[row.status] ?? ""}`}>
                        {row.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.billing_cycle_start ? dateFmt(row.billing_cycle_start) : "�"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.billing_cycle_end ? dateFmt(row.billing_cycle_end) : "�"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{dateFmt(row.created_at)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
