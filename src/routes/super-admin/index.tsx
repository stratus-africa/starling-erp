import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS, PLATFORM_ROLE_LABELS } from "@/lib/platform-permissions";
import type { PlatformRole } from "@/lib/platform-permissions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Layers,
  Loader2,
  MinusCircle,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";

// ─── Route ───────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/super-admin/")({
  component: SuperAdminDashboard,
});

function SuperAdminDashboard() {
  return (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.dashboardView}>
      <DashboardContent />
    </PermissionGuard>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtNum = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);

const fmtMoney = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const dateFmt = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

const timeFmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const CHART_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

const tooltipStyle = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 11,
    color: "var(--popover-foreground)",
  },
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  trial: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  suspended: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  past_due: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
};

const ACTION_COLORS: Record<string, string> = {
  "support.session.begin": "text-blue-600 dark:text-blue-400",
  "support.session.end": "text-muted-foreground",
  "tenant.suspended": "text-amber-600 dark:text-amber-400",
  "tenant.active": "text-emerald-600 dark:text-emerald-400",
  "tenant.cancelled": "text-destructive",
  "admin.access.granted": "text-violet-600 dark:text-violet-400",
  "admin.access.revoked": "text-destructive",
  "tenant.plan.changed": "text-blue-600 dark:text-blue-400",
  "feature.enabled": "text-emerald-600 dark:text-emerald-400",
  "feature.disabled": "text-amber-600 dark:text-amber-400",
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────

function DashboardContent() {
  const { adminProfile, canPlatform } = usePlatformAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  const {
    data: stats,
    isLoading,
    error,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["platform_dashboard_stats", refreshKey],
    staleTime: 120_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_platform_dashboard_stats");
      if (error) throw error;
      return data as Record<string, any>;
    },
  });

  const roleLabel = adminProfile?.platformRole
    ? (PLATFORM_ROLE_LABELS[adminProfile.platformRole as PlatformRole] ?? adminProfile.platformRole)
    : "Platform Admin";

  // Tenant growth chart data
  const growthData = useMemo(
    () =>
      (stats?.tenant_growth ?? []) as Array<{
        month: string;
        month_iso: string;
        new_tenants: number;
        cumulative: number;
      }>,
    [stats?.tenant_growth],
  );

  // Subscription distribution for pie chart
  const planDistribution = useMemo(
    () =>
      (stats?.billing?.by_plan ?? []) as Array<{
        plan: string;
        code: string;
        count: number;
        mrr: number;
      }>,
    [stats?.billing?.by_plan],
  );

  const totalTenants = stats?.tenants?.total ?? 0;
  const activeTenants = stats?.tenants?.active ?? 0;
  const trialTenants = stats?.tenants?.trial ?? 0;
  const suspTenants = stats?.tenants?.suspended ?? 0;
  const cancTenants = stats?.tenants?.cancelled ?? 0;
  const newThisMonth = stats?.tenants?.new_this_month ?? 0;
  const newLastMonth = stats?.tenants?.new_last_month ?? 0;
  const totalUsers = stats?.users?.total ?? 0;
  const activeUsers = stats?.users?.active ?? 0;
  const newUsersMonth = stats?.users?.new_this_month ?? 0;
  const mrr = stats?.billing?.mrr ?? 0;
  const arr = stats?.billing?.arr ?? 0;
  const revMonth = stats?.billing?.revenue_this_month ?? 0;
  const revLastMonth = stats?.billing?.revenue_last_month ?? 0;
  const failedPay = stats?.billing?.failed_payments ?? 0;

  const mrrDelta = revLastMonth > 0 ? ((revMonth - revLastMonth) / revLastMonth) * 100 : 0;
  const growthDelta = newLastMonth > 0 ? ((newThisMonth - newLastMonth) / newLastMonth) * 100 : 0;

  if (isLoading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center p-6">
        <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <h3 className="text-sm font-semibold">Failed to load dashboard</h3>
        <p className="text-xs text-muted-foreground max-w-xs">
          {(error as Error).message ?? "An unexpected error occurred."}
        </p>
        <Button size="sm" variant="outline" onClick={() => setRefreshKey((k) => k + 1)}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1600px] mx-auto">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Platform Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back,{" "}
            <span className="font-medium text-foreground">{adminProfile?.fullName?.split(" ")[0] ?? "Admin"}</span>
            {" · "}
            <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-400">
              {roleLabel}
            </Badge>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {dataUpdatedAt > 0 && (
            <span className="text-[11px] text-muted-foreground hidden sm:block">
              Updated {timeFmt(new Date(dataUpdatedAt).toISOString())}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* ── Alert strip ── */}
      <AlertStrip stats={stats} canPlatform={canPlatform} />

      {/* ── Section: Tenants ── */}
      {canPlatform(PLATFORM_PERMISSIONS.tenantsView) && (
        <Section title="Tenants" href="/super-admin/tenants">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard label="Total" value={totalTenants} icon={Building2} />
            <KpiCard label="Active" value={activeTenants} icon={CheckCircle2} color="emerald" />
            <KpiCard label="Trial" value={trialTenants} icon={Clock} color="blue" />
            <KpiCard
              label="Suspended"
              value={suspTenants}
              icon={MinusCircle}
              color={suspTenants > 0 ? "amber" : "default"}
            />
            <KpiCard
              label="Cancelled"
              value={cancTenants}
              icon={AlertCircle}
              color={cancTenants > 0 ? "red" : "default"}
            />
            <KpiCard
              label="New this month"
              value={newThisMonth}
              icon={TrendingUp}
              color="blue"
              delta={growthDelta}
              deltaLabel={`vs ${newLastMonth} last month`}
            />
          </div>
        </Section>
      )}

      {/* ── Section: Users & Billing ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Users */}
        {canPlatform(PLATFORM_PERMISSIONS.usersView) && (
          <Section title="Users" href="/super-admin/users">
            <div className="grid grid-cols-3 gap-3">
              <KpiCard label="Total users" value={totalUsers} icon={Users} />
              <KpiCard label="Active (30d)" value={activeUsers} icon={Activity} color="emerald" />
              <KpiCard label="New this month" value={newUsersMonth} icon={ArrowUpRight} color="blue" />
            </div>
          </Section>
        )}

        {/* Billing KPIs */}
        {canPlatform(PLATFORM_PERMISSIONS.billingView) && (
          <Section title="Billing" href="/super-admin/subscriptions">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard
                label="MRR"
                value={mrr}
                icon={DollarSign}
                format="money"
                color="emerald"
                delta={mrrDelta}
                deltaLabel="vs last month"
              />
              <KpiCard label="ARR" value={arr} icon={TrendingUp} format="money" />
              <KpiCard label="Rev. this month" value={revMonth} icon={CreditCard} format="money" color="blue" />
              <KpiCard
                label="Failed payments"
                value={failedPay}
                icon={AlertCircle}
                color={failedPay > 0 ? "red" : "default"}
              />
            </div>
          </Section>
        )}
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Tenant growth — area chart */}
        {canPlatform(PLATFORM_PERMISSIONS.tenantsView) && growthData.length > 0 && (
          <div className="lg:col-span-2">
            <Section title="Tenant Growth" subtitle="New registrations per month (12 months)">
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={growthData} margin={{ left: -24, right: 4, top: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="newGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="month"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      stroke="var(--muted-foreground)"
                    />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="var(--muted-foreground)" />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(v: number, name: string) => [
                        v,
                        name === "new_tenants" ? "New tenants" : "Cumulative",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="new_tenants"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#newGrad)"
                      name="new_tenants"
                      dot={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="cumulative"
                      stroke="#22c55e"
                      strokeWidth={2}
                      fill="url(#cumGrad)"
                      name="cumulative"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  New per month
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Cumulative
                </span>
              </div>
            </Section>
          </div>
        )}

        {/* Subscription distribution — pie */}
        {canPlatform(PLATFORM_PERMISSIONS.billingView) && planDistribution.length > 0 && (
          <Section title="Subscription Mix" subtitle="Active + trial by plan">
            <div className="h-52 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={planDistribution}
                    dataKey="count"
                    nameKey="plan"
                    innerRadius={52}
                    outerRadius={84}
                    paddingAngle={3}
                    cx="50%"
                    cy="50%"
                  >
                    {planDistribution.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [v + " tenants", name]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 mt-1">
              {planDistribution.map((p, i) => (
                <div key={p.code} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-sm shrink-0"
                      style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span className="font-medium">{p.plan}</span>
                  </span>
                  <span className="flex items-center gap-3 text-muted-foreground tabular-nums">
                    <span>{p.count} tenants</span>
                    <span className="font-medium text-foreground">{fmtMoney(p.mrr)}/mo</span>
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>

      {/* ── Bottom row: Recent tenants + Activity + System ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent tenant registrations */}
        {canPlatform(PLATFORM_PERMISSIONS.tenantsView) && (
          <div className="lg:col-span-2">
            <Section title="Recent Tenant Registrations" href="/super-admin/tenants">
              {!stats?.recent_tenants?.length ? (
                <EmptyState message="No tenants yet." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="pb-2 text-left pr-3">Tenant</th>
                        <th className="pb-2 text-left pr-3">Plan</th>
                        <th className="pb-2 text-left pr-3">Status</th>
                        <th className="pb-2 text-left">Registered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(stats.recent_tenants as any[]).map((t) => (
                        <tr key={t.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                          <td className="py-2 pr-3">
                            <p className="font-medium text-foreground truncate max-w-[160px]">{t.name}</p>
                            <p className="text-muted-foreground font-mono">{t.slug}</p>
                          </td>
                          <td className="py-2 pr-3">
                            <span className="font-medium">
                              {t.plan_name ?? <span className="text-muted-foreground/50">—</span>}
                            </span>
                          </td>
                          <td className="py-2 pr-3">
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[t.status ?? "active"] ?? STATUS_BADGE.active}`}
                            >
                              {t.status ?? "active"}
                            </span>
                          </td>
                          <td className="py-2 text-muted-foreground whitespace-nowrap">{dateFmt(t.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </div>
        )}

        {/* System health + Security */}
        <div className="flex flex-col gap-4">
          {/* System health */}
          {canPlatform(PLATFORM_PERMISSIONS.systemView) && (
            <Section title="System Health" href="/super-admin/system">
              <div className="space-y-2.5">
                <HealthRow
                  label="Stale support sessions"
                  value={stats?.system?.stale_sessions ?? 0}
                  okWhen={0}
                  href="/super-admin/support-sessions"
                />
                <HealthRow
                  label="Tenants without subscription"
                  value={stats?.system?.tenants_no_subscription ?? 0}
                  okWhen={0}
                  href="/super-admin/subscriptions"
                />
                <HealthRow
                  label="GL integrity errors"
                  value={stats?.system?.integrity_errors ?? 0}
                  okWhen={0}
                  severity="error"
                  href="/super-admin/system"
                />
                <HealthRow
                  label="GL integrity warnings"
                  value={stats?.system?.integrity_warnings ?? 0}
                  okWhen={0}
                  severity="warning"
                  href="/super-admin/system"
                />
              </div>
            </Section>
          )}

          {/* Security events */}
          {canPlatform(PLATFORM_PERMISSIONS.securityView) && (
            <Section title="Security Events" href="/super-admin/security-events">
              <div className="space-y-2.5">
                <HealthRow
                  label="Critical (unresolved)"
                  value={stats?.security_events?.unresolved_critical ?? 0}
                  okWhen={0}
                  severity="error"
                  href="/super-admin/security-events"
                />
                <HealthRow
                  label="Errors (unresolved)"
                  value={stats?.security_events?.unresolved_error ?? 0}
                  okWhen={0}
                  severity="error"
                  href="/super-admin/security-events"
                />
                <HealthRow
                  label="Warnings (unresolved)"
                  value={stats?.security_events?.unresolved_warning ?? 0}
                  okWhen={0}
                  severity="warning"
                  href="/super-admin/security-events"
                />
              </div>
            </Section>
          )}
        </div>
      </div>

      {/* ── Recent platform activity ── */}
      {canPlatform(PLATFORM_PERMISSIONS.auditView) && (
        <Section title="Recent Platform Activity" href="/super-admin/audit">
          {!stats?.recent_activity?.length ? (
            <EmptyState message="No platform activity recorded yet." />
          ) : (
            <div className="space-y-0 divide-y">
              {(stats.recent_activity as any[]).map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-start gap-3 py-2.5 hover:bg-muted/20 -mx-1 px-1 rounded transition-colors"
                >
                  <div className="mt-0.5 shrink-0">
                    <Activity className={`h-3.5 w-3.5 ${ACTION_COLORS[ev.action] ?? "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-xs font-medium font-mono ${ACTION_COLORS[ev.action] ?? "text-foreground"}`}
                      >
                        {ev.action}
                      </span>
                      {ev.target_label && (
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                          → {ev.target_label}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {ev.actor_email}
                      {ev.actor_role && <span className="ml-1 opacity-60">({ev.actor_role})</span>}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                    {timeFmt(ev.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

// ─── Alert strip ─────────────────────────────────────────────────────────────

function AlertStrip({ stats, canPlatform }: { stats: any; canPlatform: (p: any) => boolean }) {
  const alerts: Array<{ color: string; message: string; href: string }> = [];

  if (canPlatform(PLATFORM_PERMISSIONS.securityView) && (stats?.security_events?.unresolved_critical ?? 0) > 0) {
    alerts.push({
      color: "destructive",
      message: `${stats.security_events.unresolved_critical} unresolved critical security event${stats.security_events.unresolved_critical !== 1 ? "s" : ""}`,
      href: "/super-admin/security-events",
    });
  }
  if (canPlatform(PLATFORM_PERMISSIONS.billingView) && (stats?.billing?.failed_payments ?? 0) > 0) {
    alerts.push({
      color: "amber",
      message: `${stats.billing.failed_payments} past-due subscription${stats.billing.failed_payments !== 1 ? "s" : ""}`,
      href: "/super-admin/subscriptions",
    });
  }
  if (canPlatform(PLATFORM_PERMISSIONS.tenantsView) && (stats?.tenants?.suspended ?? 0) > 0) {
    alerts.push({
      color: "amber",
      message: `${stats.tenants.suspended} suspended tenant${stats.tenants.suspended !== 1 ? "s" : ""}`,
      href: "/super-admin/tenants",
    });
  }

  if (!alerts.length) return null;

  const colorMap: Record<string, string> = {
    destructive: "bg-destructive/8 border-destructive/20 text-destructive",
    amber: "bg-amber-500/8 border-amber-500/20 text-amber-700 dark:text-amber-300",
  };

  return (
    <div className="flex flex-col gap-2">
      {alerts.map((a, i) => (
        <Link key={i} to={a.href as never}>
          <div
            className={`flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-xs font-medium hover:opacity-80 transition-opacity ${colorMap[a.color] ?? colorMap.amber}`}
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{a.message}</span>
            <ArrowRight className="h-3 w-3 ml-auto shrink-0" />
          </div>
        </Link>
      ))}
    </div>
  );
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  href,
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {href && (
          <Link
            to={href as never}
            className="text-[11px] text-primary hover:underline flex items-center gap-1 shrink-0"
          >
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {children}
    </Card>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  color = "default",
  format = "number",
  delta,
  deltaLabel,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color?: string;
  format?: "number" | "money";
  delta?: number;
  deltaLabel?: string;
}) {
  const colorMap: Record<string, string> = {
    default: "text-foreground",
    emerald: "text-emerald-600 dark:text-emerald-400",
    blue: "text-blue-600 dark:text-blue-400",
    red: "text-red-600 dark:text-red-400",
    amber: "text-amber-600 dark:text-amber-400",
  };
  const bg: Record<string, string> = {
    default: "bg-muted/30",
    emerald: "bg-emerald-500/10",
    blue: "bg-blue-500/10",
    red: "bg-red-500/10",
    amber: "bg-amber-500/10",
  };

  const displayValue = format === "money" ? fmtMoney(value) : fmtNum(value);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground leading-tight">
          {label}
        </span>
        <div className={`h-6 w-6 rounded-md flex items-center justify-center shrink-0 ${bg[color] ?? bg.default}`}>
          <Icon className={`h-3.5 w-3.5 ${colorMap[color]}`} />
        </div>
      </div>
      <p className={`font-mono text-xl font-bold tabular-nums leading-snug ${colorMap[color]}`}>{displayValue}</p>
      {delta !== undefined && (
        <div
          className={`flex items-center gap-1 mt-1.5 text-[11px] ${
            delta > 0
              ? "text-emerald-600 dark:text-emerald-400"
              : delta < 0
                ? "text-red-600 dark:text-red-400"
                : "text-muted-foreground"
          }`}
        >
          {delta > 0 ? <ArrowUpRight className="h-3 w-3" /> : delta < 0 ? <ArrowDownRight className="h-3 w-3" /> : null}
          <span>{Math.abs(delta).toFixed(1)}%</span>
          {deltaLabel && <span className="text-muted-foreground text-[10px]"> {deltaLabel}</span>}
        </div>
      )}
    </Card>
  );
}

// ─── Health row ───────────────────────────────────────────────────────────────

function HealthRow({
  label,
  value,
  okWhen = 0,
  severity = "warning",
  href,
}: {
  label: string;
  value: number;
  okWhen?: number;
  severity?: "warning" | "error";
  href?: string;
}) {
  const isOk = value <= okWhen;
  const content = (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`flex items-center gap-1 font-semibold tabular-nums ${
          isOk
            ? "text-emerald-600 dark:text-emerald-400"
            : severity === "error"
              ? "text-destructive"
              : "text-amber-600 dark:text-amber-400"
        }`}
      >
        {isOk ? (
          <CheckCircle2 className="h-3 w-3" />
        ) : severity === "error" ? (
          <AlertCircle className="h-3 w-3" />
        ) : (
          <AlertTriangle className="h-3 w-3" />
        )}
        {isOk ? "OK" : value}
      </span>
    </div>
  );

  return href && !isOk ? (
    <Link to={href as never} className="block hover:opacity-80 transition-opacity">
      {content}
    </Link>
  ) : (
    content
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
      <Server className="h-6 w-6 text-muted-foreground/30" />
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6 animate-pulse">
      <div className="h-8 w-64 bg-muted rounded" />
      <div className="grid grid-cols-3 gap-4 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 bg-muted rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="h-40 bg-muted rounded-xl" />
        <div className="h-40 bg-muted rounded-xl" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 h-64 bg-muted rounded-xl" />
        <div className="h-64 bg-muted rounded-xl" />
      </div>
      <div className="h-48 bg-muted rounded-xl" />
      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading platform data…
      </div>
    </div>
  );
}
