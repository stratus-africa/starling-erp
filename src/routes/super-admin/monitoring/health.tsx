/**
 * Super Admin — System Health Monitoring
 *
 * Route: /super-admin/monitoring/health
 *
 * Capabilities:
 *   - Live probe across all 7 core platform subsystems:
 *     1. Database (PostgreSQL engine, connection pool, tenant count, real query round-trip latency)
 *     2. Authentication (Supabase Auth, active sessions, MFA enforcement)
 *     3. Storage (Object buckets, volume status)
 *     4. Email (Delivery queue, SMTP / provider status)
 *     5. Payments (Gateway webhooks, settlement state)
 *     6. Background Jobs (Worker count, queue latency, failed job alerts)
 *     7. API (Throughput, p95 latency, error rates)
 *   - On-demand single-component and platform-wide latency ping probes
 *   - Incident history and status banners
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import {
  fetchSystemHealth,
  pingComponent,
  type SystemComponent,
  type SystemHealthItem,
  type SystemStatus,
} from "@/lib/observability";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  Globe,
  KeyRound,
  Layers,
  Mail,
  RefreshCw,
  Server,
  ShieldCheck,
  Wallet,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/super-admin/monitoring/health")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.systemView}>
      <SystemHealthPage />
    </PermissionGuard>
  ),
});

// Component icon & human-readable label mapping
const COMPONENT_META: Record<
  SystemComponent,
  { label: string; description: string; icon: React.ElementType }
> = {
  database: {
    label: "PostgreSQL Database",
    description: "Primary relational storage, multi-tenant schemas & connection pooling",
    icon: Database,
  },
  authentication: {
    label: "Authentication & Identity",
    description: "Supabase Auth, session lifecycle, JWT issuance & MFA verification",
    icon: KeyRound,
  },
  storage: {
    label: "Cloud Object Storage",
    description: "Secure multi-tenant document attachments, invoices & exports",
    icon: Layers,
  },
  email: {
    label: "Transactional Email",
    description: "SMTP dispatch, notification templates & tenant invitations",
    icon: Mail,
  },
  payments: {
    label: "Payment Infrastructure",
    description: "Stripe Connect webhooks, subscription billing & payout processing",
    icon: Wallet,
  },
  background_jobs: {
    label: "Background Job Workers",
    description: "Asynchronous task workers, accounting reconciliation & scheduled cron",
    icon: Server,
  },
  api: {
    label: "Core Edge API",
    description: "REST & RPC gateway, request rate-limiting & tenant routing",
    icon: Globe,
  },
};

export function SystemHealthPage() {
  const queryClient = useQueryClient();
  const [pingingComponent, setPingingComponent] = useState<string | null>(null);

  const {
    data: healthItems = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ["super-admin", "system-health"],
    queryFn: fetchSystemHealth,
    refetchInterval: 30_000, // auto-refresh every 30s
  });

  const pingMutation = useMutation({
    mutationFn: async (component: SystemComponent) => {
      setPingingComponent(component);
      return await pingComponent(component);
    },
    onSuccess: (res) => {
      toast.success(`Probe Succeeded: ${COMPONENT_META[res.component as SystemComponent]?.label || res.component} responded in ${res.latency_ms} ms.`);
      queryClient.invalidateQueries({ queryKey: ["super-admin", "system-health"] });
    },
    onError: (err: any) => {
      toast.error(`Probe Failed: ${err.message || "Failed to reach subsystem component."}`);
    },
    onSettled: () => {
      setPingingComponent(null);
    },
  });

  // Calculate platform aggregates
  const totalSubsystems = healthItems.length || 7;
  const operationalCount = healthItems.filter((i) => i.status === "operational").length;
  const degradedCount = healthItems.filter((i) => i.status === "degraded").length;
  const outageCount = healthItems.filter((i) => i.status === "outage").length;
  const isAllOperational = outageCount === 0 && degradedCount === 0;

  const getStatusBadge = (status: SystemStatus) => {
    switch (status) {
      case "operational":
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1">
            <CheckCircle2 className="h-3 w-3" /> Operational
          </Badge>
        );
      case "degraded":
        return (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 gap-1">
            <AlertCircle className="h-3 w-3" /> Degraded
          </Badge>
        );
      case "outage":
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" /> Outage
          </Badge>
        );
      case "maintenance":
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" /> Maintenance
          </Badge>
        );
    }
  };

  return (
    <div className="p-6 space-y-6 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            System Health Monitoring
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live telemetry and operational status across all core NimbusERP platform infrastructure.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
            className="gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh Telemetry
          </Button>
        </div>
      </div>

      {/* Global Status Banner */}
      <Card
        className={`border ${
          isAllOperational
            ? "border-emerald-500/30 bg-emerald-500/5"
            : outageCount > 0
            ? "border-destructive/40 bg-destructive/5"
            : "border-amber-500/40 bg-amber-500/5"
        }`}
      >
        <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                isAllOperational
                  ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  : outageCount > 0
                  ? "bg-destructive/20 text-destructive"
                  : "bg-amber-500/20 text-amber-600 dark:text-amber-400"
              }`}
            >
              {isAllOperational ? (
                <ShieldCheck className="h-5 w-5" />
              ) : (
                <AlertCircle className="h-5 w-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground text-base">
                  {isAllOperational
                    ? "All Core Subsystems Operational"
                    : outageCount > 0
                    ? `System Alert: ${outageCount} Service Outage Detected`
                    : `System Notice: ${degradedCount} Subsystem Performance Degraded`}
                </span>
                <span className="inline-block h-2 w-2 rounded-full animate-pulse bg-emerald-500" />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Continuously monitored with real-time heartbeat queries. Last verified{" "}
                {new Date().toLocaleTimeString()}.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <div className="text-center px-3 py-1.5 rounded-md bg-background/60 border">
              <span className="text-muted-foreground block text-[10px] uppercase">Services</span>
              <span className="text-foreground font-semibold">{totalSubsystems}</span>
            </div>
            <div className="text-center px-3 py-1.5 rounded-md bg-background/60 border">
              <span className="text-emerald-600 dark:text-emerald-400 block text-[10px] uppercase">
                Healthy
              </span>
              <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                {operationalCount}
              </span>
            </div>
            {degradedCount > 0 && (
              <div className="text-center px-3 py-1.5 rounded-md bg-background/60 border">
                <span className="text-amber-600 dark:text-amber-400 block text-[10px] uppercase">
                  Degraded
                </span>
                <span className="text-amber-700 dark:text-amber-400 font-semibold">
                  {degradedCount}
                </span>
              </div>
            )}
            {outageCount > 0 && (
              <div className="text-center px-3 py-1.5 rounded-md bg-background/60 border">
                <span className="text-destructive block text-[10px] uppercase">Outage</span>
                <span className="text-destructive font-semibold">{outageCount}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Grid of 7 Subsystems */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {healthItems.map((item) => {
          const meta = COMPONENT_META[item.component] || {
            label: item.component,
            description: "Platform system component",
            icon: Activity,
          };
          const Icon = meta.icon;
          const isPinging = pingingComponent === item.component;

          return (
            <Card
              key={item.component}
              className="flex flex-col justify-between hover:shadow-md transition-all duration-200 border-border/80"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold leading-tight">
                        {meta.label}
                      </CardTitle>
                      <CardDescription className="text-xs line-clamp-1 mt-0.5">
                        {meta.description}
                      </CardDescription>
                    </div>
                  </div>
                  {getStatusBadge(item.status)}
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-1 flex-1 flex flex-col justify-between">
                <div className="space-y-3 text-xs">
                  {/* Latency & Uptime */}
                  <div className="grid grid-cols-2 gap-3 py-2 px-3 rounded-lg bg-muted/40 border">
                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase">
                        Round-Trip Latency
                      </span>
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {item.latency_ms !== null ? `${item.latency_ms} ms` : "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase">
                        30-Day Uptime
                      </span>
                      <span className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        {item.uptime_pct}%
                      </span>
                    </div>
                  </div>

                  {/* Uptime bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>Availability Target</span>
                      <span className="font-medium text-foreground">{item.uptime_pct}%</span>
                    </div>
                    <Progress value={item.uptime_pct} className="h-1.5" />
                  </div>

                  {/* Telemetry Metrics specific to component */}
                  {item.metrics && Object.keys(item.metrics).length > 0 && (
                    <div className="rounded-lg bg-muted/20 border p-2.5 space-y-1 text-[11px]">
                      <div className="font-medium text-muted-foreground mb-1 text-[10px] uppercase tracking-wider">
                        Live Subsystem Telemetry
                      </div>
                      {Object.entries(item.metrics).map(([key, val]) => (
                        <div key={key} className="flex justify-between items-center py-0.5">
                          <span className="text-muted-foreground capitalize">
                            {key.replace(/_/g, " ")}:
                          </span>
                          <span className="font-mono font-medium text-foreground">
                            {typeof val === "object" ? JSON.stringify(val) : String(val)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {item.incident_message && (
                    <div className="p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs flex items-start gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>{item.incident_message}</span>
                    </div>
                  )}
                </div>

                {/* Card footer action */}
                <div className="pt-3 border-t mt-3 flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    Checked {new Date(item.last_checked_at).toLocaleTimeString()}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs px-2.5 gap-1"
                    disabled={isPinging}
                    onClick={() => pingMutation.mutate(item.component)}
                  >
                    <Zap className={`h-3 w-3 ${isPinging ? "animate-spin text-primary" : ""}`} />
                    {isPinging ? "Probing..." : "Probe Ping"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
