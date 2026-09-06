/**
 * Super Admin — Background Jobs Monitoring
 *
 * Route: /super-admin/monitoring/jobs
 *
 * Capabilities:
 *   - Monitor platform-wide asynchronous background job queues
 *   - Status tracking: Pending, Running, Completed, Failed, Retrying, Cancelled
 *   - Retry failed jobs with automatic retry count increment & audit logging
 *   - Cancel stuck or unnecessary pending/running jobs with audit logging
 *   - Deep payload & error message inspection modal
 *   - Queue distribution & worker execution duration profiling
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PermissionGuard } from "@/components/super-admin/permission-guard";
import { PLATFORM_PERMISSIONS } from "@/lib/platform-permissions";
import {
  fetchBackgroundJobs,
  retryBackgroundJob,
  cancelBackgroundJob,
  type BackgroundJobItem,
  type JobStatus,
} from "@/lib/observability";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock,
  Code,
  Copy,
  Layers,
  Loader,
  Play,
  RefreshCw,
  RotateCw,
  Search,
  Server,
  StopCircle,
} from "lucide-react";

export const Route = createFileRoute("/super-admin/monitoring/jobs")({
  component: () => (
    <PermissionGuard permission={PLATFORM_PERMISSIONS.systemView}>
      <BackgroundJobsPage />
    </PermissionGuard>
  ),
});

export function BackgroundJobsPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [queueFilter, setQueueFilter] = useState("all");
  const [selectedJob, setSelectedJob] = useState<BackgroundJobItem | null>(null);

  const {
    data: result = { data: [], total: 0 },
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ["super-admin", "background-jobs", search, statusFilter, queueFilter],
    queryFn: () =>
      fetchBackgroundJobs({
        search,
        status: statusFilter,
        queue: queueFilter,
        limit: 100,
      }),
    refetchInterval: 15_000,
  });

  const retryMutation = useMutation({
    mutationFn: async (jobId: string) => {
      return await retryBackgroundJob(jobId);
    },
    onSuccess: () => {
      toast.success("Background task status reset to pending and dispatched for execution.");
      setSelectedJob(null);
      queryClient.invalidateQueries({ queryKey: ["super-admin", "background-jobs"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to retry job.");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (jobId: string) => {
      return await cancelBackgroundJob(jobId);
    },
    onSuccess: () => {
      toast.success("Task execution cancelled and recorded in audit log.");
      setSelectedJob(null);
      queryClient.invalidateQueries({ queryKey: ["super-admin", "background-jobs"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to cancel job.");
    },
  });

  const getStatusBadge = (status: JobStatus) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1">
            <Clock className="h-3 w-3" /> Pending
          </Badge>
        );
      case "running":
        return (
          <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 gap-1">
            <Loader className="h-3 w-3 animate-spin" /> Running
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1">
            <CheckCircle2 className="h-3 w-3" /> Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" /> Failed
          </Badge>
        );
      case "retrying":
        return (
          <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30 gap-1">
            <RotateCw className="h-3 w-3 animate-spin" /> Retrying
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="secondary" className="gap-1 text-muted-foreground">
            <Ban className="h-3 w-3" /> Cancelled
          </Badge>
        );
    }
  };

  const copyJson = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    toast.success("Payload copied to clipboard");
  };

  const pendingCount = result.data.filter((j) => j.status === "pending").length;
  const runningCount = result.data.filter((j) => j.status === "running").length;
  const completedCount = result.data.filter((j) => j.status === "completed").length;
  const failedCount = result.data.filter((j) => j.status === "failed").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Server className="h-6 w-6 text-primary" />
            Background Job Queues
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor worker pipeline, task latency, scheduled crons, and retry execution failures.
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
            <span className="text-xs text-amber-600 dark:text-amber-400 uppercase font-medium">Pending</span>
            <div className="text-2xl font-bold mt-1 text-foreground">{pendingCount}</div>
            <span className="text-[11px] text-muted-foreground mt-0.5 block">Waiting in worker queue</span>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="p-4">
            <span className="text-xs text-blue-600 dark:text-blue-400 uppercase font-medium">Running</span>
            <div className="text-2xl font-bold mt-1 text-blue-600 dark:text-blue-400 flex items-center gap-2">
              {runningCount}
              {runningCount > 0 && <span className="h-2 w-2 rounded-full bg-blue-500 animate-ping" />}
            </div>
            <span className="text-[11px] text-muted-foreground mt-0.5 block">Currently executing</span>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="p-4">
            <span className="text-xs text-destructive uppercase font-medium">Failed</span>
            <div className="text-2xl font-bold mt-1 text-destructive">{failedCount}</div>
            <span className="text-[11px] text-muted-foreground mt-0.5 block">Exceeded retry attempts</span>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="p-4">
            <span className="text-xs text-emerald-600 dark:text-emerald-400 uppercase font-medium">Completed</span>
            <div className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">{completedCount}</div>
            <span className="text-[11px] text-muted-foreground mt-0.5 block">Successfully processed</span>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-border/70">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by job name, queue, tenant, or error message..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>
          <div className="flex gap-2.5">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <Select value={queueFilter} onValueChange={setQueueFilter}>
              <SelectTrigger className="w-[140px] text-xs">
                <SelectValue placeholder="Queue" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Queues</SelectItem>
                <SelectItem value="default">default</SelectItem>
                <SelectItem value="billing">billing</SelectItem>
                <SelectItem value="reconciliation">reconciliation</SelectItem>
                <SelectItem value="notifications">notifications</SelectItem>
                <SelectItem value="maintenance">maintenance</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Jobs Table */}
      <Card className="border-border/70 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead>Job Name</TableHead>
                <TableHead className="w-[130px]">Queue</TableHead>
                <TableHead className="w-[110px] text-center">Retries</TableHead>
                <TableHead className="w-[110px] text-right">Duration</TableHead>
                <TableHead className="w-[150px]">Created / Started</TableHead>
                <TableHead className="w-[140px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                    Loading background job queues...
                  </TableCell>
                </TableRow>
              ) : result.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                    No background jobs found matching criteria.
                  </TableCell>
                </TableRow>
              ) : (
                result.data.map((job) => (
                  <TableRow
                    key={job.id}
                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => setSelectedJob(job)}
                  >
                    <TableCell>{getStatusBadge(job.status)}</TableCell>
                    <TableCell>
                      <div className="font-mono text-xs font-semibold text-foreground">
                        {job.job_name}
                      </div>
                      {job.error_message && (
                        <div className="text-xs text-destructive truncate max-w-[320px] mt-0.5">
                          {job.error_message}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {job.queue_name}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-mono text-xs text-muted-foreground">
                        {job.retry_count} / {job.max_retries}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {job.duration_ms !== null ? `${job.duration_ms} ms` : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(job.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        {job.status === "failed" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2 gap-1 text-primary hover:text-primary"
                            disabled={retryMutation.isPending}
                            onClick={() => retryMutation.mutate(job.id)}
                          >
                            <RotateCw className="h-3 w-3" /> Retry
                          </Button>
                        )}
                        {(job.status === "pending" || job.status === "running") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2 gap-1 text-destructive hover:text-destructive"
                            disabled={cancelMutation.isPending}
                            onClick={() => cancelMutation.mutate(job.id)}
                          >
                            <StopCircle className="h-3 w-3" /> Cancel
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() => setSelectedJob(job)}
                        >
                          Payload
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Job Details & Payload Modal */}
      <Dialog open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)}>
        <DialogContent className="sm:max-w-lg">
          {selectedJob && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  {getStatusBadge(selectedJob.status)}
                  <Badge variant="outline" className="font-mono text-xs">
                    Queue: {selectedJob.queue_name}
                  </Badge>
                </div>
                <DialogTitle className="font-mono text-base mt-2">{selectedJob.job_name}</DialogTitle>
                <DialogDescription className="text-xs">
                  ID: {selectedJob.id}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 my-2 text-xs">
                {/* Meta stats */}
                <div className="grid grid-cols-2 gap-3 py-2 px-3 rounded-lg bg-muted/40 border">
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase">Retries</span>
                    <span className="font-mono font-semibold text-foreground">
                      {selectedJob.retry_count} of {selectedJob.max_retries} max
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase">Execution Duration</span>
                    <span className="font-mono font-semibold text-foreground">
                      {selectedJob.duration_ms !== null ? `${selectedJob.duration_ms} ms` : "In Progress / N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase">Scheduled At</span>
                    <span className="text-foreground">
                      {new Date(selectedJob.scheduled_at).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase">Completed At</span>
                    <span className="text-foreground">
                      {selectedJob.completed_at ? new Date(selectedJob.completed_at).toLocaleString() : "—"}
                    </span>
                  </div>
                </div>

                {/* Error message if any */}
                {selectedJob.error_message && (
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-destructive uppercase">Execution Failure</span>
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive font-mono text-xs">
                      {selectedJob.error_message}
                    </div>
                  </div>
                )}

                {/* Payload JSON */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                      <Code className="h-3.5 w-3.5" /> Job Parameters (Payload)
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px] px-1.5 gap-1 text-muted-foreground"
                      onClick={() => copyJson(selectedJob.payload)}
                    >
                      <Copy className="h-3 w-3" /> Copy
                    </Button>
                  </div>
                  <pre className="p-3 rounded-lg bg-muted border font-mono text-[11px] text-foreground overflow-x-auto max-h-52 whitespace-pre-wrap">
                    {JSON.stringify(selectedJob.payload || {}, null, 2)}
                  </pre>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                {selectedJob.status === "failed" && (
                  <Button
                    size="sm"
                    className="gap-1.5 bg-primary text-primary-foreground"
                    disabled={retryMutation.isPending}
                    onClick={() => retryMutation.mutate(selectedJob.id)}
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    {retryMutation.isPending ? "Retrying..." : "Retry Execution"}
                  </Button>
                )}
                {(selectedJob.status === "pending" || selectedJob.status === "running") && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1.5"
                    disabled={cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate(selectedJob.id)}
                  >
                    <StopCircle className="h-3.5 w-3.5" />
                    {cancelMutation.isPending ? "Cancelling..." : "Cancel Job"}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setSelectedJob(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
