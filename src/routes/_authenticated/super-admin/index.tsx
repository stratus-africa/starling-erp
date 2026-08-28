import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS, PLATFORM_ROLE_LABELS } from "@/lib/platform-permissions";
import type { PlatformRole } from "@/lib/platform-permissions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Activity, AlertTriangle, ArrowRight, Building2,
  CheckCircle2, CreditCard, Layers, Loader2,
  ShieldCheck, Users,
} from "lucide-react";

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

function DashboardContent() {
  const { adminProfile, canPlatform } = usePlatformAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["platform_dashboard_stats"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_platform_dashboard_stats");
      if (error) throw error;
      return data as Record<string, any>;
    },
  });

  const roleLabel = adminProfile?.platformRole
    ? (PLATFORM_ROLE_LABELS[adminProfile.platformRole as PlatformRole] ?? adminProfile.platformRole)
    : "Platform Admin";

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Platform Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome back, {adminProfile?.fullName?.split(" ")[0] ?? "Admin"}.
          {" "}You are signed in as{" "}
          <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-400">
            {roleLabel}
          </Badge>
        </p>
      </div>

      {/* KPI row */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading platform stats…
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard icon={Building2} label="Total Tenants"     value={stats?.tenants?.total ?? 0}    href="/super-admin/tenants"      show={canPlatform(PLATFORM_PERMISSIONS.tenantsView)} />
          <StatCard icon={Building2} label="Active Tenants"    value={stats?.tenants?.active ?? 0}   href="/super-admin/tenants"      show={canPlatform(PLATFORM_PERMISSIONS.tenantsView)} color="emerald" />
          <StatCard icon={Users}     label="Platform Users"    value={stats?.users?.total ?? 0}      href="/super-admin/users"        show={canPlatform(PLATFORM_PERMISSIONS.usersView)} />
          <StatCard icon={CreditCard}label="Active Subs"       value={stats?.subscriptions?.active ?? 0} href="/super-admin/subscriptions" show={canPlatform(PLATFORM_PERMISSIONS.billingView)} color="blue" />
          <StatCard icon={Activity}  label="Active Sessions"   value={stats?.support_sessions?.active ?? 0} href="/super-admin/support-sessions" show={canPlatform(PLATFORM_PERMISSIONS.supportView)} />
          <StatCard icon={ShieldCheck}label="Platform Admins"  value={stats?.platform_admins?.total ?? 0} href="/super-admin/admins"    show={canPlatform(PLATFORM_PERMISSIONS.adminsView)} />
        </div>
      )}

      {/* Alerts row */}
      {stats && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Suspended tenants */}
          {canPlatform(PLATFORM_PERMISSIONS.tenantsView) && stats?.tenants?.suspended > 0 && (
            <AlertCard
              icon={AlertTriangle}
              color="amber"
              title={`${stats.tenants.suspended} suspended tenant${stats.tenants.suspended !== 1 ? "s" : ""}`}
              description="These tenants cannot access the application."
              href="/super-admin/tenants"
            />
          )}
          {/* Critical security events */}
          {canPlatform(PLATFORM_PERMISSIONS.securityView) && stats?.security_events?.unresolved_critical > 0 && (
            <AlertCard
              icon={AlertTriangle}
              color="red"
              title={`${stats.security_events.unresolved_critical} unresolved critical security event${stats.security_events.unresolved_critical !== 1 ? "s" : ""}`}
              description="Immediate attention required."
              href="/super-admin/security-events"
            />
          )}
          {/* New tenants */}
          {canPlatform(PLATFORM_PERMISSIONS.tenantsView) && stats?.tenants?.new_30d > 0 && (
            <AlertCard
              icon={CheckCircle2}
              color="emerald"
              title={`${stats.tenants.new_30d} new tenant${stats.tenants.new_30d !== 1 ? "s" : ""} in the last 30 days`}
              description="Platform is growing."
              href="/super-admin/tenants"
            />
          )}
        </div>
      )}

      {/* Subscriptions by plan */}
      {canPlatform(PLATFORM_PERMISSIONS.billingView) && stats?.subscriptions?.by_plan && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Subscriptions by Plan</h3>
            <Link to="/super-admin/subscriptions" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex flex-wrap gap-3">
            {Object.entries(stats.subscriptions.by_plan as Record<string, number>).map(([plan, count]) => (
              <div key={plan} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{plan}</span>
                <Badge variant="secondary" className="text-xs">{count}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Quick navigation */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Quick Access</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {[
            { label: "Manage Tenants",     href: "/super-admin/tenants",    icon: Building2,   show: canPlatform(PLATFORM_PERMISSIONS.tenantsView) },
            { label: "View Users",         href: "/super-admin/users",      icon: Users,       show: canPlatform(PLATFORM_PERMISSIONS.usersView) },
            { label: "Audit Log",          href: "/super-admin/audit",      icon: Activity,    show: canPlatform(PLATFORM_PERMISSIONS.auditView) },
            { label: "Security Events",    href: "/super-admin/security-events", icon: ShieldCheck, show: canPlatform(PLATFORM_PERMISSIONS.securityView) },
          ].filter((q) => q.show).map((q) => (
            <Link key={q.href} to={q.href as never}
              className="flex items-center gap-2.5 rounded-lg border bg-card p-3.5 text-sm font-medium hover:bg-muted/50 transition-colors">
              <q.icon className="h-4 w-4 text-muted-foreground" />
              {q.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, href, show, color = "default" }: {
  icon: React.ElementType; label: string; value: number;
  href: string; show: boolean; color?: string;
}) {
  if (!show) return null;
  const colorMap: Record<string, string> = {
    default: "text-foreground",
    emerald: "text-emerald-600 dark:text-emerald-400",
    blue:    "text-blue-600 dark:text-blue-400",
    red:     "text-red-600 dark:text-red-400",
    amber:   "text-amber-600 dark:text-amber-400",
  };
  return (
    <Link to={href as never}>
      <Card className="p-4 hover:border-primary/30 transition-colors cursor-pointer">
        <div className="flex items-start justify-between mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className={`font-mono text-2xl font-bold tabular-nums ${colorMap[color]}`}>{value.toLocaleString()}</p>
      </Card>
    </Link>
  );
}

function AlertCard({ icon: Icon, color, title, description, href }: {
  icon: React.ElementType; color: string; title: string; description: string; href: string;
}) {
  const cfg: Record<string, string> = {
    emerald: "bg-emerald-500/8 border-emerald-500/20 text-emerald-700 dark:text-emerald-300",
    amber:   "bg-amber-500/8  border-amber-500/20  text-amber-700 dark:text-amber-300",
    red:     "bg-destructive/8 border-destructive/20 text-destructive",
  };
  return (
    <Link to={href as never}>
      <div className={`flex items-start gap-3 rounded-lg border p-4 transition-opacity hover:opacity-80 ${cfg[color]}`}>
        <Icon className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs mt-0.5 opacity-70">{description}</p>
        </div>
      </div>
    </Link>
  );
}
