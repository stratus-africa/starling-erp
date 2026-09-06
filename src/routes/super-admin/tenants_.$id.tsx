/**
 * Super Admin — Tenant Detail Page
 *
 * Route: /super-admin/tenants/$id
 *
 * Tabs:
 *   Overview      — header KPIs, status timeline, quick facts
 *   Users         — all users of this tenant with roles
 *   Subscription  — active plan, period, limits, history
 *   Usage         — user count, feature flags, document counts
 *   Activity      — platform audit log entries for this tenant
 *   Billing       — subscription history, pricing
 *   Health        — integrity checks, draft docs, unbalanced journals
 *   Audit         — ERP-level business events (tenant's own audit trail)
 *
 * Admin Actions (all permission-gated, all write to platform_audit_log):
 *   Activate      — suspended/cancelled → active    (platform.tenants.activate)
 *   Suspend       — active/trial → suspended         (platform.tenants.suspend)
 *   Change Plan   — reassign subscription plan       (platform.plans.manage)
 *   Support Session — timed impersonation            (platform.support.impersonate)
 *
 * Data source: get_tenant_detail(_tenant_id) → single JSONB round-trip
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { db } from "@/lib/typed-db";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import {
  StatusBadge,
  dateFmt,
  timeFmt,
  fmtMoney,
  type Tenant,
  type TenantSubscription,
  type TenantUser,
} from "@/components/super-admin/tenant-shared";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  ExternalLink,
  FileText,
  FlaskConical,
  Globe,
  Loader2,
  Lock,
  LogIn,
  Package,
  Play,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Unlock,
  UserCog,
  Users,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/super-admin/tenants_/$id")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.tenantsView}>
      <TenantDetailPage />
    </PermissionGuard>
  ),
});

// ─── Types from get_tenant_detail payload ─────────────────────────────────────

interface DetailPayload {
  tenant: Tenant;
  subscription: TenantSubscription | null;
  subscription_history: TenantSubscription[];
  users: TenantUser[];
  usage: {
    user_count: number;
    active_users_30d: number;
    feature_flags: Record<string, boolean>;
    journal_count: number;
    invoice_count: number;
  };
  platform_activity: PlatformEvent[];
  business_events: BusinessEvent[];
  health: HealthData;
  available_plans: Plan[];
}

interface PlatformEvent {
  id: string;
  action: string;
  actor_email: string;
  actor_role: string | null;
  target_label: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

interface BusinessEvent {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  actor_email: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  occurred_at: string;
}

interface HealthData {
  integrity_errors: number;
  integrity_warnings: number;
  unbalanced_journals: number;
  draft_journals: number;
  unposted_invoices: number;
  active_support_sessions: number;
}

interface Plan {
  id: string;
  name: string;
  code: string;
  price_usd: number;
  max_users: number | null;
  max_storage_gb: number | null;
}

// ─── Feature flag metadata ────────────────────────────────────────────────────

const FEATURE_META: Record<string, { label: string; icon: React.ElementType }> = {
  manufacturing: { label: "Manufacturing", icon: Package },
  multi_location: { label: "Multi-Location", icon: Globe },
  advanced_inventory: { label: "Advanced Inventory", icon: FlaskConical },
  banking: { label: "Banking", icon: Wallet },
  crm: { label: "CRM", icon: UserCog },
  pos: { label: "Point of Sale", icon: Terminal },
  payroll: { label: "Payroll", icon: CreditCard },
  advanced_reports: { label: "Advanced Reports", icon: Activity },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold leading-tight">{value}</span>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

function HealthBadge({ count, label, variant }: { count: number; label: string; variant: "error" | "warning" | "ok" }) {
  if (count === 0 && variant !== "ok") return null;
  const cls =
    variant === "error"
      ? "bg-destructive/10 text-destructive border-destructive/20"
      : variant === "warning"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20"
        : "bg-success/10 text-success border-success/20";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${cls}`}>
      {count === 0 ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {count > 0 ? count : ""} {label}
    </span>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  action,
}: {
  icon: React.ElementType;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {title}
      </h3>
      {action}
    </div>
  );
}

// ─── Action dialogs ────────────────────────────────────────────────────────────

function SuspendDialog({
  open,
  onOpenChange,
  tenant,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenant: Tenant;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await (db as any).rpc("admin_set_tenant_status", {
        _tenant_id: tenant.id,
        _new_status: "suspended",
        _reason: reason.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${tenant.name} suspended.`);
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
            Suspend {tenant.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The tenant's workspace will be locked. All active subscriptions will be paused. Tenant data is preserved and
            the account can be reactivated.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-2">
          <Label htmlFor="suspend-reason" className="text-sm">
            Reason (optional)
          </Label>
          <Textarea
            id="suspend-reason"
            className="mt-1.5"
            rows={2}
            placeholder="Non-payment, policy violation…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-amber-500 text-white hover:bg-amber-600"
            onClick={() => {
              if (!mutation.isPending) mutation.mutate();
            }}
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Suspend
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ActivateDialog({
  open,
  onOpenChange,
  tenant,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenant: Tenant;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await (db as any).rpc("admin_set_tenant_status", {
        _tenant_id: tenant.id,
        _new_status: "active",
        _reason: reason.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${tenant.name} reactivated.`);
      setReason("");
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
            Activate {tenant.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The tenant's workspace will be unlocked and subscriptions restored to active.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-2">
          <Label htmlFor="activate-reason" className="text-sm">
            Note (optional)
          </Label>
          <Textarea
            id="activate-reason"
            className="mt-1.5"
            rows={2}
            placeholder="Payment received, issue resolved…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (!mutation.isPending) mutation.mutate();
            }}
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Activate
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ChangePlanDialog({
  open,
  onOpenChange,
  tenant,
  currentPlanId,
  plans,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenant: Tenant;
  currentPlanId?: string;
  plans: Plan[];
  onSuccess: () => void;
}) {
  const [selectedPlan, setSelectedPlan] = useState(currentPlanId ?? "");
  const [notes, setNotes] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedPlan) throw new Error("Select a plan");
      const { error } = await (db as any).rpc("admin_set_tenant_plan", {
        _tenant_id: tenant.id,
        _plan_id: selectedPlan,
        _notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plan changed successfully.");
      setNotes("");
      onOpenChange(false);
      onSuccess();
    },
    onError: (e: any) => toast.error(e.message ?? "Plan change failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> Change Plan — {tenant.name}
          </DialogTitle>
          <DialogDescription>
            Select a new subscription plan. Feature flags will be synced to the new plan automatically. The existing
            subscription will be cancelled and a new active one created.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div>
            <Label className="text-sm">Plan</Label>
            <Select value={selectedPlan} onValueChange={setSelectedPlan}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Select a plan…" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {fmtMoney(p.price_usd)}/mo
                        {p.max_users ? ` · ${p.max_users} users` : " · unlimited users"}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm">Notes (optional)</Label>
            <Textarea
              className="mt-1.5"
              rows={2}
              placeholder="Reason for plan change, upgrade/downgrade notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !selectedPlan || selectedPlan === currentPlanId}
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Change Plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SupportSessionDialog({
  open,
  onOpenChange,
  tenant,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenant: Tenant;
  onSuccess: () => void;
}) {
  const { beginSupportSession, refresh } = usePlatformAuth();
  const [reason, setReason] = useState("");
  const [ttl, setTtl] = useState("120");
  const [isPending, setIsPending] = useState(false);

  const handleStart = async () => {
    if (!reason.trim()) {
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
      toast.error(e.message ?? "Failed to start support session");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogIn className="h-5 w-5 text-amber-500" /> Support Session — {tenant.name}
          </DialogTitle>
          <DialogDescription>
            You will temporarily switch into this tenant's workspace context. All actions during the session are
            recorded in the platform audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div>
            <Label htmlFor="ss-reason" className="text-sm">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="ss-reason"
              className="mt-1.5"
              rows={2}
              placeholder="Customer request, bug investigation, billing support…"
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
                  ["30", "30 minutes"],
                  ["60", "1 hour"],
                  ["120", "2 hours"],
                  ["240", "4 hours"],
                  ["480", "8 hours"],
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
            All actions taken during this session are attributed to you and logged permanently.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleStart}
            disabled={isPending || !reason.trim()}
            className="gap-1.5 bg-amber-500 text-white hover:bg-amber-600"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            Start Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Feature flag toggle ──────────────────────────────────────────────────────

function FeatureToggle({
  tenantId,
  feature,
  enabled,
  onSuccess,
}: {
  tenantId: string;
  feature: string;
  enabled: boolean;
  onSuccess: () => void;
}) {
  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await (db as any).rpc("admin_set_feature_flag", {
        _tenant_id: tenantId,
        _feature: feature,
        _enabled: next,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      onSuccess();
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update feature flag"),
  });
  const meta = FEATURE_META[feature] ?? { label: feature, icon: Zap };
  const Icon = meta.icon;
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors">
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate">{meta.label}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{feature}</span>
      </div>
      <div className="flex items-center gap-2">
        {mutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        <Switch
          checked={enabled}
          onCheckedChange={(v) => mutation.mutate(v)}
          disabled={mutation.isPending}
          aria-label={`Toggle ${meta.label}`}
        />
      </div>
    </div>
  );
}

// ─── Tab contents ─────────────────────────────────────────────────────────────

function OverviewTab({ data, tenant }: { data: DetailPayload; tenant: Tenant }) {
  const sub = data.subscription;
  const health = data.health;
  const totalScore =
    (health.integrity_errors > 0 ? 30 : 0) +
    (health.integrity_warnings > 0 ? 10 : 0) +
    (health.unbalanced_journals > 0 ? 20 : 0) +
    (health.unposted_invoices > 3 ? 10 : 0);
  const healthScore = Math.max(0, 100 - totalScore);

  return (
    <div className="flex flex-col gap-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4">
          <Kpi label="Total Users" value={data.usage.user_count} sub={`${data.usage.active_users_30d} active (30d)`} />
        </Card>
        <Card className="p-4">
          <Kpi
            label="Plan"
            value={sub?.plan_name ?? <span className="text-muted-foreground text-sm">No plan</span>}
            sub={sub ? fmtMoney(sub.price_usd) + "/mo" : undefined}
          />
        </Card>
        <Card className="p-4">
          <Kpi label="Invoices" value={data.usage.invoice_count.toLocaleString()} />
        </Card>
        <Card className="p-4">
          <Kpi label="Journals" value={data.usage.journal_count.toLocaleString()} />
        </Card>
      </div>

      {/* Health overview */}
      <Card className="p-4">
        <SectionHeader icon={ShieldCheck} title="Account Health" />
        <div className="flex items-center gap-4 mb-4">
          <div className="relative h-16 w-16 shrink-0">
            <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
              <circle
                cx="32"
                cy="32"
                r="26"
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                className="text-muted/40"
              />
              <circle
                cx="32"
                cy="32"
                r="26"
                fill="none"
                stroke={healthScore >= 80 ? "#22c55e" : healthScore >= 50 ? "#f59e0b" : "#ef4444"}
                strokeWidth="6"
                strokeDasharray={`${(healthScore / 100) * 163.4} 163.4`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold">{healthScore}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <HealthBadge count={health.integrity_errors} label="integrity errors" variant="error" />
            <HealthBadge count={health.integrity_warnings} label="warnings" variant="warning" />
            <HealthBadge count={health.unbalanced_journals} label="unbalanced journals" variant="error" />
            <HealthBadge count={health.draft_journals} label="draft journals" variant="warning" />
            <HealthBadge count={health.unposted_invoices} label="unposted invoices" variant="warning" />
            {healthScore === 100 && <HealthBadge count={0} label="All checks passing" variant="ok" />}
          </div>
        </div>
      </Card>

      {/* Tenant facts */}
      <Card className="p-4">
        <SectionHeader icon={Building2} title="Tenant Details" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
          {[
            ["ID", <span className="font-mono text-xs">{tenant.id}</span>],
            ["Slug", <span className="font-mono">{tenant.slug}</span>],
            ["Currency", tenant.currency ?? "USD"],
            ["Status", <StatusBadge status={tenant.status} />],
            ["Created", dateFmt(tenant.created_at)],
            ["Updated", dateFmt(tenant.updated_at)],
            ["Sub status", <StatusBadge status={data.subscription?.status} />],
            ["Trial ends", data.subscription?.trial_ends_at ? dateFmt(data.subscription.trial_ends_at) : "—"],
            ["Active sessions", health.active_support_sessions || "0"],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-sm font-medium">{value as React.ReactNode}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Recent platform activity */}
      {data.platform_activity?.length > 0 && (
        <Card className="p-4">
          <SectionHeader icon={Activity} title="Recent Platform Activity" />
          <div className="flex flex-col divide-y">
            {data.platform_activity.slice(0, 8).map((ev) => (
              <div key={ev.id} className="flex items-start gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{ev.action}</span>
                    <span className="text-xs text-muted-foreground">{ev.actor_email}</span>
                  </div>
                  {ev.detail && Object.keys(ev.detail).length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {JSON.stringify(ev.detail).slice(0, 100)}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                  {timeFmt(ev.created_at)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function UsersTab({ users, tenantId }: { users: TenantUser[]; tenantId?: string }) {
  const ROLE_COLORS: Record<string, string> = {
    tenant_admin: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    sales: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
    accounting: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    manufacturing: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    inventory: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
    purchasing: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
    viewer: "bg-muted text-muted-foreground",
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          {users.length} user{users.length !== 1 ? "s" : ""} in this workspace
        </div>
        {tenantId && (
          <Button variant="outline" size="sm" asChild className="h-8 text-xs gap-1.5">
            <Link to="/super-admin/tenants_/$tenantId/users" params={{ tenantId }}>
              <UserCog className="h-3.5 w-3.5 text-primary" />
              Manage Tenant Users
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          </Button>
        )}
      </div>
      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20">
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Email</TableHead>
              <TableHead className="text-xs">Roles</TableHead>
              <TableHead className="text-xs">Joined</TableHead>
              <TableHead className="text-xs">Last Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No users found in this workspace.
                </TableCell>
              </TableRow>
            )}
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium text-sm">{u.full_name ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground font-mono">{u.email}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(u.roles ?? []).map((r) => (
                      <span
                        key={r}
                        className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${ROLE_COLORS[r] ?? ROLE_COLORS.viewer}`}
                      >
                        {r.replace(/_/g, " ")}
                      </span>
                    ))}
                    {(!u.roles || u.roles.length === 0) && (
                      <span className="text-xs text-muted-foreground">No roles</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{dateFmt(u.created_at)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{dateFmt(u.updated_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function SubscriptionTab({ sub, history }: { sub: TenantSubscription | null; history: TenantSubscription[] }) {
  if (!sub) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
        <CreditCard className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No active subscription.</p>
      </div>
    );
  }

  const periodPct = sub.current_period_end
    ? Math.min(
        100,
        Math.max(
          0,
          ((Date.now() - new Date(sub.current_period_start).getTime()) /
            (new Date(sub.current_period_end).getTime() - new Date(sub.current_period_start).getTime())) *
            100,
        ),
      )
    : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Current plan card */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Current Plan</div>
            <div className="text-2xl font-bold">{sub.plan_name}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-sm text-muted-foreground">{sub.plan_code}</span>
              <StatusBadge status={sub.status} />
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">
              {fmtMoney(sub.price_usd)}
              <span className="text-sm font-normal text-muted-foreground">/mo</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{fmtMoney(sub.price_usd * 12)}/yr</div>
          </div>
        </div>
        <Separator className="my-4" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Max Users</div>
            <div className="font-medium">{sub.max_users ?? "Unlimited"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Max Storage</div>
            <div className="font-medium">{sub.max_storage_gb ? `${sub.max_storage_gb} GB` : "Unlimited"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Period Start</div>
            <div className="font-medium">{dateFmt(sub.current_period_start)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Period End</div>
            <div className="font-medium">{dateFmt(sub.current_period_end)}</div>
          </div>
        </div>
        {periodPct !== null && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Billing period</span>
              <span>{Math.round(periodPct)}% elapsed</span>
            </div>
            <Progress value={periodPct} className="h-1.5" />
          </div>
        )}
        {sub.trial_ends_at && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
            <CalendarDays className="h-3.5 w-3.5" />
            Trial ends {dateFmt(sub.trial_ends_at)}
          </div>
        )}
        {sub.notes && (
          <div className="mt-3 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{sub.notes}</div>
        )}
        {sub.external_id && (
          <div className="mt-2 text-xs text-muted-foreground">
            External ID: <span className="font-mono">{sub.external_id}</span>
          </div>
        )}
      </Card>

      {/* Subscription history */}
      {history?.length > 1 && (
        <div>
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" /> Subscription History
          </h4>
          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20">
                  <TableHead className="text-xs">Plan</TableHead>
                  <TableHead className="text-xs">Price</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Created</TableHead>
                  <TableHead className="text-xs">Cancelled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id} className={h.status === "cancelled" ? "opacity-60" : ""}>
                    <TableCell className="font-medium text-sm">{h.plan_name}</TableCell>
                    <TableCell className="font-mono text-sm">{fmtMoney(h.price_usd)}</TableCell>
                    <TableCell>
                      <StatusBadge status={h.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{dateFmt(h.created_at)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{dateFmt(h.cancelled_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  );
}

function UsageTab({
  usage,
  tenantId,
  onSuccess,
  canManageFeatures,
}: {
  usage: DetailPayload["usage"];
  tenantId: string;
  onSuccess: () => void;
  canManageFeatures: boolean;
}) {
  const flags = usage.feature_flags ?? {};
  const allFeatures = Object.keys(FEATURE_META);

  return (
    <div className="flex flex-col gap-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          ["Total Users", usage.user_count, Users],
          ["Active (30d)", usage.active_users_30d, Activity],
          ["Invoices", usage.invoice_count, FileText],
          ["Journal Entries", usage.journal_count, Terminal],
        ].map(([label, value, Icon]: any) => (
          <Card key={label} className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Icon className="h-4 w-4" />
              <span className="text-xs">{label}</span>
            </div>
            <div className="text-2xl font-bold">{Number(value).toLocaleString()}</div>
          </Card>
        ))}
      </div>

      {/* Feature flags */}
      <div>
        <SectionHeader icon={Zap} title="Feature Flags" />
        <div className="flex flex-col gap-2">
          {allFeatures.map((feature) => (
            <FeatureToggle
              key={feature}
              tenantId={tenantId}
              feature={feature}
              enabled={flags[feature] ?? false}
              onSuccess={onSuccess}
            />
          ))}
          {/* Any extra features not in our meta */}
          {Object.entries(flags)
            .filter(([k]) => !FEATURE_META[k])
            .map(([feature, enabled]) => (
              <FeatureToggle
                key={feature}
                tenantId={tenantId}
                feature={feature}
                enabled={enabled}
                onSuccess={onSuccess}
              />
            ))}
        </div>
        {!canManageFeatures && (
          <p className="text-xs text-muted-foreground mt-2">
            You need the <span className="font-mono">platform.features.manage</span> permission to toggle features.
          </p>
        )}
      </div>
    </div>
  );
}

function ActivityTab({ events }: { events: PlatformEvent[] }) {
  const ACTION_COLOR: Record<string, string> = {
    "tenant.active": "text-emerald-600",
    "tenant.suspended": "text-amber-600",
    "tenant.cancelled": "text-destructive",
    "support.session.begin": "text-blue-600",
    "support.session.end": "text-muted-foreground",
    "tenant.plan.changed": "text-violet-600",
    "feature.enabled": "text-emerald-600",
    "feature.disabled": "text-muted-foreground",
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-muted-foreground">
        {events?.length ?? 0} platform events recorded for this tenant
      </div>
      {!events || events.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No platform activity recorded for this tenant yet.
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20">
                <TableHead className="text-xs">Action</TableHead>
                <TableHead className="text-xs">Actor</TableHead>
                <TableHead className="text-xs">Detail</TableHead>
                <TableHead className="text-xs">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((ev) => (
                <TableRow key={ev.id}>
                  <TableCell>
                    <span className={`font-mono text-xs font-semibold ${ACTION_COLOR[ev.action] ?? ""}`}>
                      {ev.action}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div>{ev.actor_email}</div>
                    {ev.actor_role && <div className="text-muted-foreground">{ev.actor_role.replace(/_/g, " ")}</div>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[260px]">
                    <div className="truncate">
                      {ev.detail && Object.keys(ev.detail).length > 0
                        ? Object.entries(ev.detail)
                            .filter(([k]) => !["permission_used"].includes(k))
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" · ")
                            .slice(0, 120)
                        : "—"}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {timeFmt(ev.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function BillingTab({ sub, history }: { sub: TenantSubscription | null; history: TenantSubscription[] }) {
  const mrr = sub?.price_usd ?? 0;
  const arr = mrr * 12;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">MRR</div>
          <div className="text-2xl font-bold">{fmtMoney(mrr)}</div>
          <div className="text-xs text-muted-foreground">Monthly recurring revenue</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">ARR</div>
          <div className="text-2xl font-bold">{fmtMoney(arr)}</div>
          <div className="text-xs text-muted-foreground">Annual recurring revenue</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Status</div>
          <div className="mt-1">
            <StatusBadge status={sub?.status} />
          </div>
          {sub?.cancelled_at && (
            <div className="text-xs text-muted-foreground mt-1">Cancelled {dateFmt(sub.cancelled_at)}</div>
          )}
        </Card>
      </div>

      {sub?.external_id && (
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">External Billing Reference</div>
          <div className="font-mono text-sm">{sub.external_id}</div>
        </Card>
      )}

      <div>
        <h4 className="text-sm font-semibold mb-3">Subscription History</h4>
        {!history || history.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">No subscription history found.</div>
        ) : (
          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20">
                  <TableHead className="text-xs">Plan</TableHead>
                  <TableHead className="text-xs">Price/mo</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Started</TableHead>
                  <TableHead className="text-xs">Ended</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id} className={h.status === "cancelled" ? "opacity-60" : ""}>
                    <TableCell className="font-medium text-sm">{h.plan_name}</TableCell>
                    <TableCell className="font-mono text-sm">{fmtMoney(h.price_usd)}</TableCell>
                    <TableCell>
                      <StatusBadge status={h.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{dateFmt(h.created_at)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{dateFmt(h.cancelled_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}

function HealthTab({ health, tenantId }: { health: HealthData; tenantId: string }) {
  const checks = [
    {
      label: "Integrity Errors",
      value: health.integrity_errors,
      desc: "Accounting integrity findings marked as errors",
      severity: health.integrity_errors > 0 ? "error" : "ok",
      icon: Shield,
    },
    {
      label: "Integrity Warnings",
      value: health.integrity_warnings,
      desc: "Accounting integrity findings marked as warnings",
      severity: health.integrity_warnings > 0 ? "warning" : "ok",
      icon: AlertTriangle,
    },
    {
      label: "Unbalanced Journals",
      value: health.unbalanced_journals,
      desc: "Posted journal entries where debit ≠ credit",
      severity: health.unbalanced_journals > 0 ? "error" : "ok",
      icon: XCircle,
    },
    {
      label: "Draft Journals",
      value: health.draft_journals,
      desc: "Journal entries sitting in Draft status",
      severity: health.draft_journals > 5 ? "warning" : "ok",
      icon: FileText,
    },
    {
      label: "Unposted Invoices",
      value: health.unposted_invoices,
      desc: "Invoices not yet posted to the ledger",
      severity: health.unposted_invoices > 5 ? "warning" : "ok",
      icon: FileText,
    },
    {
      label: "Active Support Sessions",
      value: health.active_support_sessions,
      desc: "Open platform support sessions for this tenant",
      severity: health.active_support_sessions > 0 ? "warning" : "ok",
      icon: LogIn,
    },
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      {checks.map((check) => {
        const Icon = check.icon;
        const isOk = check.value === 0 || check.severity === "ok";
        return (
          <Card
            key={check.label}
            className={`p-4 ${
              check.severity === "error" && !isOk
                ? "border-destructive/30 bg-destructive/5"
                : check.severity === "warning" && !isOk
                  ? "border-amber-500/30 bg-amber-500/5"
                  : ""
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center ${
                    isOk
                      ? "bg-success/10 text-success"
                      : check.severity === "error"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-amber-500/10 text-amber-600"
                  }`}
                >
                  {isOk ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <div>
                  <div className="text-sm font-medium">{check.label}</div>
                  <div className="text-xs text-muted-foreground">{check.desc}</div>
                </div>
              </div>
              <div
                className={`text-2xl font-bold tabular-nums ${
                  isOk ? "text-success" : check.severity === "error" ? "text-destructive" : "text-amber-600"
                }`}
              >
                {check.value}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function AuditTab({ events }: { events: BusinessEvent[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-muted-foreground">
        Last {events?.length ?? 0} ERP-level business events for this tenant
      </div>
      {!events || events.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No business events recorded yet.</Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20">
                <TableHead className="text-xs">Action</TableHead>
                <TableHead className="text-xs">Entity</TableHead>
                <TableHead className="text-xs">Actor</TableHead>
                <TableHead className="text-xs">Changes</TableHead>
                <TableHead className="text-xs">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((ev) => (
                <TableRow key={ev.id}>
                  <TableCell>
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{ev.action}</span>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div>{ev.entity_type}</div>
                    <div className="font-mono text-muted-foreground text-[10px]">{ev.entity_id?.slice(0, 8)}…</div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{ev.actor_email ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                    {ev.new_values ? (
                      <span className="truncate block">
                        {Object.entries(ev.new_values)
                          .slice(0, 3)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" · ")
                          .slice(0, 80)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {timeFmt(ev.occurred_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function TenantDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { canPlatform } = usePlatformAuth();

  // Dialog state
  const [showSuspend, setShowSuspend] = useState(false);
  const [showActivate, setShowActivate] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [showSession, setShowSession] = useState(false);

  // ── Fetch full tenant detail ───────────────────────────────────────────
  const {
    data: payload,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<DetailPayload>({
    queryKey: ["super_admin_tenant_detail", id],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (db as any).rpc("get_tenant_detail", {
        _tenant_id: id,
      });
      if (error) throw error;
      return data as DetailPayload;
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["super_admin_tenant_detail", id] });
    qc.invalidateQueries({ queryKey: ["super_admin_tenants"] });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !payload?.tenant) {
    return (
      <div className="p-6 text-sm text-destructive">
        {isError ? (error instanceof Error ? error.message : "Failed to load tenant.") : "Tenant not found."}
      </div>
    );
  }

  const { tenant } = payload;
  const status = tenant.status ?? "active";
  const isActive = ["active", "trial"].includes(status);
  const isSuspended = status === "suspended";
  const isCancelled = status === "cancelled";
  const canSuspend = canPlatform(PLATFORM_PERMISSIONS.tenantsSuspend) && isActive;
  const canActivate = canPlatform(PLATFORM_PERMISSIONS.tenantsActivate) && (isSuspended || isCancelled);
  const canPlan = canPlatform(PLATFORM_PERMISSIONS.plansManage);
  const canSession = canPlatform(PLATFORM_PERMISSIONS.supportImpersonate);
  const canFeatures = canPlatform(PLATFORM_PERMISSIONS.featuresManage);

  return (
    <div className="flex flex-col gap-0 min-h-full">
      {/* ── Sticky header ────────────────────────────────────────────── */}
      <div className="sticky top-14 z-20 bg-background/95 border-b backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-3 px-6 py-3 flex-wrap">
          {/* Back */}
          <Button asChild size="sm" variant="ghost" className="h-8 gap-1 text-xs -ml-2">
            <Link to="/super-admin/tenants">
              <ArrowLeft className="h-3 w-3" /> Tenants
            </Link>
          </Button>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />

          {/* Identity */}
          <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
            <Building2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0">
            <span className="font-semibold text-sm">{tenant.name}</span>
            <span className="ml-2 font-mono text-xs text-muted-foreground">{tenant.slug}</span>
          </div>
          <StatusBadge status={status} />

          {/* Refresh */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 ml-0.5"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>

          {/* Actions */}
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {canPlan && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setShowPlan(true)}>
                <CreditCard className="h-3.5 w-3.5" /> Change Plan
              </Button>
            )}
            {canSuspend && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                onClick={() => setShowSuspend(true)}
              >
                <Lock className="h-3.5 w-3.5" /> Suspend
              </Button>
            )}
            {canActivate && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs border-success/40 text-success hover:bg-success/10"
                onClick={() => setShowActivate(true)}
              >
                <Unlock className="h-3.5 w-3.5" /> Reactivate
              </Button>
            )}
            {canSession && (
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs bg-amber-500 text-white hover:bg-amber-600"
                onClick={() => setShowSession(true)}
              >
                <LogIn className="h-3.5 w-3.5" /> Support Session
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Suspended / cancelled banner ─────────────────────────────── */}
      {isSuspended && (
        <div className="flex items-center gap-2 px-6 py-2.5 bg-amber-500/8 border-b border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-medium">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          This tenant is suspended. The workspace is locked but all data is preserved.
        </div>
      )}
      {isCancelled && (
        <div className="flex items-center gap-2 px-6 py-2.5 bg-destructive/8 border-b border-destructive/20 text-destructive text-xs font-medium">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          This tenant account is cancelled. Data is preserved and the account can be reactivated.
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <div className="p-6 flex-1">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-6 flex-wrap h-auto gap-1">
            {[
              ["overview", "Overview", Building2],
              ["users", "Users", Users],
              ["subscription", "Subscription", CreditCard],
              ["usage", "Usage", Activity],
              ["activity", "Activity", Zap],
              ["billing", "Billing", Wallet],
              ["health", "Health", ShieldCheck],
              ["audit", "Audit", FileText],
            ].map(([value, label, Icon]: any) => (
              <TabsTrigger key={value} value={value} className="gap-1.5 text-xs">
                <Icon className="h-3.5 w-3.5" />
                {label}
                {/* Health indicator dot */}
                {value === "health" &&
                  (payload.health.integrity_errors > 0 || payload.health.unbalanced_journals > 0) && (
                    <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                  )}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab data={payload} tenant={tenant} />
          </TabsContent>

          <TabsContent value="users">
            <UsersTab users={payload.users ?? []} tenantId={tenant.id} />
          </TabsContent>

          <TabsContent value="subscription">
            <SubscriptionTab sub={payload.subscription} history={payload.subscription_history ?? []} />
          </TabsContent>

          <TabsContent value="usage">
            <UsageTab usage={payload.usage} tenantId={id} onSuccess={invalidate} canManageFeatures={canFeatures} />
          </TabsContent>

          <TabsContent value="activity">
            <ActivityTab events={payload.platform_activity ?? []} />
          </TabsContent>

          <TabsContent value="billing">
            <BillingTab sub={payload.subscription} history={payload.subscription_history ?? []} />
          </TabsContent>

          <TabsContent value="health">
            <HealthTab health={payload.health} tenantId={id} />
          </TabsContent>

          <TabsContent value="audit">
            <AuditTab events={payload.business_events ?? []} />
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Action dialogs ────────────────────────────────────────────── */}
      <SuspendDialog open={showSuspend} onOpenChange={setShowSuspend} tenant={tenant} onSuccess={invalidate} />

      <ActivateDialog open={showActivate} onOpenChange={setShowActivate} tenant={tenant} onSuccess={invalidate} />

      <ChangePlanDialog
        open={showPlan}
        onOpenChange={setShowPlan}
        tenant={tenant}
        currentPlanId={payload.subscription?.plan_id}
        plans={payload.available_plans ?? []}
        onSuccess={invalidate}
      />

      <SupportSessionDialog open={showSession} onOpenChange={setShowSession} tenant={tenant} onSuccess={invalidate} />
    </div>
  );
}
