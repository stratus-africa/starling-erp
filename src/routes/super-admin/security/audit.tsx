/**
 * Super Admin — Platform Audit Log
 *
 * Route: /super-admin/security/audit
 *
 * Capabilities:
 *   - Append-only, tamper-proof audit log for all privileged platform actions
 *   - Severity-classified events (Critical, High, Medium, Low, Info)
 *   - Live search and multidimensional filters (Date, Actor, Action, Tenant, Severity)
 *   - Comprehensive Event Inspector Drawer with Before/After Diff visualization
 *   - Correlated Support Session & Network Origin tracking (IP, User-Agent)
 *   - JSON and CSV compliance export
 */

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { db } from "@/lib/typed-db";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ShieldAlert,
  ShieldCheck,
  Shield,
  Activity,
  Search,
  Filter,
  RefreshCw,
  Download,
  Calendar,
  User,
  Building2,
  AlertTriangle,
  Info,
  Clock,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Eye,
  Copy,
  Check,
  Headphones,
  Laptop,
  ArrowRight,
  FileJson,
  FileSpreadsheet,
} from "lucide-react";

export const Route = createFileRoute("/super-admin/security/audit")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.auditView}>
      <PlatformAuditLogPage />
    </PermissionGuard>
  ),
});

interface AuditRecord {
  id: string;
  actor_id: string | null;
  actor_email: string;
  actor_role: string | null;
  action: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  acting_as_tenant_id: string | null;
  tenant_name: string | null;
  support_session_id: string | null;
  detail: Record<string, any>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  total_count: number;
}

interface AuditStats {
  total_events: number;
  events_24h: number;
  critical_events: number;
  high_events: number;
  active_admins_24h: number;
  support_sessions: number;
}

function PlatformAuditLogPage() {
  const navigate = useNavigate();

  // Filters state
  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("all");
  const [datePreset, setDatePreset] = useState("all");
  const [pageSize, setPageSize] = useState("50");
  const [pageIndex, setPageIndex] = useState(0);

  // Selected event for detail drawer
  const [selectedEvent, setSelectedEvent] = useState<AuditRecord | null>(null);
  const [hasCopiedJson, setHasCopiedJson] = useState(false);

  // Calculate date filter range
  const { fromDate, toDate } = useMemo(() => {
    const now = new Date();
    if (datePreset === "24h") {
      const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return { fromDate: from.toISOString(), toDate: now.toISOString() };
    }
    if (datePreset === "7d") {
      const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { fromDate: from.toISOString(), toDate: now.toISOString() };
    }
    if (datePreset === "30d") {
      const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { fromDate: from.toISOString(), toDate: now.toISOString() };
    }
    return { fromDate: null, toDate: null };
  }, [datePreset]);

  // Query: Audit Log Stats
  const { data: stats } = useQuery<AuditStats>({
    queryKey: ["platform_audit_stats"],
    queryFn: async () => {
      const { data, error } = await db.rpc("admin_get_platform_audit_stats");
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      return (
        row || {
          total_events: 0,
          events_24h: 0,
          critical_events: 0,
          high_events: 0,
          active_admins_24h: 0,
          support_sessions: 0,
        }
      );
    },
    refetchInterval: 30000,
  });

  // Query: Tenants for dropdown
  const { data: tenants = [] } = useQuery({
    queryKey: ["tenants_filter_list"],
    queryFn: async () => {
      const { data, error } = await db
        .from("tenants")
        .select("id, name")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Query: Paginated Audit Records
  const limit = parseInt(pageSize, 10) || 50;
  const offset = pageIndex * limit;

  const {
    data: auditRecords = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<AuditRecord[]>({
    queryKey: [
      "platform_audit_list",
      searchTerm,
      severityFilter,
      actionFilter,
      tenantFilter,
      actorFilter,
      fromDate,
      toDate,
      limit,
      offset,
    ],
    queryFn: async () => {
      const { data, error } = await db.rpc("admin_list_platform_audit_logs", {
        _search: searchTerm.trim() || null,
        _severity: severityFilter === "all" ? null : severityFilter,
        _action: actionFilter === "all" ? null : actionFilter,
        _tenant_id: tenantFilter === "all" ? null : tenantFilter,
        _actor_email: actorFilter === "all" ? null : actorFilter,
        _from: fromDate,
        _to: toDate,
        _limit: limit,
        _offset: offset,
      });

      if (error) throw new Error(error.message);
      return (data as any[]) || [];
    },
    refetchInterval: 20000,
  });

  const totalCount = auditRecords.length > 0 ? Number(auditRecords[0].total_count) : 0;
  const totalPages = Math.ceil(totalCount / limit) || 1;

  // Severity Visuals
  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return (
          <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30 flex items-center gap-1 font-semibold">
            <ShieldAlert className="h-3 w-3 animate-pulse" />
            Critical
          </Badge>
        );
      case "high":
        return (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            High
          </Badge>
        );
      case "medium":
        return (
          <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 flex items-center gap-1">
            <Info className="h-3 w-3" />
            Medium
          </Badge>
        );
      case "low":
        return (
          <Badge variant="outline" className="text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700">
            Low
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground border-border">
            Info
          </Badge>
        );
    }
  };

  // Export handlers
  const handleExportJSON = () => {
    if (auditRecords.length === 0) {
      toast.error("No records to export");
      return;
    }
    const blob = new Blob([JSON.stringify(auditRecords, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `platform-audit-log-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Audit log exported as JSON");
  };

  const handleExportCSV = () => {
    if (auditRecords.length === 0) {
      toast.error("No records to export");
      return;
    }
    const headers = [
      "Timestamp",
      "Severity",
      "Actor",
      "Role",
      "Action",
      "Target Type",
      "Target Label",
      "Target ID",
      "Tenant Name",
      "IP Address",
      "Support Session ID",
    ];
    const rows = auditRecords.map((r) => [
      `"${r.created_at}"`,
      `"${r.severity}"`,
      `"${r.actor_email}"`,
      `"${r.actor_role || ""}"`,
      `"${r.action}"`,
      `"${r.target_type || ""}"`,
      `"${(r.target_label || "").replace(/"/g, '""')}"`,
      `"${r.target_id || ""}"`,
      `"${r.tenant_name || ""}"`,
      `"${r.ip_address || ""}"`,
      `"${r.support_session_id || ""}"`,
    ]);
    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `platform-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Audit log exported as CSV");
  };

  const handleCopyJson = () => {
    if (!selectedEvent) return;
    navigator.clipboard.writeText(JSON.stringify(selectedEvent, null, 2));
    setHasCopiedJson(true);
    toast.success("Event JSON copied to clipboard");
    setTimeout(() => setHasCopiedJson(false), 2000);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-primary" />
            Platform Security Audit Log
          </h1>
          <p className="text-sm text-muted-foreground">
            Append-only, immutable security trail capturing privileged operations, access changes, and tenant mutations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="gap-1.5"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            Export CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportJSON}
            className="gap-1.5"
          >
            <FileJson className="h-3.5 w-3.5 text-blue-600" />
            Export JSON
          </Button>
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Platform Events</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.total_events?.toLocaleString() ?? "—"}
            </div>
            <p className="text-xs text-muted-foreground">
              +{stats?.events_24h ?? 0} in the last 24 hours
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical & High Risk</CardTitle>
            <ShieldAlert className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
              {((stats?.critical_events ?? 0) + (stats?.high_events ?? 0)).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.critical_events ?? 0} Critical • {stats?.high_events ?? 0} High
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Admins (24h)</CardTitle>
            <User className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {stats?.active_admins_24h ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">Logged actions recently</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Support Impersonations</CardTitle>
            <Headphones className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {stats?.support_sessions ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">Sessions correlated to audit</p>
          </CardContent>
        </Card>
      </div>

      {/* Advanced Filter Toolbar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search action, actor email, target, details, or IP…"
                className="pl-9 text-xs"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPageIndex(0);
                }}
              />
            </div>

            {/* Date Preset */}
            <div className="w-full md:w-44">
              <Select
                value={datePreset}
                onValueChange={(val) => {
                  setDatePreset(val);
                  setPageIndex(0);
                }}
              >
                <SelectTrigger className="text-xs">
                  <Calendar className="h-3.5 w-3.5 mr-1.5 opacity-60" />
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="24h">Past 24 Hours</SelectItem>
                  <SelectItem value="7d">Past 7 Days</SelectItem>
                  <SelectItem value="30d">Past 30 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Severity Filter */}
            <div className="w-full md:w-40">
              <Select
                value={severityFilter}
                onValueChange={(val) => {
                  setSeverityFilter(val);
                  setPageIndex(0);
                }}
              >
                <SelectTrigger className="text-xs">
                  <Filter className="h-3.5 w-3.5 mr-1.5 opacity-60" />
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50">
            {/* Action Category Filter */}
            <div className="w-full sm:w-48">
              <Select
                value={actionFilter}
                onValueChange={(val) => {
                  setActionFilter(val);
                  setPageIndex(0);
                }}
              >
                <SelectTrigger className="text-xs h-8">
                  <span className="text-muted-foreground mr-1">Action:</span>
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="tenant.suspended">tenant.suspended</SelectItem>
                  <SelectItem value="tenant.active">tenant.active</SelectItem>
                  <SelectItem value="subscription.plan_changed">subscription.plan_changed</SelectItem>
                  <SelectItem value="subscription.suspended">subscription.suspended</SelectItem>
                  <SelectItem value="subscription.cancelled">subscription.cancelled</SelectItem>
                  <SelectItem value="feature_flag.toggled">feature_flag.toggled</SelectItem>
                  <SelectItem value="feature_flag.created">feature_flag.created</SelectItem>
                  <SelectItem value="support.session.begin">support.session.begin</SelectItem>
                  <SelectItem value="support.session.end">support.session.end</SelectItem>
                  <SelectItem value="support.session.revoke">support.session.revoke</SelectItem>
                  <SelectItem value="admin.access.granted">admin.access.granted</SelectItem>
                  <SelectItem value="admin.access.revoked">admin.access.revoked</SelectItem>
                  <SelectItem value="tenant_user.deactivated">tenant_user.deactivated</SelectItem>
                  <SelectItem value="tenant_user.role_changed">tenant_user.role_changed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tenant Filter */}
            <div className="w-full sm:w-52">
              <Select
                value={tenantFilter}
                onValueChange={(val) => {
                  setTenantFilter(val);
                  setPageIndex(0);
                }}
              >
                <SelectTrigger className="text-xs h-8">
                  <Building2 className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                  <SelectValue placeholder="All Tenants" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="all">All Tenants (Global)</SelectItem>
                  {tenants.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reset Filters */}
            {(searchTerm ||
              severityFilter !== "all" ||
              actionFilter !== "all" ||
              tenantFilter !== "all" ||
              datePreset !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground"
                onClick={() => {
                  setSearchTerm("");
                  setSeverityFilter("all");
                  setActionFilter("all");
                  setTenantFilter("all");
                  setDatePreset("all");
                  setPageIndex(0);
                }}
              >
                Reset Filters
              </Button>
            )}

            <div className="ml-auto text-xs text-muted-foreground font-mono">
              {totalCount.toLocaleString()} total events
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Events Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[110px]">Severity</TableHead>
                <TableHead className="w-[170px]">Timestamp</TableHead>
                <TableHead>Actor & IP</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Tenant Context</TableHead>
                <TableHead className="w-[90px] text-right">Inspect</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                    Loading audit events…
                  </TableCell>
                </TableRow>
              ) : auditRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                    <Shield className="h-10 w-10 mx-auto mb-2 opacity-25" />
                    <p className="font-semibold text-foreground">No audit records found</p>
                    <p className="text-xs mt-0.5">Try adjusting your filters or search terms.</p>
                  </TableCell>
                </TableRow>
              ) : (
                auditRecords.map((record) => (
                  <TableRow
                    key={record.id}
                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => setSelectedEvent(record)}
                  >
                    {/* Severity */}
                    <TableCell>{getSeverityBadge(record.severity)}</TableCell>

                    {/* Timestamp */}
                    <TableCell>
                      <div className="flex flex-col text-xs font-mono">
                        <span className="font-medium text-foreground">
                          {new Date(record.created_at).toLocaleDateString()}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(record.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                    </TableCell>

                    {/* Actor */}
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-foreground truncate">
                          {record.actor_email}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {record.actor_role && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                              {record.actor_role}
                            </Badge>
                          )}
                          {record.ip_address && (
                            <span className="text-[10px] font-mono text-muted-foreground/80">
                              {record.ip_address}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Action */}
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold text-primary">
                          {record.action}
                        </span>
                        {record.support_session_id && (
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1 py-0 h-4 bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                            title="Action executed during support impersonation"
                          >
                            <Headphones className="h-2.5 w-2.5 mr-0.5" />
                            Support
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Target */}
                    <TableCell>
                      <div className="flex flex-col text-xs max-w-xs">
                        <span className="font-medium truncate">
                          {record.target_label || record.target_type || "System"}
                        </span>
                        {record.target_id && (
                          <span className="text-[10px] font-mono text-muted-foreground truncate">
                            ID: {record.target_id}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Tenant Context */}
                    <TableCell>
                      {record.tenant_name ? (
                        <div className="flex items-center gap-1 text-xs">
                          <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="font-medium truncate max-w-[140px]">
                            {record.tenant_name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/70 italic">
                          Platform Scope
                        </span>
                      )}
                    </TableCell>

                    {/* Inspect Button */}
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEvent(record);
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination Controls */}
          {totalCount > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Rows per page:</span>
                <Select value={pageSize} onValueChange={(val) => setPageSize(val)}>
                  <SelectTrigger className="h-7 w-16 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground ml-2">
                  Showing {offset + 1}–{Math.min(offset + limit, totalCount)} of {totalCount}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pageIndex === 0}
                  onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                  className="h-7 w-7 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs font-medium px-2">
                  Page {pageIndex + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pageIndex + 1 >= totalPages}
                  onClick={() => setPageIndex((p) => p + 1)}
                  className="h-7 w-7 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Detail Inspector Drawer */}
      <Sheet open={Boolean(selectedEvent)} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {selectedEvent && getSeverityBadge(selectedEvent.severity)}
                <SheetTitle className="font-mono text-base">{selectedEvent?.action}</SheetTitle>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyJson}
                className="h-7 gap-1 text-xs"
              >
                {hasCopiedJson ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                {hasCopiedJson ? "Copied" : "Copy JSON"}
              </Button>
            </div>
            <SheetDescription className="text-xs">
              Logged at {selectedEvent && new Date(selectedEvent.created_at).toLocaleString()} • Event ID:{" "}
              <span className="font-mono">{selectedEvent?.id}</span>
            </SheetDescription>
          </SheetHeader>

          {selectedEvent && (
            <div className="mt-6 space-y-5">
              {/* Reason / Justification Block if present */}
              {selectedEvent.detail?.reason && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5">
                  <div className="text-xs font-semibold text-primary flex items-center gap-1.5 mb-1">
                    <Info className="h-3.5 w-3.5" />
                    Administrative Justification / Reason
                  </div>
                  <p className="text-xs text-foreground font-medium">
                    {selectedEvent.detail.reason}
                  </p>
                </div>
              )}

              {/* Actor & Security Context */}
              <div className="rounded-lg border bg-card p-4 space-y-2.5">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" /> Actor Metadata
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Actor Email:</span>
                    <p className="font-semibold">{selectedEvent.actor_email}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Platform Role:</span>
                    <p className="font-mono">{selectedEvent.actor_role || "system"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Actor User ID:</span>
                    <p className="font-mono text-[11px] truncate">
                      {selectedEvent.actor_id || "System"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Origin IP:</span>
                    <p className="font-mono text-[11px]">{selectedEvent.ip_address || "Internal"}</p>
                  </div>
                </div>
                {selectedEvent.user_agent && (
                  <div className="pt-2 border-t text-[11px]">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Laptop className="h-3 w-3" /> User Agent:
                    </span>
                    <p className="font-mono text-[10px] text-muted-foreground break-all mt-0.5">
                      {selectedEvent.user_agent}
                    </p>
                  </div>
                )}
              </div>

              {/* Target & Tenant Scope */}
              <div className="rounded-lg border bg-card p-4 space-y-2.5">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> Target & Tenant Context
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Target Type:</span>
                    <p className="font-semibold">{selectedEvent.target_type || "Global"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Target Label:</span>
                    <p className="font-semibold">{selectedEvent.target_label || "—"}</p>
                  </div>
                  {selectedEvent.target_id && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Target ID:</span>
                      <p className="font-mono text-[11px]">{selectedEvent.target_id}</p>
                    </div>
                  )}
                  {selectedEvent.acting_as_tenant_id && (
                    <div className="col-span-2 pt-1 border-t">
                      <span className="text-muted-foreground">Associated Tenant:</span>
                      <p className="font-semibold flex items-center gap-1.5 mt-0.5">
                        <Building2 className="h-3.5 w-3.5 text-primary" />
                        {selectedEvent.tenant_name || selectedEvent.acting_as_tenant_id}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Correlated Support Session Link */}
              {selectedEvent.support_session_id && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                      <Headphones className="h-3.5 w-3.5" />
                      Executed During Tenant Support Impersonation
                    </div>
                    <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                      Session ID: {selectedEvent.support_session_id}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-amber-500/30 bg-background"
                    onClick={() => navigate({ to: "/super-admin/support-sessions" })}
                  >
                    View Session
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              )}

              {/* Before / After Diff Inspector (if present) */}
              {(selectedEvent.detail?.before ||
                selectedEvent.detail?.after ||
                selectedEvent.detail?.old_status ||
                selectedEvent.detail?.new_status) && (
                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    State Transition Diff
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded border border-destructive/20 bg-destructive/5 p-2.5 text-xs">
                      <span className="font-semibold text-destructive block mb-1">
                        Before / Old State
                      </span>
                      <pre className="font-mono text-[10px] overflow-auto max-h-36">
                        {JSON.stringify(
                          selectedEvent.detail?.before ||
                            selectedEvent.detail?.old_status ||
                            selectedEvent.detail?.old_plan ||
                            selectedEvent.detail?.previous,
                          null,
                          2
                        )}
                      </pre>
                    </div>

                    <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-xs">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400 block mb-1">
                        After / New State
                      </span>
                      <pre className="font-mono text-[10px] overflow-auto max-h-36">
                        {JSON.stringify(
                          selectedEvent.detail?.after ||
                            selectedEvent.detail?.new_status ||
                            selectedEvent.detail?.new_plan ||
                            selectedEvent.detail?.current,
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              {/* Complete Raw JSON Detail */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Complete Event Detail Payload
                  </Label>
                </div>
                <div className="rounded-lg border bg-muted/60 p-3 overflow-x-auto max-h-72">
                  <pre className="font-mono text-[11px] leading-relaxed text-foreground">
                    {JSON.stringify(selectedEvent.detail, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
