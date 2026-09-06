/**
 * Super Admin � Billing Dashboard
 *
 * Route: /super-admin/billing
 *
 * KPI cards: MRR, ARR, Active/Trialing/Past Due counts
 * Uses existing tenant_subscriptions / billing_plans tables via get_platform_dashboard_stats RPC.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  DollarSign, TrendingUp, Users, AlertTriangle, CreditCard,
  RefreshCw, Loader2, AlertCircle, ArrowUpRight, ArrowDownRight,
  CheckCircle2, Clock, XCircle,
} from "lucide-react";

export const Route = createFileRoute("/super-admin/billing/")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.billingView}>
      <BillingDashboard />
    </PermissionGuard>
  ),
});

const fmtMoney = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtK = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(1)}K` : `$${n}`;

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

const tooltipStyle = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 11,
    color: "var(--popover-foreground)",
  },
};

function DeltaBadge({ current, last }: { current: number; last: number }) {
  if (last <= 0) return null;
  const pct = ((current - last) / last) * 100;
  const up = pct >= 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${up ? "text-emerald-600" : "text-red-500"}`}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function BillingDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: stats, isLoading, error } = useQuery({
    queryKey: ["platform_dashboard_stats", refreshKey],
    staleTime: 120_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_platform_dashboard_stats");
      if (error) throw error;
      return data as Record<string, any>;
    },
  });

  const mrr = stats?.billing?.mrr ?? 0;
  const arr = stats?.billing?.arr ?? 0;
  const revMonth = stats?.billing?.revenue_this_month ?? 0;
  const revLastMonth = stats?.billing?.revenue_last_month ?? 0;
  const failedPay = stats?.billing?.failed_payments ?? 0;
  const activeTenants = stats?.tenants?.active ?? 0;
  const trialTenants = stats?.tenants?.trial ?? 0;
  const suspTenants = stats?.tenants?.suspended ?? 0;

  const growthData = useMemo(
    () => (stats?.tenant_growth ?? []) as Array<{ month: string; month_iso: string; new_tenants: number; cumulative: number }>,
    [stats?.tenant_growth],
  );

  const planDistribution = useMemo(
    () => (stats?.billing?.by_plan ?? []) as Array<{ plan: string; code: string; count: number; mrr: number }>,
    [stats?.billing?.by_plan],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center p-6">
        <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <h3 className="text-sm font-semibold">Failed to load billing data</h3>
        <p className="text-xs text-muted-foreground max-w-xs">{(error as Error).message}</p>
        <Button size="sm" variant="outline" onClick={() => setRefreshKey((k) => k + 1)}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing Dashboard</h1>
          <p className="text-sm text-muted-foreground">Platform revenue, subscriptions, and financial health.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/super-admin/invoices">
            <Button variant="outline" size="sm"><CreditCard className="h-4 w-4 mr-1.5" />Invoices</Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">MRR</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold">{fmtK(mrr)}</div>
            <DeltaBadge current={revMonth} last={revLastMonth} />
            <p className="text-xs text-muted-foreground mt-1">Monthly Recurring Revenue</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">ARR</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold">{fmtK(arr)}</div>
            <p className="text-xs text-muted-foreground mt-1">Annual Recurring Revenue</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active / Trial</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold">{activeTenants}</div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-700 border-blue-500/20">{trialTenants} trial</Badge>
              <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-700 border-amber-500/20">{suspTenants} suspended</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Failed Payments</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className={`text-2xl font-bold ${failedPay > 0 ? "text-destructive" : "text-emerald-600"}`}>{failedPay}</div>
            <p className="text-xs text-muted-foreground mt-1">Past-due subscriptions</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Tenant Growth</CardTitle>
            <CardDescription className="text-xs">New tenants per month</CardDescription>
          </CardHeader>
          <CardContent>
            {growthData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={growthData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTenants" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <Tooltip {...tooltipStyle} />
                  <Area type="monotone" dataKey="new_tenants" stroke="#3b82f6" fill="url(#colorTenants)" name="New Tenants" />
                  <Area type="monotone" dataKey="cumulative" stroke="#22c55e" fill="none" strokeDasharray="4 2" name="Cumulative" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">No growth data yet.</div>
            )}
          </CardContent>
        </Card>

        {/* Plan distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Plan Distribution</CardTitle>
            <CardDescription className="text-xs">Active subscriptions by plan</CardDescription>
          </CardHeader>
          <CardContent>
            {planDistribution.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={planDistribution} cx="50%" cy="50%" innerRadius={48} outerRadius={72} dataKey="count" paddingAngle={2}>
                      {planDistribution.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipStyle} formatter={(v: any, name: string) => [v, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2">
                  {planDistribution.map((p, i) => (
                    <div key={p.code} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        <span>{p.plan}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{p.count}</span>
                        <span className="font-medium">{fmtK(p.mrr)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">No subscription data.</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Manage Plans", desc: "Configure pricing tiers", to: "/super-admin/billing/plans", icon: CreditCard },
          { label: "Subscriptions", desc: "All tenant subscriptions", to: "/super-admin/billing/subscriptions", icon: CheckCircle2 },
          { label: "Invoices", desc: "Platform billing documents", to: "/super-admin/invoices", icon: Clock },
        ].map((item) => (
          <Link key={item.to} to={item.to}>
            <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.desc}</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
