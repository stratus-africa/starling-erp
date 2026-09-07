/**
 * Super Admin — Subscription Management
 *
 * Route: /super-admin/billing/subscriptions
 *
 * Capabilities:
 *   - Monitor all customer tenant subscriptions
 *   - Search & filter by status, payment status, and plan
 *   - View deep subscription details, lifecycle timeline, and audit logs
 *   - Change plan with audit logging
 *   - Extend trial period with audit logging
 *   - Suspend / Pause subscription
 *   - Reactivate subscription
 *   - Cancel subscription (Immediate or At Period End)
 *
 * Security & Financial Isolation:
 *   - SaaS subscriptions manage tenant quotas and access only.
 *   - Tenant financial and general ledger accounting books are strictly untouched.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { db } from "@/lib/typed-db";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { fmtMoney, dateFmt, timeFmt } from "@/components/super-admin/tenant-shared";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ReceiptText,
  Building2,
  Calendar,
  Clock,
  DollarSign,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  Edit2,
  Layers,
  ArrowRight,
  Shield,
  Hourglass,
  CalendarDays,
  Sparkles,
  ExternalLink,
} from "lucide-react";

// ─── Route Definition ─────────────────────────────────────────────────────────

export const Route = createFileRoute("/super-admin/billing/subscriptions")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.billingView}>
      <SubscriptionManagementPage />
    </PermissionGuard>
  ),
});

// ─── Types & Constants ────────────────────────────────────────────────────────

export interface SubscriptionRecord {
  id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  plan_id: string;
  plan_name: string;
  plan_code: string;
  plan_price: number;
  status: "trialing" | "trial" | "active" | "past_due" | "paused" | "suspended" | "cancelled" | "expired";
  payment_status: "paid" | "pending" | "overdue" | "failed" | "trial";
  amount: number;
  currency: string;
  billing_interval: string;
  current_period_start: string;
  current_period_end: string | null;
  trial_ends_at: string | null;
  is_trialing: boolean;
  trial_days_remaining: number;
  cancelled_at: string | null;
  cancel_at_period_end: boolean;
  cancellation_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  total_count: number;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; class: string; icon: React.ElementType }
> = {
  active: {
    label: "Active",
    class: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    icon: CheckCircle2,
  },
  trialing: {
    label: "Trialing",
    class: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
    icon: Hourglass,
  },
  trial: {
    label: "Trialing",
    class: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
    icon: Hourglass,
  },
  past_due: {
    label: "Past Due",
    class: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
    icon: AlertTriangle,
  },
  paused: {
    label: "Paused",
    class: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    icon: PauseCircle,
  },
  suspended: {
    label: "Paused",
    class: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    icon: PauseCircle,
  },
  cancelled: {
    label: "Cancelled",
    class: "bg-muted text-muted-foreground border-border",
    icon: XCircle,
  },
  expired: {
    label: "Expired",
    class: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
    icon: Clock,
  },
};

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  paid: { label: "Paid", class: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20" },
  pending: { label: "Pending", class: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20" },
  overdue: { label: "Overdue", class: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20" },
  failed: { label: "Failed", class: "bg-destructive/10 text-destructive border-destructive/20" },
  trial: { label: "Trial (Free)", class: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20" },
};

// ─── Main Component ───────────────────────────────────────────────────────────

export function SubscriptionManagementPage() {
  const queryClient = useQueryClient();
  const { canPlatform } = usePlatformAuth();
  const canManage = canPlatform(PLATFORM_PERMISSIONS.billingManage) || canPlatform(PLATFORM_PERMISSIONS.plansManage);

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");

  // Selected Entity
  const [selectedSub, setSelectedSub] = useState<SubscriptionRecord | null>(null);

  // Dialog & Drawer States
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isChangePlanOpen, setIsChangePlanOpen] = useState(false);
  const [isExtendTrialOpen, setIsExtendTrialOpen] = useState(false);
  const [isSuspendOpen, setIsSuspendOpen] = useState(false);
  const [isReactivateOpen, setIsReactivateOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);

  // Action Form States
  const [targetPlanId, setTargetPlanId] = useState("");
  const [trialDaysToAdd, setTrialDaysToAdd] = useState(14);
  const [cancelImmediate, setCancelImmediate] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  const [auditReason, setAuditReason] = useState("");

  // ── Fetch Plans Catalogue (for Plan Selection) ───────────────────────────────
  const { data: plans = [] } = useQuery({
    queryKey: ["super-admin", "available-plans"],
    queryFn: async () => {
      const { data, error } = await db.from("plans").select("id, name, code, price_usd, is_active").order("price_usd");
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Fetch Subscriptions List via RPC ─────────────────────────────────────────
  const {
    data: subscriptions = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<SubscriptionRecord[]>({
    queryKey: [
      "super-admin",
      "tenant-subscriptions",
      searchTerm,
      statusFilter,
      paymentFilter,
      planFilter,
    ],
    queryFn: async () => {
      const { data, error } = await db.rpc("admin_list_tenant_subscriptions", {
        _search: searchTerm.trim() || null,
        _status: statusFilter === "all" ? null : statusFilter,
        _plan_id: planFilter === "all" ? null : planFilter,
        _payment_status: paymentFilter === "all" ? null : paymentFilter,
        _limit: 100,
        _offset: 0,
      });

      if (error) {
        toast.error("Failed to load tenant subscriptions: " + error.message);
        throw error;
      }
      return (data as SubscriptionRecord[]) ?? [];
    },
  });

  // ── Fetch Deep Subscription Detail ──────────────────────────────────────────
  const { data: detailData, isLoading: isDetailLoading } = useQuery({
    queryKey: ["super-admin", "subscription-detail", selectedSub?.id],
    queryFn: async () => {
      if (!selectedSub?.id) return null;
      const { data, error } = await db.rpc("admin_get_subscription_detail", {
        _subscription_id: selectedSub.id,
      });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSub?.id && isDetailOpen,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  // 1. Change Plan Mutation
  const changePlanMutation = useMutation({
    mutationFn: async ({
      subscriptionId,
      newPlanId,
      notes,
      reason,
    }: {
      subscriptionId: string;
      newPlanId: string;
      notes: string;
      reason: string;
    }) => {
      const { data, error } = await db.rpc("admin_change_subscription_plan", {
        _subscription_id: subscriptionId,
        _new_plan_id: newPlanId,
        _notes: notes || null,
        _reason: reason || "Plan changed by Super Admin",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Subscription plan updated successfully.");
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tenant-subscriptions"] });
      setIsChangePlanOpen(false);
      setAuditReason("");
      setActionNotes("");
    },
    onError: (err: any) => {
      toast.error("Failed to change plan: " + (err.message || "Unknown error"));
    },
  });

  // 2. Extend Trial Mutation
  const extendTrialMutation = useMutation({
    mutationFn: async ({
      subscriptionId,
      days,
      reason,
    }: {
      subscriptionId: string;
      days: number;
      reason: string;
    }) => {
      const { data, error } = await db.rpc("admin_extend_subscription_trial", {
        _subscription_id: subscriptionId,
        _days: days,
        _new_trial_end: null,
        _reason: reason || "Trial extended by Super Admin",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Trial period extended successfully.");
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tenant-subscriptions"] });
      setIsExtendTrialOpen(false);
      setAuditReason("");
    },
    onError: (err: any) => {
      toast.error("Failed to extend trial: " + (err.message || "Unknown error"));
    },
  });

  // 3. Suspend / Pause Mutation
  const suspendMutation = useMutation({
    mutationFn: async ({
      subscriptionId,
      reason,
    }: {
      subscriptionId: string;
      reason: string;
    }) => {
      const { data, error } = await db.rpc("admin_suspend_subscription", {
        _subscription_id: subscriptionId,
        _reason: reason || "Subscription suspended by Super Admin",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Subscription paused / suspended.");
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tenant-subscriptions"] });
      setIsSuspendOpen(false);
      setAuditReason("");
    },
    onError: (err: any) => {
      toast.error("Failed to suspend subscription: " + (err.message || "Unknown error"));
    },
  });

  // 4. Reactivate Mutation
  const reactivateMutation = useMutation({
    mutationFn: async ({
      subscriptionId,
      reason,
    }: {
      subscriptionId: string;
      reason: string;
    }) => {
      const { data, error } = await db.rpc("admin_reactivate_subscription", {
        _subscription_id: subscriptionId,
        _reason: reason || "Subscription reactivated by Super Admin",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Subscription reactivated successfully.");
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tenant-subscriptions"] });
      setIsReactivateOpen(false);
      setAuditReason("");
    },
    onError: (err: any) => {
      toast.error("Failed to reactivate subscription: " + (err.message || "Unknown error"));
    },
  });

  // 5. Cancel Subscription Mutation
  const cancelMutation = useMutation({
    mutationFn: async ({
      subscriptionId,
      immediate,
      cancellationReason,
      reason,
    }: {
      subscriptionId: string;
      immediate: boolean;
      cancellationReason: string;
      reason: string;
    }) => {
      const { data, error } = await db.rpc("admin_cancel_subscription", {
        _subscription_id: subscriptionId,
        _immediate: immediate,
        _cancellation_reason: cancellationReason || "Cancelled by Super Admin",
        _reason: reason || "Subscription cancelled by Super Admin",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      toast.success(
        variables.immediate
          ? "Subscription cancelled immediately."
          : "Subscription scheduled for cancellation at period end."
      );
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tenant-subscriptions"] });
      setIsCancelOpen(false);
      setCancellationReason("");
      setAuditReason("");
    },
    onError: (err: any) => {
      toast.error("Failed to cancel subscription: " + (err.message || "Unknown error"));
    },
  });

  // ─── Metrics Calculation ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = subscriptions.length;
    const active = subscriptions.filter((s) => s.status === "active").length;
    const trialing = subscriptions.filter(
      (s) => s.status === "trialing" || s.status === "trial" || s.is_trialing
    ).length;
    const pastDue = subscriptions.filter((s) => s.status === "past_due" || s.payment_status === "overdue").length;
    const pausedOrCancelled = subscriptions.filter(
      (s) => s.status === "paused" || s.status === "suspended" || s.status === "cancelled" || s.status === "expired"
    ).length;
    const totalMmr = subscriptions
      .filter((s) => s.status === "active")
      .reduce((acc, s) => acc + (Number(s.amount) || 0), 0);

    return { total, active, trialing, pastDue, pausedOrCancelled, totalMmr };
  }, [subscriptions]);

  // ─── Action Triggers ────────────────────────────────────────────────────────

  const openDetailDrawer = (sub: SubscriptionRecord) => {
    setSelectedSub(sub);
    setIsDetailOpen(true);
  };

  const openChangePlanDialog = (sub: SubscriptionRecord) => {
    setSelectedSub(sub);
    setTargetPlanId(sub.plan_id);
    setActionNotes(sub.notes || "");
    setAuditReason("");
    setIsChangePlanOpen(true);
  };

  const openExtendTrialDialog = (sub: SubscriptionRecord) => {
    setSelectedSub(sub);
    setTrialDaysToAdd(14);
    setAuditReason("");
    setIsExtendTrialOpen(true);
  };

  const openSuspendDialog = (sub: SubscriptionRecord) => {
    setSelectedSub(sub);
    setAuditReason("");
    setIsSuspendOpen(true);
  };

  const openReactivateDialog = (sub: SubscriptionRecord) => {
    setSelectedSub(sub);
    setAuditReason("");
    setIsReactivateOpen(true);
  };

  const openCancelDialog = (sub: SubscriptionRecord) => {
    setSelectedSub(sub);
    setCancelImmediate(false);
    setCancellationReason("");
    setAuditReason("");
    setIsCancelOpen(true);
  };

  return (
    <div className="flex flex-col gap-6 p-6 w-full">
      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">
            <ReceiptText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              Subscription Management
            </h1>
            <p className="text-xs text-muted-foreground">
              Monitor active SaaS customer subscriptions, lifecycle states, trial periods, and billing health.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
            className="h-9 gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button variant="outline" size="sm" asChild className="h-9 gap-1.5 text-xs">
            <Link to="/super-admin/billing/plans">
              <Layers className="h-3.5 w-3.5" />
              Manage Plans
            </Link>
          </Button>
        </div>
      </div>

      {/* ─── Architectural Callout Banner ─────────────────────────────────── */}
      <Card className="border-border/60 bg-muted/30 shadow-none">
        <CardContent className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
              <Shield className="h-5 w-5" />
            </div>
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-foreground flex items-center gap-2">
                <span>SaaS Billing & Subscription Isolation</span>
                <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                  Tenant Ledgers Unaffected
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Super Admin subscription actions regulate platform access, quota allocations, and feature entitlement tiers.
                Tenant accounting journals, general ledger books, and ERP customer invoices are strictly isolated and never modified by SaaS subscription status transitions.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Metric Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-4 bg-card border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Subscriptions</span>
            <ReceiptText className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-bold">{stats.total}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Across all tenants</p>
        </Card>

        <Card className="p-4 bg-card border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Active Paid</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {stats.active}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {fmtMoney(stats.totalMmr)} / mo MRR
          </p>
        </Card>

        <Card className="p-4 bg-card border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Trialing Accounts</span>
            <Hourglass className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-400">
            {stats.trialing}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">In trial period</p>
        </Card>

        <Card className="p-4 bg-card border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Past Due / Overdue</span>
            <AlertTriangle className="h-4 w-4 text-rose-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400">
            {stats.pastDue}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Action required</p>
        </Card>

        <Card className="p-4 bg-card border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Paused / Cancelled</span>
            <PauseCircle className="h-4 w-4 text-zinc-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-muted-foreground">
            {stats.pausedOrCancelled}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Inactive status</p>
        </Card>
      </div>

      {/* ─── Search & Filters Bar ───────────────────────────────────────────── */}
      <Card className="p-4 border-border/70 bg-card">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          <div className="flex flex-1 flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by tenant name, slug, or plan..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 text-xs h-9"
              />
            </div>

            {/* Status Filter */}
            <div className="w-full sm:w-40">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
                  <SelectItem value="active" className="text-xs">Active</SelectItem>
                  <SelectItem value="trialing" className="text-xs">Trialing</SelectItem>
                  <SelectItem value="past_due" className="text-xs">Past Due</SelectItem>
                  <SelectItem value="paused" className="text-xs">Paused</SelectItem>
                  <SelectItem value="cancelled" className="text-xs">Cancelled</SelectItem>
                  <SelectItem value="expired" className="text-xs">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Payment Filter */}
            <div className="w-full sm:w-36">
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Payment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Payments</SelectItem>
                  <SelectItem value="paid" className="text-xs">Paid</SelectItem>
                  <SelectItem value="pending" className="text-xs">Pending</SelectItem>
                  <SelectItem value="overdue" className="text-xs">Overdue</SelectItem>
                  <SelectItem value="failed" className="text-xs">Failed</SelectItem>
                  <SelectItem value="trial" className="text-xs">Trial (Free)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Plan Filter */}
            <div className="w-full sm:w-44">
              <Select value={planFilter} onValueChange={setPlanFilter}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Plans</SelectItem>
                  {plans.map((p: any) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(searchTerm || statusFilter !== "all" || paymentFilter !== "all" || planFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("all");
                setPaymentFilter("all");
                setPlanFilter("all");
              }}
              className="h-9 text-xs text-muted-foreground"
            >
              Reset Filters
            </Button>
          )}
        </div>
      </Card>

      {/* ─── Subscriptions Table ────────────────────────────────────────────── */}
      <Card className="overflow-hidden border-border/70 p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-xs font-semibold">Tenant Organization</TableHead>
              <TableHead className="text-xs font-semibold">Assigned Plan</TableHead>
              <TableHead className="text-xs font-semibold">Subscription Status</TableHead>
              <TableHead className="text-xs font-semibold">Start & Renewal Dates</TableHead>
              <TableHead className="text-xs font-semibold">Trial Status</TableHead>
              <TableHead className="text-xs font-semibold">Billing Amount</TableHead>
              <TableHead className="text-xs font-semibold">Payment Status</TableHead>
              <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span>Loading tenant subscriptions...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : subscriptions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <ReceiptText className="h-8 w-8 text-muted-foreground/40" />
                    <p className="font-medium text-foreground">No subscriptions found</p>
                    <p className="text-xs text-muted-foreground">
                      {searchTerm || statusFilter !== "all"
                        ? "No records match your active search and filter criteria."
                        : "No tenant subscriptions currently registered in the database."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              subscriptions.map((sub) => {
                const statusMeta = STATUS_CONFIG[sub.status] ?? STATUS_CONFIG.active;
                const paymentMeta = PAYMENT_STATUS_CONFIG[sub.payment_status] ?? PAYMENT_STATUS_CONFIG.paid;
                const StatusIcon = statusMeta.icon;

                return (
                  <TableRow key={sub.id} className="hover:bg-muted/20 transition-colors">
                    {/* Tenant */}
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 border flex items-center justify-center text-xs font-bold text-primary">
                          <Building2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <Link
                            to="/super-admin/tenants/$id"
                            params={{ id: sub.tenant_id }}
                            className="font-semibold text-xs text-foreground hover:underline truncate block"
                          >
                            {sub.tenant_name}
                          </Link>
                          <span className="text-[11px] font-mono text-muted-foreground">{sub.tenant_slug}</span>
                        </div>
                      </div>
                    </TableCell>

                    {/* Plan */}
                    <TableCell>
                      <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                        <span>{sub.plan_name}</span>
                        <Badge variant="outline" className="text-[10px] font-mono border-border">
                          {sub.plan_code}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {fmtMoney(sub.plan_price)} / {sub.billing_interval}
                      </div>
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <Badge className={`text-[10px] gap-1 border ${statusMeta.class}`}>
                        <StatusIcon className="h-3 w-3" />
                        {statusMeta.label}
                      </Badge>
                      {sub.cancel_at_period_end && (
                        <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                          Cancels at period end
                        </div>
                      )}
                    </TableCell>

                    {/* Dates */}
                    <TableCell>
                      <div className="text-xs space-y-0.5">
                        <div className="text-muted-foreground text-[11px]">
                          Start: <span className="text-foreground">{dateFmt(sub.current_period_start)}</span>
                        </div>
                        <div className="text-muted-foreground text-[11px]">
                          Renewal: <span className="text-foreground">{sub.current_period_end ? dateFmt(sub.current_period_end) : "—"}</span>
                        </div>
                      </div>
                    </TableCell>

                    {/* Trial Status */}
                    <TableCell>
                      {sub.is_trialing ? (
                        <div className="space-y-0.5 text-xs">
                          <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20 text-[10px]">
                            {sub.trial_days_remaining}d remaining
                          </Badge>
                          <div className="text-[10px] text-muted-foreground">
                            Ends: {dateFmt(sub.trial_ends_at)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/60">—</span>
                      )}
                    </TableCell>

                    {/* Amount & Currency */}
                    <TableCell>
                      <div className="font-semibold text-xs text-foreground">
                        {fmtMoney(sub.amount)} {sub.currency}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase">{sub.billing_interval}</div>
                    </TableCell>

                    {/* Payment Status */}
                    <TableCell>
                      <Badge className={`text-[10px] border ${paymentMeta.class}`}>
                        {paymentMeta.label}
                      </Badge>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDetailDrawer(sub)}
                          className="h-7 px-2 text-xs"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          View
                        </Button>

                        {canManage && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuLabel className="text-xs">Subscription Actions</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => openDetailDrawer(sub)} className="text-xs cursor-pointer">
                                <Eye className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                                Inspect Details & Timeline
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openChangePlanDialog(sub)} className="text-xs cursor-pointer">
                                <Edit2 className="h-3.5 w-3.5 mr-2 text-primary" />
                                Change Subscription Plan
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openExtendTrialDialog(sub)} className="text-xs cursor-pointer">
                                <Hourglass className="h-3.5 w-3.5 mr-2 text-blue-500" />
                                Extend Trial Period
                              </DropdownMenuItem>

                              <DropdownMenuSeparator />

                              {sub.status === "paused" || sub.status === "suspended" ? (
                                <DropdownMenuItem
                                  onClick={() => openReactivateDialog(sub)}
                                  className="text-xs cursor-pointer text-emerald-600 dark:text-emerald-400"
                                >
                                  <PlayCircle className="h-3.5 w-3.5 mr-2" />
                                  Reactivate Subscription
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => openSuspendDialog(sub)}
                                  className="text-xs cursor-pointer text-amber-600 dark:text-amber-400"
                                >
                                  <PauseCircle className="h-3.5 w-3.5 mr-2" />
                                  Suspend / Pause Subscription
                                </DropdownMenuItem>
                              )}

                              <DropdownMenuItem
                                onClick={() => openCancelDialog(sub)}
                                className="text-xs cursor-pointer text-destructive focus:text-destructive"
                              >
                                <XCircle className="h-3.5 w-3.5 mr-2" />
                                Cancel Subscription
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* ─── Drawer: Subscription Detail ────────────────────────────────────── */}
      <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle className="text-base font-bold flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-primary" />
              Subscription Specifications & Audit History
            </SheetTitle>
            <SheetDescription className="text-xs">
              Complete subscriber metadata, renewal timeline, past subscriptions, and audit log events.
            </SheetDescription>
          </SheetHeader>

          {selectedSub && (
            <div className="flex flex-col gap-6 py-4 text-xs">
              {/* Summary Card */}
              <div className="p-4 rounded-lg bg-muted/40 border flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold text-xs text-muted-foreground">Subscriber Tenant</div>
                  <h3 className="text-base font-bold text-foreground flex items-center gap-1.5 mt-0.5">
                    {selectedSub.tenant_name}
                    <Button variant="ghost" size="sm" asChild className="h-5 px-1.5 text-[10px]">
                      <Link to="/super-admin/tenants/$id" params={{ id: selectedSub.tenant_id }}>
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </Button>
                  </h3>
                  <p className="font-mono text-xs text-muted-foreground">{selectedSub.tenant_slug}</p>
                </div>
                <div className="space-y-1 text-right">
                  <Badge className={`text-[10px] border ${(STATUS_CONFIG[selectedSub.status] ?? STATUS_CONFIG.active).class}`}>
                    {(STATUS_CONFIG[selectedSub.status] ?? STATUS_CONFIG.active).label}
                  </Badge>
                  <div className="font-bold text-sm text-foreground">
                    {fmtMoney(selectedSub.amount)} {selectedSub.currency}
                  </div>
                </div>
              </div>

              {/* Attributes Breakdown */}
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground uppercase tracking-wider text-muted-foreground text-[11px]">
                  Subscription Lifecycle
                </h4>
                <div className="rounded-lg border bg-card divide-y">
                  <div className="p-2.5 flex items-center justify-between">
                    <span className="text-muted-foreground">Active Plan</span>
                    <span className="font-semibold">{selectedSub.plan_name} ({selectedSub.plan_code})</span>
                  </div>
                  <div className="p-2.5 flex items-center justify-between">
                    <span className="text-muted-foreground">Billing Interval</span>
                    <span className="font-semibold capitalize">{selectedSub.billing_interval}</span>
                  </div>
                  <div className="p-2.5 flex items-center justify-between">
                    <span className="text-muted-foreground">Current Period Start</span>
                    <span>{dateFmt(selectedSub.current_period_start)}</span>
                  </div>
                  <div className="p-2.5 flex items-center justify-between">
                    <span className="text-muted-foreground">Current Period End / Renewal</span>
                    <span>{selectedSub.current_period_end ? dateFmt(selectedSub.current_period_end) : "—"}</span>
                  </div>
                  <div className="p-2.5 flex items-center justify-between">
                    <span className="text-muted-foreground">Trial Status</span>
                    <span>
                      {selectedSub.is_trialing
                        ? `Trial active until ${dateFmt(selectedSub.trial_ends_at)} (${selectedSub.trial_days_remaining}d left)`
                        : "No active trial"}
                    </span>
                  </div>
                  <div className="p-2.5 flex items-center justify-between">
                    <span className="text-muted-foreground">Payment Standing</span>
                    <Badge className={`text-[10px] border ${(PAYMENT_STATUS_CONFIG[selectedSub.payment_status] ?? PAYMENT_STATUS_CONFIG.paid).class}`}>
                      {(PAYMENT_STATUS_CONFIG[selectedSub.payment_status] ?? PAYMENT_STATUS_CONFIG.paid).label}
                    </Badge>
                  </div>
                  {selectedSub.cancelled_at && (
                    <div className="p-2.5 flex items-center justify-between bg-destructive/5">
                      <span className="text-destructive font-medium">Cancellation Date</span>
                      <span className="text-destructive">{dateFmt(selectedSub.cancelled_at)}</span>
                    </div>
                  )}
                  {selectedSub.cancellation_reason && (
                    <div className="p-2.5 space-y-1">
                      <span className="text-muted-foreground">Cancellation Reason:</span>
                      <p className="text-xs text-foreground bg-muted p-2 rounded">
                        {selectedSub.cancellation_reason}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Past Subscriptions History */}
              {detailData?.history && detailData.history.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-foreground uppercase tracking-wider text-muted-foreground text-[11px]">
                    Subscription History
                  </h4>
                  <div className="rounded-lg border bg-card divide-y max-h-48 overflow-y-auto">
                    {detailData.history.map((hist: any) => (
                      <div key={hist.id} className="p-2.5 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-semibold">{hist.plan_name}</div>
                          <div className="text-[10px] text-muted-foreground">{dateFmt(hist.created_at)}</div>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {hist.status}
                          </Badge>
                          {hist.amount && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">{fmtMoney(hist.amount)}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {canManage && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="text-xs font-semibold text-foreground">Management Quick Actions</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openChangePlanDialog(selectedSub)}
                      className="text-xs h-8 justify-start"
                    >
                      <Edit2 className="h-3.5 w-3.5 mr-1.5 text-primary" />
                      Change Plan
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openExtendTrialDialog(selectedSub)}
                      className="text-xs h-8 justify-start"
                    >
                      <Hourglass className="h-3.5 w-3.5 mr-1.5 text-blue-500" />
                      Extend Trial
                    </Button>
                    {selectedSub.status === "paused" || selectedSub.status === "suspended" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openReactivateDialog(selectedSub)}
                        className="text-xs h-8 justify-start text-emerald-600 dark:text-emerald-400"
                      >
                        <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
                        Reactivate
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openSuspendDialog(selectedSub)}
                        className="text-xs h-8 justify-start text-amber-600 dark:text-amber-400"
                      >
                        <PauseCircle className="h-3.5 w-3.5 mr-1.5" />
                        Suspend / Pause
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => openCancelDialog(selectedSub)}
                      className="text-xs h-8 justify-start"
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1.5" />
                      Cancel Sub
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ─── Dialog: Change Plan ────────────────────────────────────────────── */}
      <Dialog open={isChangePlanOpen} onOpenChange={setIsChangePlanOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Edit2 className="h-4 w-4 text-primary" />
              Change Subscription Plan
            </DialogTitle>
            <DialogDescription className="text-xs">
              Reassign subscription plan for <span className="font-semibold text-foreground">{selectedSub?.tenant_name}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Select Target Plan <span className="text-destructive">*</span></Label>
              <Select value={targetPlanId} onValueChange={setTargetPlanId}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Choose a plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p: any) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.name} ({p.code}) — {fmtMoney(p.price_usd)} / mo
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Administrative Notes</Label>
              <Input
                placeholder="Optional notes or reference ticket..."
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Reason for Plan Change <span className="text-destructive">*</span>
              </Label>
              <Textarea
                placeholder="e.g., Upgrade requested by customer owner per ticket #402..."
                value={auditReason}
                onChange={(e) => setAuditReason(e.target.value)}
                className="text-xs h-16"
              />
              <p className="text-[10px] text-muted-foreground">Will be logged in the Platform Audit Trail.</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsChangePlanOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={changePlanMutation.isPending || !targetPlanId}
              onClick={() => {
                if (!selectedSub) return;
                if (!auditReason.trim()) {
                  toast.error("Please provide an audit reason for changing the plan.");
                  return;
                }
                changePlanMutation.mutate({
                  subscriptionId: selectedSub.id,
                  newPlanId: targetPlanId,
                  notes: actionNotes.trim(),
                  reason: auditReason.trim(),
                });
              }}
              className="text-xs"
            >
              {changePlanMutation.isPending ? "Updating Plan..." : "Confirm Plan Change"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Extend Trial ───────────────────────────────────────────── */}
      <Dialog open={isExtendTrialOpen} onOpenChange={setIsExtendTrialOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Hourglass className="h-4 w-4 text-blue-500" />
              Extend Trial Period
            </DialogTitle>
            <DialogDescription className="text-xs">
              Add complimentary trial days for <span className="font-semibold text-foreground">{selectedSub?.tenant_name}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Days to Add</Label>
              <Select
                value={trialDaysToAdd.toString()}
                onValueChange={(val) => setTrialDaysToAdd(parseInt(val))}
              >
                <SelectTrigger className="text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7" className="text-xs">+7 Days (1 Week)</SelectItem>
                  <SelectItem value="14" className="text-xs">+14 Days (2 Weeks)</SelectItem>
                  <SelectItem value="30" className="text-xs">+30 Days (1 Month)</SelectItem>
                  <SelectItem value="60" className="text-xs">+60 Days (2 Months)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Reason for Extension <span className="text-destructive">*</span>
              </Label>
              <Textarea
                placeholder="e.g., Evaluation extension granted for security review..."
                value={auditReason}
                onChange={(e) => setAuditReason(e.target.value)}
                className="text-xs h-16"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsExtendTrialOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={extendTrialMutation.isPending}
              onClick={() => {
                if (!selectedSub) return;
                if (!auditReason.trim()) {
                  toast.error("Please provide an audit reason for extending the trial.");
                  return;
                }
                extendTrialMutation.mutate({
                  subscriptionId: selectedSub.id,
                  days: trialDaysToAdd,
                  reason: auditReason.trim(),
                });
              }}
              className="text-xs"
            >
              {extendTrialMutation.isPending ? "Extending..." : "Confirm Extension"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Suspend / Pause Subscription ───────────────────────────── */}
      <Dialog open={isSuspendOpen} onOpenChange={setIsSuspendOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <PauseCircle className="h-4 w-4" />
              Suspend / Pause Subscription
            </DialogTitle>
            <DialogDescription className="text-xs">
              Temporarily pause SaaS service for <span className="font-semibold text-foreground">{selectedSub?.tenant_name}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2 text-xs">
            <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
              <p className="font-semibold">Access Suspended</p>
              <p className="mt-0.5 text-[11px]">
                The tenant's users will be temporarily restricted from accessing premium features. Historical data and accounting books remain intact.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Reason for Suspension <span className="text-destructive">*</span>
              </Label>
              <Textarea
                placeholder="e.g., Temporary hold requested by client or overdue settlement..."
                value={auditReason}
                onChange={(e) => setAuditReason(e.target.value)}
                className="text-xs h-16"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsSuspendOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={suspendMutation.isPending}
              onClick={() => {
                if (!selectedSub) return;
                if (!auditReason.trim()) {
                  toast.error("Please enter a reason for suspension.");
                  return;
                }
                suspendMutation.mutate({
                  subscriptionId: selectedSub.id,
                  reason: auditReason.trim(),
                });
              }}
              className="text-xs"
            >
              {suspendMutation.isPending ? "Suspending..." : "Confirm Suspension"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Reactivate Subscription ────────────────────────────────── */}
      <Dialog open={isReactivateOpen} onOpenChange={setIsReactivateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <PlayCircle className="h-4 w-4" />
              Reactivate Subscription
            </DialogTitle>
            <DialogDescription className="text-xs">
              Restore full active status for <span className="font-semibold text-foreground">{selectedSub?.tenant_name}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2 text-xs">
            <div className="p-3 rounded bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-700 dark:text-emerald-300">
              <p className="font-semibold">Immediate Service Restoration</p>
              <p className="mt-0.5 text-[11px]">
                Subscription status will be set to Active and current billing cycle restarted.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Reason for Reactivation <span className="text-destructive">*</span>
              </Label>
              <Textarea
                placeholder="e.g., Payment cleared or suspension resolved..."
                value={auditReason}
                onChange={(e) => setAuditReason(e.target.value)}
                className="text-xs h-16"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsReactivateOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={reactivateMutation.isPending}
              onClick={() => {
                if (!selectedSub) return;
                if (!auditReason.trim()) {
                  toast.error("Please enter a reason for reactivation.");
                  return;
                }
                reactivateMutation.mutate({
                  subscriptionId: selectedSub.id,
                  reason: auditReason.trim(),
                });
              }}
              className="text-xs"
            >
              {reactivateMutation.isPending ? "Reactivating..." : "Confirm Reactivation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Cancel Subscription ────────────────────────────────────── */}
      <Dialog open={isCancelOpen} onOpenChange={setIsCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-destructive">
              <XCircle className="h-4 w-4" />
              Cancel Subscription
            </DialogTitle>
            <DialogDescription className="text-xs">
              Cancel SaaS subscription for <span className="font-semibold text-foreground">{selectedSub?.tenant_name}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2 text-xs">
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
              <div className="space-y-0.5">
                <div className="font-semibold text-foreground">Immediate Termination</div>
                <div className="text-[11px] text-muted-foreground">
                  {cancelImmediate
                    ? "Cancels immediately right now"
                    : "Allows usage until current period end date"}
                </div>
              </div>
              <Switch checked={cancelImmediate} onCheckedChange={setCancelImmediate} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Customer Cancellation Reason <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g., Switched to competitor, budget constraints, etc."
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Super Admin Audit Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                placeholder="e.g., Requested by tenant admin via ticket #810..."
                value={auditReason}
                onChange={(e) => setAuditReason(e.target.value)}
                className="text-xs h-16"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsCancelOpen(false)} className="text-xs">
              Back
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={cancelMutation.isPending}
              onClick={() => {
                if (!selectedSub) return;
                if (!cancellationReason.trim() || !auditReason.trim()) {
                  toast.error("Please fill in both cancellation reason and audit reason.");
                  return;
                }
                cancelMutation.mutate({
                  subscriptionId: selectedSub.id,
                  immediate: cancelImmediate,
                  cancellationReason: cancellationReason.trim(),
                  reason: auditReason.trim(),
                });
              }}
              className="text-xs"
            >
              {cancelMutation.isPending ? "Cancelling..." : "Confirm Cancellation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SubscriptionManagementPage;
