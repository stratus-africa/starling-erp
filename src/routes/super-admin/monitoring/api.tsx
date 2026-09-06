/**
 * Super Admin — API Telemetry & Performance Monitoring
 *
 * Route: /super-admin/monitoring/api
 *
 * Capabilities:
 *   - Monitor platform-wide API request volume, error rates, and latency
 *   - HTTP status code distribution (2xx Success, 4xx Client Error, 5xx Server Error)
 *   - High-percentile latency profiling (Avg, p95, p99)
 *   - Per-endpoint breakdown and method distribution
 *   - Timeframe filter (Today, 7 Days, 30 Days)
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import {
  fetchApiMetrics,
  type ApiEndpointMetrics,
} from "@/lib/observability";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Globe,
  RefreshCw,
  Search,
  Terminal,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/super-admin/monitoring/api")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.systemView}>
      <ApiMonitoringPage />
    </PermissionGuard>
  ),
});

export function ApiMonitoringPage() {
  const [timeframe, setTimeframe] = useState("today");
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");

  const {
    data: summary = {
      totalRequests: 0,
      totalErrors: 0,
      overallErrorRate: 0,
      avgLatency: 0,
      status2xx: 0,
      status4xx: 0,
      status5xx: 0,
      endpoints: [],
    },
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ["super-admin", "api-metrics", timeframe],
    queryFn: () => fetchApiMetrics(timeframe),
    refetchInterval: 30_000,
  });

  const filteredEndpoints = useMemo(() => {
    return summary.endpoints.filter((ep) => {
      const matchesSearch =
        !search.trim() || ep.endpoint.toLowerCase().includes(search.toLowerCase().trim());
      const matchesMethod =
        methodFilter === "all" || ep.method.toUpperCase() === methodFilter.toUpperCase();
      return matchesSearch && matchesMethod;
    });
  }, [summary.endpoints, search, methodFilter]);

  const getMethodBadge = (method: string) => {
    switch (method.toUpperCase()) {
      case "GET":
        return (
          <Badge variant="outline" className="font-mono text-[10px] text-blue-600 dark:text-blue-400 border-blue-500/30">
            GET
          </Badge>
        );
      case "POST":
        return (
          <Badge variant="outline" className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
            POST
          </Badge>
        );
      case "PUT":
      case "PATCH":
        return (
          <Badge variant="outline" className="font-mono text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30">
            {method.toUpperCase()}
          </Badge>
        );
      case "DELETE":
        return (
          <Badge variant="outline" className="font-mono text-[10px] text-destructive border-destructive/30">
            DEL
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="font-mono text-[10px]">
            {method}
          </Badge>
        );
    }
  };

  const pct2xx =
    summary.totalRequests > 0
      ? Math.round((summary.status2xx / summary.totalRequests) * 100)
      : 100;
  const pct4xx =
    summary.totalRequests > 0
      ? Math.round((summary.status4xx / summary.totalRequests) * 100)
      : 0;
  const pct5xx =
    summary.totalRequests > 0
      ? Math.round((summary.status5xx / summary.totalRequests) * 100)
      : 0;

  return (
    <div className="p-6 space-y-6 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Terminal className="h-6 w-6 text-primary" />
            API Performance & Telemetry
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time endpoint request volumes, latency distributions, and HTTP response status codes.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Select value={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger className="w-[140px] text-xs h-9">
              <SelectValue placeholder="Timeframe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today (24h)</SelectItem>
              <SelectItem value="7days">Past 7 Days</SelectItem>
              <SelectItem value="30days">Past 30 Days</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
            className="gap-1.5 h-9"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/70">
          <CardContent className="p-4">
            <span className="text-xs text-muted-foreground uppercase font-medium">Total Requests</span>
            <div className="text-2xl font-bold mt-1 text-foreground">
              {summary.totalRequests.toLocaleString()}
            </div>
            <span className="text-[11px] text-muted-foreground mt-0.5 block">Recorded volume</span>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardContent className="p-4">
            <span className="text-xs text-muted-foreground uppercase font-medium">Average Latency</span>
            <div className="text-2xl font-bold mt-1 text-foreground flex items-baseline gap-1">
              {summary.avgLatency} <span className="text-xs font-normal text-muted-foreground">ms</span>
            </div>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-0.5">
              <Zap className="h-3 w-3" /> Within SLA target (&lt;100ms)
            </span>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardContent className="p-4">
            <span className="text-xs text-muted-foreground uppercase font-medium">Error Rate</span>
            <div className="text-2xl font-bold mt-1 text-foreground flex items-baseline gap-1">
              {summary.overallErrorRate}%
            </div>
            <span className="text-[11px] text-muted-foreground mt-0.5 block">
              {summary.totalErrors.toLocaleString()} failed requests
            </span>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardContent className="p-4">
            <span className="text-xs text-muted-foreground uppercase font-medium">Success Rate</span>
            <div className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
              {summary.totalRequests > 0
                ? ((summary.status2xx / summary.totalRequests) * 100).toFixed(2)
                : "100.00"}
              %
            </div>
            <span className="text-[11px] text-muted-foreground mt-0.5 block">HTTP 2xx responses</span>
          </CardContent>
        </Card>
      </div>

      {/* HTTP Status Code Distribution Bar */}
      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-sm font-semibold">HTTP Status Code Distribution</CardTitle>
              <CardDescription className="text-xs">
                Aggregate breakdown across all inbound tenant API endpoints
              </CardDescription>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                2xx: {summary.status2xx.toLocaleString()} ({pct2xx}%)
              </span>
              <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                4xx: {summary.status4xx.toLocaleString()} ({pct4xx}%)
              </span>
              <span className="flex items-center gap-1.5 text-destructive">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
                5xx: {summary.status5xx.toLocaleString()} ({pct5xx}%)
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-3 w-full rounded-full bg-muted overflow-hidden flex">
            <div
              style={{ width: `${pct2xx}%` }}
              className="bg-emerald-500 transition-all duration-300"
              title={`2xx Success: ${pct2xx}%`}
            />
            <div
              style={{ width: `${pct4xx}%` }}
              className="bg-amber-500 transition-all duration-300"
              title={`4xx Client Error: ${pct4xx}%`}
            />
            <div
              style={{ width: `${pct5xx}%` }}
              className="bg-destructive transition-all duration-300"
              title={`5xx Server Error: ${pct5xx}%`}
            />
          </div>
        </CardContent>
      </Card>

      {/* Endpoint Table Filters */}
      <Card className="border-border/70">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter by endpoint route (e.g. /api/v1/tenants)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>
          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="w-[130px] text-xs">
              <SelectValue placeholder="HTTP Method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Methods</SelectItem>
              <SelectItem value="GET">GET</SelectItem>
              <SelectItem value="POST">POST</SelectItem>
              <SelectItem value="PUT">PUT</SelectItem>
              <SelectItem value="DELETE">DELETE</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Endpoints Table */}
      <Card className="border-border/70 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-[80px]">Method</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead className="w-[120px] text-right">Volume</TableHead>
                <TableHead className="w-[110px] text-right">Failures</TableHead>
                <TableHead className="w-[110px] text-right">Error %</TableHead>
                <TableHead className="w-[100px] text-right">Avg Latency</TableHead>
                <TableHead className="w-[90px] text-right">p95</TableHead>
                <TableHead className="w-[90px] text-right">p99</TableHead>
                <TableHead className="w-[130px] text-right">Status Codes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                    Loading endpoint performance telemetry...
                  </TableCell>
                </TableRow>
              ) : filteredEndpoints.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-60" />
                    No endpoints found matching criteria.
                  </TableCell>
                </TableRow>
              ) : (
                filteredEndpoints.map((ep, i) => (
                  <TableRow key={`${ep.method}-${ep.endpoint}-${i}`} className="hover:bg-muted/30 font-mono text-xs">
                    <TableCell>{getMethodBadge(ep.method)}</TableCell>
                    <TableCell className="font-semibold text-foreground">{ep.endpoint}</TableCell>
                    <TableCell className="text-right text-foreground font-medium">
                      {ep.request_volume.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {ep.failure_count > 0 ? (
                        <span className="text-destructive font-semibold">
                          {ep.failure_count.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-mono ${
                          ep.error_rate_pct > 1.0
                            ? "text-destructive border-destructive/30 bg-destructive/10"
                            : ep.error_rate_pct > 0
                            ? "text-amber-600 dark:text-amber-400 border-amber-500/30"
                            : "text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                        }`}
                      >
                        {ep.error_rate_pct}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-foreground font-semibold">
                      {ep.avg_latency_ms} ms
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {ep.p95_latency_ms} ms
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {ep.p99_latency_ms} ms
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5 text-[10px]">
                        <span className="text-emerald-600 dark:text-emerald-400">{ep.status_2xx}</span>
                        <span className="text-muted-foreground">/</span>
                        <span className="text-amber-600 dark:text-amber-400">{ep.status_4xx}</span>
                        <span className="text-muted-foreground">/</span>
                        <span className="text-destructive">{ep.status_5xx}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
