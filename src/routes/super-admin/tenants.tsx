/**
 * Super Admin — Tenant List
 *
 * Route: /super-admin/tenants
 *
 * Features:
 *   - Full-text search (name / slug)
 *   - Status filter  (all · trial · active · past_due · suspended · cancelled)
 *   - Plan filter    (all plans from available_plans)
 *   - Sort: created_at DESC (server-side via list_platform_tenants)
 *   - Pagination: page-based, 50 rows per page
 *   - Per-row quick actions:
 *       Details        → /super-admin/tenants/$id
 *       Support Session → begin_support_session  (platform.support.impersonate)
 *       Suspend        → admin_set_tenant_status  (platform.tenants.suspend)
 *       Reactivate     → admin_set_tenant_status  (platform.tenants.activate)
 *   - Summary KPI bar: totals by status
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/typed-db";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { StatusBadge, dateFmt, fmtMoney } from "@/components/super-admin/tenant-shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Loader2,
  Lock,
  LogIn,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldAlert,
  Unlock,
  Users,
  XCircle,
} from "lucide-react";
import { useMemo, useState, useCallback } from "react";

export const Route = createFileRoute("/super-admin/tenants")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.tenantsView}>
      <TenantsContent />
    </PermissionGuard>
  ),
});

// ─── Types ────────────────────────────────────────────────────────────────────

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  currency: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
  user_count: number;
  plan_id: string | null;
  plan_name: string | null;
  plan_code: string | null;
  plan_price: number | null;
  sub_status: string | null;
  trial_ends_at: string | null;
  total_count: number;
};

type Plan = { id: string; name: string; code: string; price_usd: number };

const ALL_STATUSES = [
  { value: "all", label: "All statuses" },
  { value: "trial", label: "Trial" },
  { value: "active", label: "Active" },
  { value: "past_due", label: "Past due" },
  { value: "suspended", label: "Suspended" },
  { value: "cancelled", label: "Cancelled" },
] as const;

const PAGE_SIZE = 50;

// ─── Status KPI bar ───────────────────────────────────────────────────────────

const STATUS_KPI: Record<string, { bg: string; text: string }> = {
  active: { bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-300" },
  trial: { bg: "bg-blue-500/10", text: "text-blue-700 dark:text-blue-300" },
  past_due: { bg: "bg-red-500/10", text: "text-red-700 dark:text-red-300" },
  suspended: { bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-300" },
  cancelled: { bg: "bg-muted", text: "text-muted-foreground" },
};

function KpiBar({ tenants }: { tenants: TenantRow[] }) {
  const counts = useMemo(() => {
    const map: Record<string, number> = { active: 0, trial: 0, past_due: 0, suspended: 0, cancelled: 0 };
    tenants.forEach((t) => {
      const s = t.status ?? "active";
      if (s in map) map[s]++;
    });
    return map;
  }, [tenants]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {Object.entries(counts).map(([status, count]) => {
        const cfg = STATUS_KPI[status] ?? STATUS_KPI.active;
        return (
          <div key={status} className={`rounded-lg border px-4 py-3 ${cfg.bg}`}>
            <div className={`text-2xl font-bold tabular-nums ${cfg.text}`}>{count}</div>
            <div className="text-xs text-muted-foreground capitalize mt-0.5">{status.replace("_", " ")}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Quick-action inline dialogs ─────────────────────────────────────────────

function SuspendRowDialog({
  open,
  onOpenChange,
  tenant,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenant: TenantRow | null;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      if (!tenant) return;
      const { error } = await (db as any).rpc("admin_set_tenant_status", {
        _tenant_id: tenant.id,
        _new_status: "suspended",
        _reason: reason.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${tenant?.name} suspended.`);
      setReason("");
      onOpenChange(false);
      onSuccess();
    },
    onError: (e: any) => toast.error(e.message ?? "Suspension failed"),
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            Suspend {tenant?.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The workspace will be locked. All subscriptions are paused. Tenant data is preserved and can be reactivated
            at any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-2">
          <Label htmlFor="sr-reason" className="text-sm">
            Reason (optional)
          </Label>
          <Textarea
            id="sr-reason"
            className="mt-1.5"
            rows={2}
            placeholder="Non-payment, policy violation…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setReason("")}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-amber-500 text-white hover:bg-amber-600"
            onClick={() => {
              if (!mutation.isPending) mutation.mutate();
            }}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Suspend
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ActivateRowDialog({
  open,
  onOpenChange,
  tenant,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenant: TenantRow | null;
  onSuccess: () => void;
}) {
  const mutation = useMutation({
    mutationFn: async () => {
      if (!tenant) return;
      const { error } = await (db as any).rpc("admin_set_tenant_status", {
        _tenant_id: tenant.id,
        _new_status: "active",
        _reason: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${tenant?.name} reactivated.`);
      onOpenChange(false);
      onSuccess();
    },
    onError: (e: any) => toast.error(e.message ?? "Activation failed"),
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            Reactivate {tenant?.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The workspace will be unlocked and subscriptions restored to active.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (!mutation.isPending) mutation.mutate();
            }}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Reactivate
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SessionRowDialog({
  open,
  onOpenChange,
  tenant,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenant: TenantRow | null;
  onSuccess: () => void;
}) {
  const { beginSupportSession, refresh } = usePlatformAuth();
  const [reason, setReason] = useState("");
  const [ttl, setTtl] = useState("120");
  const [isPending, setIsPending] = useState(false);

  const handleStart = async () => {
    if (!tenant || !reason.trim()) {
      toast.error("A reason is required.");
      return;
    }
    setIsPending(true);
    try {
      await beginSupportSession(tenant.id, reason.trim(), parseInt(ttl));
      await refresh();
      toast.success(`Support session started for ${tenant.name}.`);
      setReason("");
      onOpenChange(false);
      onSuccess();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to start session");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <LogIn className="h-5 w-5 text-amber-500" />
            Support Session — {tenant?.name}
          </AlertDialogTitle>
          <AlertDialogDescription>
            You will temporarily switch into this workspace. All actions are logged permanently.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div>
            <Label htmlFor="ssr-reason" className="text-sm">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="ssr-reason"
              className="mt-1.5"
              rows={2}
              placeholder="Customer request, bug investigation…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-sm">Duration</Label>
            <Select value={ttl} onValueChange={setTtl}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  ["30", "30 min"],
                  ["60", "1 hr"],
                  ["120", "2 hr"],
                  ["240", "4 hr"],
                  ["480", "8 hr"],
                ].map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            All actions during this session are attributed to you and permanently logged.
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setReason("")}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-amber-500 text-white hover:bg-amber-600"
            onClick={handleStart}
            disabled={isPending || !reason.trim()}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Start Session
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Row action menu ──────────────────────────────────────────────────────────

function RowActions({
  tenant,
  canSuspend,
  canActivate,
  canSession,
  onSuspend,
  onActivate,
  onSession,
}: {
  tenant: TenantRow;
  canSuspend: boolean;
  canActivate: boolean;
  canSession: boolean;
  onSuspend: () => void;
  onActivate: () => void;
  onSession: () => void;
}) {
  const status = tenant.status ?? "active";
  const showSuspend = canSuspend && ["active", "trial", "past_due"].includes(status);
  const showActivate = canActivate && ["suspended", "cancelled"].includes(status);

  return (
    <div className="flex items-center justify-end gap-1">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild size="sm" variant="ghost" className="h-8 gap-1 text-xs">
              <Link to="/super-admin/tenants/$id" params={{ id: tenant.id }}>
                Details <ChevronRight className="h-3 w-3" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>View full tenant detail</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {(canSession || showSuspend || showActivate) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild>
              <Link to="/super-admin/tenants/$id" params={{ id: tenant.id }} className="flex items-center gap-2">
                <Building2 className="h-4 w-4" /> View Detail Page
              </Link>
            </DropdownMenuItem>

            {canSession && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="flex items-center gap-2 text-amber-700 dark:text-amber-400 focus:text-amber-700 dark:focus:text-amber-400"
                  onSelect={onSession}
                >
                  <LogIn className="h-4 w-4" /> Start Support Session
                </DropdownMenuItem>
              </>
            )}

            {(showSuspend || showActivate) && <DropdownMenuSeparator />}

            {showSuspend && (
              <DropdownMenuItem
                className="flex items-center gap-2 text-amber-700 dark:text-amber-400 focus:text-amber-700 dark:focus:text-amber-400"
                onSelect={onSuspend}
              >
                <Lock className="h-4 w-4" /> Suspend Tenant
              </DropdownMenuItem>
            )}

            {showActivate && (
              <DropdownMenuItem
                className="flex items-center gap-2 text-success focus:text-success"
                onSelect={onActivate}
              >
                <Unlock className="h-4 w-4" /> Reactivate Tenant
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function TenantsContent() {
  const qc = useQueryClient();
  const { canPlatform } = usePlatformAuth();

  // Filters
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [planCode, setPlanCode] = useState("all");
  const [page, setPage] = useState(0);

  // Dialog targets
  const [suspendTarget, setSuspendTarget] = useState<TenantRow | null>(null);
  const [activateTarget, setActivateTarget] = useState<TenantRow | null>(null);
  const [sessionTarget, setSessionTarget] = useState<TenantRow | null>(null);

  const canSuspend = canPlatform(PLATFORM_PERMISSIONS.tenantsSuspend);
  const canActivate = canPlatform(PLATFORM_PERMISSIONS.tenantsActivate);
  const canSession = canPlatform(PLATFORM_PERMISSIONS.supportImpersonate);

  // ── Fetch plans for filter dropdown ────────────────────────────────────
  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ["super_admin_plans"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("plans")
        .select("id,name,code,price_usd")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });

  // ── Fetch tenants ───────────────────────────────────────────────────────
  const queryKey = ["super_admin_tenants", search, status, planCode, page];
  const {
    data: rows = [],
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useQuery<TenantRow[]>({
    queryKey,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("list_platform_tenants", {
        _search: search.trim() || null,
        _status: status === "all" ? null : status,
        _plan_code: planCode === "all" ? null : planCode,
        _limit: PAGE_SIZE,
        _offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return (data ?? []) as TenantRow[];
    },
  });

  const totalCount = rows[0]?.total_count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasNext = page + 1 < totalPages;
  const hasPrev = page > 0;

  // When filters change, reset to page 0
  const applySearch = useCallback((val: string) => {
    setSearch(val);
    setPage(0);
  }, []);
  const applyStatus = useCallback((val: string) => {
    setStatus(val);
    setPage(0);
  }, []);
  const applyPlan = useCallback((val: string) => {
    setPlanCode(val);
    setPage(0);
  }, []);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["super_admin_tenants"] });
    qc.invalidateQueries({ queryKey: ["super_admin_tenant_detail"] });
  };

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Tenants
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">All business workspaces on the AURORA platform.</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 self-start"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* ── KPI bar ──────────────────────────────────────────────────── */}
      {rows.length > 0 && <KpiBar tenants={rows} />}

      {/* ── Filter row ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-0 sm:max-w-72">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            className="h-9 pl-8"
            placeholder="Search name or slug…"
            value={search}
            onChange={(e) => applySearch(e.target.value)}
          />
        </div>

        {/* Status filter */}
        <Select value={status} onValueChange={applyStatus}>
          <SelectTrigger className="h-9 w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALL_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Plan filter */}
        <Select value={planCode} onValueChange={applyPlan}>
          <SelectTrigger className="h-9 w-full sm:w-40">
            <SelectValue placeholder="All plans" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All plans</SelectItem>
            {plans.map((p) => (
              <SelectItem key={p.code} value={p.code}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Active filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {status !== "all" && (
            <Badge variant="secondary" className="gap-1 text-xs cursor-pointer" onClick={() => applyStatus("all")}>
              {status.replace("_", " ")} <XCircle className="h-3 w-3" />
            </Badge>
          )}
          {planCode !== "all" && (
            <Badge variant="secondary" className="gap-1 text-xs cursor-pointer" onClick={() => applyPlan("all")}>
              {plans.find((p) => p.code === planCode)?.name ?? planCode} <XCircle className="h-3 w-3" />
            </Badge>
          )}
        </div>
      </div>

      {/* ── Result count ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {isLoading ? "Loading…" : `${totalCount.toLocaleString()} tenant${totalCount !== 1 ? "s" : ""}`}
          {(status !== "all" || planCode !== "all" || search) && " matching filters"}
        </span>
        {totalPages > 1 && (
          <span>
            Page {page + 1} of {totalPages}
          </span>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────────────────── */}
      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20">
              <TableHead className="text-xs">Business</TableHead>
              <TableHead className="text-xs">
                <span className="flex items-center gap-1">
                  <Layers className="h-3 w-3" /> Plan
                </span>
              </TableHead>
              <TableHead className="text-xs">
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" /> Users
                </span>
              </TableHead>
              <TableHead className="text-xs">Currency</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Sub Status</TableHead>
              <TableHead className="text-xs">Created</TableHead>
              <TableHead className="w-48" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Loading */}
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="py-14 text-center">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}

            {/* Error */}
            {!isLoading && isError && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-destructive">
                  <div className="flex flex-col items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    {error instanceof Error ? error.message : "Failed to load tenants."}
                    <Button size="sm" variant="outline" onClick={() => refetch()}>
                      Try again
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {/* Empty */}
            {!isLoading && !isError && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-14 text-center text-sm text-muted-foreground">
                  <Building2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                  No tenants match the selected filters.
                </TableCell>
              </TableRow>
            )}

            {/* Rows */}
            {rows.map((tenant) => (
              <TableRow key={tenant.id} className="group hover:bg-muted/30">
                {/* Business identity */}
                <TableCell className="min-w-0">
                  <Link
                    to="/super-admin/tenants/$id"
                    params={{ id: tenant.id }}
                    className="flex items-center gap-3 min-w-0"
                  >
                    <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                      <Building2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate group-hover:underline">{tenant.name}</div>
                      <div className="font-mono text-[11px] text-muted-foreground truncate">{tenant.slug}</div>
                    </div>
                  </Link>
                </TableCell>

                {/* Plan */}
                <TableCell>
                  {tenant.plan_name ? (
                    <div>
                      <div className="text-sm font-medium">{tenant.plan_name}</div>
                      {tenant.plan_price != null && (
                        <div className="text-xs text-muted-foreground">{fmtMoney(tenant.plan_price)}/mo</div>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">No plan</span>
                  )}
                </TableCell>

                {/* Users */}
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-sm tabular-nums">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    {tenant.user_count ?? 0}
                  </span>
                </TableCell>

                {/* Currency */}
                <TableCell className="text-sm text-muted-foreground">{tenant.currency ?? "USD"}</TableCell>

                {/* Tenant status */}
                <TableCell>
                  <StatusBadge status={tenant.status} />
                </TableCell>

                {/* Subscription status */}
                <TableCell>
                  {tenant.sub_status ? (
                    <StatusBadge status={tenant.sub_status} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>

                {/* Created */}
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {dateFmt(tenant.created_at)}
                </TableCell>

                {/* Actions */}
                <TableCell>
                  <RowActions
                    tenant={tenant}
                    canSuspend={canSuspend}
                    canActivate={canActivate}
                    canSession={canSession}
                    onSuspend={() => setSuspendTarget(tenant)}
                    onActivate={() => setActivateTarget(tenant)}
                    onSession={() => setSessionTarget(tenant)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* ── Pagination ───────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1"
            onClick={() => setPage((p) => p - 1)}
            disabled={!hasPrev || isLoading}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page + 1} / {totalPages}
            {" · "}
            {(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, totalCount).toLocaleString()} of{" "}
            {totalCount.toLocaleString()}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasNext || isLoading}
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* ── Row-level action dialogs ──────────────────────────────────── */}
      <SuspendRowDialog
        open={!!suspendTarget}
        onOpenChange={(v) => {
          if (!v) setSuspendTarget(null);
        }}
        tenant={suspendTarget}
        onSuccess={() => {
          setSuspendTarget(null);
          invalidate();
        }}
      />

      <ActivateRowDialog
        open={!!activateTarget}
        onOpenChange={(v) => {
          if (!v) setActivateTarget(null);
        }}
        tenant={activateTarget}
        onSuccess={() => {
          setActivateTarget(null);
          invalidate();
        }}
      />

      <SessionRowDialog
        open={!!sessionTarget}
        onOpenChange={(v) => {
          if (!v) setSessionTarget(null);
        }}
        tenant={sessionTarget}
        onSuccess={() => {
          setSessionTarget(null);
          invalidate();
        }}
      />
    </div>
  );
}
