/**
 * Super Admin — Application Error Monitoring
 *
 * Route: /super-admin/monitoring/errors
 *
 * Capabilities:
 *   - Aggregated platform error telemetry with deduplicated frequency counts
 *   - Filter by severity (Critical, Error, Warning, Info) and resolution status
 *   - Search by endpoint, message, code, or affected tenant
 *   - Detailed error trace sheet with stack trace analysis & diagnostic metadata
 *   - Mark errors as resolved with audit-logged resolution notes
 *   - Tenant isolation: Non-super support staff only see diagnostics needed for support
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import {
  fetchErrorLogs,
  resolveErrorLog,
  type ErrorLogItem,
  type ErrorSeverity,
} from "@/lib/observability";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Filter,
  Info,
  RefreshCw,
  Search,
  Terminal,
} from "lucide-react";

export const Route = createFileRoute("/super-admin/monitoring/errors")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.systemView}>
      <ErrorMonitoringPage />
    </PermissionGuard>
  ),
});

export function ErrorMonitoringPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [resolvedFilter, setResolvedFilter] = useState("unresolved"); // 'all' | 'unresolved' | 'resolved'
  const [selectedError, setSelectedError] = useState<ErrorLogItem | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  const {
    data: result = { data: [], total: 0 },
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: [
      "super-admin",
      "error-logs",
      search,
      severityFilter,
      resolvedFilter,
    ],
    queryFn: () =>
      fetchErrorLogs({
        search,
        severity: severityFilter,
        resolved:
          resolvedFilter === "unresolved"
            ? false
            : resolvedFilter === "resolved"
            ? true
            : undefined,
        limit: 100,
      }),
    refetchInterval: 20_000,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ errorId, note }: { errorId: string; note: string }) => {
      return await resolveErrorLog(errorId, note);
    },
    onSuccess: () => {
      toast.success("Error record marked as resolved and logged to platform audit.");
      setSelectedError(null);
      setResolutionNote("");
      queryClient.invalidateQueries({ queryKey: ["super-admin", "error-logs"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Could not resolve error log.");
    },
  });

  // Severity badges
  const getSeverityBadge = (sev: ErrorSeverity) => {
    switch (sev) {
      case "critical":
        return (
          <Badge variant="destructive" className="gap-1 font-mono uppercase text-[10px]">
            <AlertCircle className="h-3 w-3" /> Critical
          </Badge>
        );
      case "error":
        return (
          <Badge className="bg-destructive/15 text-destructive border-destructive/30 gap-1 font-mono uppercase text-[10px]">
            <AlertTriangle className="h-3 w-3" /> Error
          </Badge>
        );
      case "warning":
        return (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 gap-1 font-mono uppercase text-[10px]">
            <AlertTriangle className="h-3 w-3" /> Warning
          </Badge>
        );
      case "info":
        return (
          <Badge variant="secondary" className="gap-1 font-mono uppercase text-[10px]">
            <Info className="h-3 w-3" /> Info
          </Badge>
        );
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const criticalCount = result.data.filter((e) => e.severity === "critical" && !e.resolved).length;
  const errorCount = result.data.filter((e) => e.severity === "error" && !e.resolved).length;

  return (
    <div className="p-6 space-y-6 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
            Application Error Monitoring
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track runtime exceptions, API request failures, and service anomalies across all tenant environments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
            className="gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-border/70">
          <CardContent className="p-4">
            <span className="text-xs text-muted-foreground uppercase font-medium">Unresolved Errors</span>
            <div className="text-2xl font-bold mt-1 text-foreground">
              {result.data.filter((e) => !e.resolved).length}
            </div>
            <span className="text-[11px] text-muted-foreground mt-0.5 block">Active incident reports</span>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="p-4">
            <span className="text-xs text-destructive uppercase font-medium">Critical Errors</span>
            <div className="text-2xl font-bold mt-1 text-destructive">{criticalCount}</div>
            <span className="text-[11px] text-muted-foreground mt-0.5 block">Requires immediate triage</span>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="p-4">
            <span className="text-xs text-amber-600 dark:text-amber-400 uppercase font-medium">Standard Errors</span>
            <div className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">{errorCount}</div>
            <span className="text-[11px] text-muted-foreground mt-0.5 block">Handled runtime exceptions</span>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="p-4">
            <span className="text-xs text-emerald-600 dark:text-emerald-400 uppercase font-medium">Resolved</span>
            <div className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
              {result.data.filter((e) => e.resolved).length}
            </div>
            <span className="text-[11px] text-muted-foreground mt-0.5 block">Closed incidents</span>
          </CardContent>
        </Card>
      </div>

      {/* Filters Bar */}
      <Card className="border-border/70">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by endpoint, error message, tenant, or error code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>
          <div className="flex gap-2.5">
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[140px] text-xs">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>

            <Select value={resolvedFilter} onValueChange={setResolvedFilter}>
              <SelectTrigger className="w-[140px] text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unresolved">Unresolved Only</SelectItem>
                <SelectItem value="resolved">Resolved Only</SelectItem>
                <SelectItem value="all">All Logs</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Errors Table */}
      <Card className="border-border/70 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-[110px]">Severity</TableHead>
                <TableHead className="w-[100px]">Method / Code</TableHead>
                <TableHead>Endpoint & Error Message</TableHead>
                <TableHead className="w-[140px]">Tenant</TableHead>
                <TableHead className="w-[90px] text-center">Frequency</TableHead>
                <TableHead className="w-[130px]">Last Seen</TableHead>
                <TableHead className="w-[100px] text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                    Loading error telemetry...
                  </TableCell>
                </TableRow>
              ) : result.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                    No application errors found matching criteria.
                  </TableCell>
                </TableRow>
              ) : (
                result.data.map((err) => (
                  <TableRow
                    key={err.id}
                    className={`cursor-pointer hover:bg-muted/40 transition-colors ${
                      err.resolved ? "opacity-60 bg-muted/10" : ""
                    }`}
                    onClick={() => setSelectedError(err)}
                  >
                    <TableCell>{getSeverityBadge(err.severity)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-xs font-semibold uppercase text-foreground">
                          {err.method}
                        </span>
                        {err.error_code && (
                          <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[100px]">
                            {err.error_code}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[400px]">
                      <div className="font-mono text-xs font-medium text-foreground truncate">
                        {err.endpoint}
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {err.error_message}
                      </div>
                    </TableCell>
                    <TableCell>
                      {err.tenant_name ? (
                        <span className="text-xs font-medium text-foreground truncate block max-w-[130px]">
                          {err.tenant_name}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Global / System</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="font-mono text-xs">
                        {err.frequency_count}x
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(err.last_seen_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedError(err);
                        }}
                      >
                        Inspect
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Error Details Inspection Sheet */}
      <Sheet open={!!selectedError} onOpenChange={(open) => !open && setSelectedError(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto space-y-5">
          {selectedError && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2">
                  {getSeverityBadge(selectedError.severity)}
                  {selectedError.resolved && (
                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                      Resolved
                    </Badge>
                  )}
                </div>
                <SheetTitle className="text-lg font-mono break-all mt-1">
                  {selectedError.method} {selectedError.endpoint}
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground">
                  First seen: {new Date(selectedError.first_seen_at).toLocaleString()} • Last seen:{" "}
                  {new Date(selectedError.last_seen_at).toLocaleString()}
                </SheetDescription>
              </SheetHeader>

              {/* Meta Grid */}
              <div className="grid grid-cols-2 gap-3 py-3 px-3 rounded-lg bg-muted/40 border text-xs">
                <div>
                  <span className="text-muted-foreground block uppercase text-[10px]">Error Code</span>
                  <span className="font-mono font-semibold text-foreground">
                    {selectedError.error_code || "GENERIC_ERROR"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block uppercase text-[10px]">Frequency</span>
                  <span className="font-mono font-semibold text-foreground">
                    {selectedError.frequency_count} occurrences
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block uppercase text-[10px]">Affected Tenant</span>
                  <span className="font-medium text-foreground">
                    {selectedError.tenant_name || "Platform Global (None)"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block uppercase text-[10px]">Client IP</span>
                  <span className="font-mono text-foreground">
                    {selectedError.client_ip || "Internal RPC / Gateway"}
                  </span>
                </div>
              </div>

              {/* Error Message */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">
                    Error Message
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] px-1.5 text-muted-foreground gap-1"
                    onClick={() => copyToClipboard(selectedError.error_message)}
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                </div>
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 font-mono text-xs break-words">
                  {selectedError.error_message}
                </div>
              </div>

              {/* Stack Trace */}
              {selectedError.stack_trace && (
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                      <Terminal className="h-3.5 w-3.5" /> Stack Trace
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px] px-1.5 text-muted-foreground gap-1"
                      onClick={() => copyToClipboard(selectedError.stack_trace || "")}
                    >
                      <Copy className="h-3 w-3" /> Copy Trace
                    </Button>
                  </div>
                  <pre className="p-3 rounded-lg bg-muted border font-mono text-[11px] text-foreground overflow-x-auto max-h-60 leading-relaxed whitespace-pre-wrap">
                    {selectedError.stack_trace}
                  </pre>
                </div>
              )}

              {/* Resolution Info or Action */}
              {selectedError.resolved ? (
                <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1">
                  <div className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" /> Incident Resolved
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    Resolved at {new Date(selectedError.resolved_at || "").toLocaleString()}
                  </p>
                  {selectedError.resolution_note && (
                    <p className="text-foreground mt-1 bg-background/50 p-2 rounded border">
                      <span className="font-medium">Note:</span> {selectedError.resolution_note}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3 pt-3 border-t">
                  <Label htmlFor="res-note" className="text-xs font-medium">
                    Resolution Note (Recorded in Platform Audit Log)
                  </Label>
                  <Textarea
                    id="res-note"
                    placeholder="Describe how this error was investigated, mitigated, or resolved..."
                    value={resolutionNote}
                    onChange={(e) => setResolutionNote(e.target.value)}
                    rows={2}
                    className="text-xs"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedError(null)}
                    >
                      Close
                    </Button>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                      disabled={resolveMutation.isPending}
                      onClick={() =>
                        resolveMutation.mutate({
                          errorId: selectedError.id,
                          note: resolutionNote,
                        })
                      }
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {resolveMutation.isPending ? "Resolving..." : "Mark as Resolved"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
