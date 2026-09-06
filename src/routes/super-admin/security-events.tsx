/**
 * Super Admin � Security Events
 * Route: /super-admin/security-events
 *
 * Platform security signals, anomalies, and threat indicators
 * sourced from platform_audit_log (severity >= medium or security action types).
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ShieldAlert, RefreshCw, Loader2, AlertCircle, Search, Filter,
  AlertTriangle, Info, Zap, Activity,
} from "lucide-react";

export const Route = createFileRoute("/super-admin/security-events")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.securityView}>
      <SecurityEventsPage />
    </PermissionGuard>
  ),
});

interface AuditEvent {
  id: string;
  actor_email: string;
  actor_role: string | null;
  action: string;
  target_type: string | null;
  target_label: string | null;
  severity: string;
  detail: Record<string, any>;
  ip_address: string | null;
  created_at: string;
}

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
  high:     "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30",
  medium:   "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  low:      "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  info:     "bg-slate-500/10 text-slate-600 border-slate-500/20",
};

const SEVERITY_ICON: Record<string, any> = {
  critical: ShieldAlert,
  high:     AlertTriangle,
  medium:   Zap,
  low:      Info,
  info:     Activity,
};

const SEVERITIES = ["all", "critical", "high", "medium", "low", "info"];

const timeFmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

function SecurityEventsPage() {
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: stats } = useQuery({
    queryKey: ["platform_audit_stats", refreshKey],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_get_platform_audit_stats");
      if (error) throw error;
      return (data?.[0] ?? data ?? {}) as Record<string, number>;
    },
  });

  const { data: events = [], isLoading, error } = useQuery({
    queryKey: ["platform_security_events", severityFilter, refreshKey],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_list_platform_audit_logs", {
        _limit: 200,
        _severity: severityFilter === "all" ? null : severityFilter,
        _action: null,
        _actor_email: null,
        _tenant_id: null,
        _from: null,
        _to: null,
        _offset: 0,
        _search: null,
      });
      if (error) throw error;
      return (data ?? []) as AuditEvent[];
    },
  });

  const filtered = events.filter((e) => {
    const matchSearch =
      !search ||
      e.actor_email?.toLowerCase().includes(search.toLowerCase()) ||
      e.action.toLowerCase().includes(search.toLowerCase()) ||
      (e.target_label ?? "").toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  const criticalCount = stats?.critical_events ?? events.filter((e) => e.severity === "critical").length;
  const highCount = stats?.high_events ?? events.filter((e) => e.severity === "high").length;
  const mediumCount = events.filter((e) => e.severity === "medium").length;
  const lowCount = events.filter((e) => e.severity === "low").length;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Security Events</h1>
          <p className="text-sm text-muted-foreground">Platform security signals, anomalies, and threat indicators.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["critical", "high", "medium", "low"] as const).map((sev) => {
          const Icon = SEVERITY_ICON[sev];
          const count = sev === "critical" ? criticalCount : sev === "high" ? highCount : sev === "medium" ? mediumCount : lowCount;
          return (
            <Card
              key={sev}
              className={`cursor-pointer transition-colors ${severityFilter === sev ? "ring-2 ring-primary" : ""}`}
              onClick={() => setSeverityFilter(severityFilter === sev ? "all" : sev)}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${SEVERITY_BADGE[sev]}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xl font-bold">{count}</div>
                  <div className="text-xs text-muted-foreground capitalize">{sev}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search actor, action, target..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[160px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEVERITIES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">{s === "all" ? "All Severities" : s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} events</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Severity</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                    <ShieldAlert className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    No security events found.
                  </TableCell>
                </TableRow>
              ) : filtered.map((ev) => {
                const Icon = SEVERITY_ICON[ev.severity] ?? Activity;
                return (
                  <TableRow key={ev.id}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Icon className={`h-4 w-4 ${ev.severity === "critical" ? "text-red-600" : ev.severity === "high" ? "text-orange-600" : ev.severity === "medium" ? "text-amber-600" : "text-muted-foreground"}`} />
                        <Badge variant="outline" className={`text-xs capitalize ${SEVERITY_BADGE[ev.severity] ?? ""}`}>
                          {ev.severity}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{ev.action}</code>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{ev.actor_email}</div>
                      {ev.actor_role && (
                        <div className="text-xs text-muted-foreground">{ev.actor_role}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{ev.target_label ?? "�"}</div>
                      {ev.target_type && (
                        <div className="text-xs text-muted-foreground capitalize">{ev.target_type}</div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {ev.ip_address ?? "�"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {timeFmt(ev.created_at)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
