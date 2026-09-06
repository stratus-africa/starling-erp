import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { toast } from "sonner";
import {
  Loader2,
  Eye,
  Ban,
  FileText,
  User,
  Filter,
  Search,
} from "lucide-react";
import {
  getAllApprovalRequests,
  cancelApprovalRequest,
  ENTITY_TYPE_CONFIG,
} from "@/lib/approval-workflow";
import type { ApprovalRequest } from "@/lib/db-types";
import { ApprovalStatusBadge } from "./approval-status-badge";
import { ApprovalAuditDialog } from "./approval-audit-dialog";
import { format } from "date-fns";

interface ApprovalHistoryTabProps {
  canManage: boolean;
  currency?: string;
}

export function ApprovalHistoryTab({
  canManage,
  currency = "KES",
}: ApprovalHistoryTabProps) {
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [requestToCancel, setRequestToCancel] = useState<ApprovalRequest | null>(null);

  const {
    data: requests = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["approval_history_requests", statusFilter, entityFilter],
    queryFn: () =>
      getAllApprovalRequests({
        status: statusFilter,
        entityType: entityFilter,
        limit: 100,
      }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (requestId: string) => {
      await cancelApprovalRequest(requestId, "Cancelled from management console");
    },
    onSuccess: () => {
      toast.success("Approval request cancelled");
      setRequestToCancel(null);
      refetch();
      qc.invalidateQueries({ queryKey: ["my_approval_inbox"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to cancel request");
    },
  });

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            Filters:
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Document Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Document Types</SelectItem>
              {Object.entries(ENTITY_TYPE_CONFIG).map(([type, cfg]) => (
                <SelectItem key={type} value={type}>
                  {cfg.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <span className="text-xs text-muted-foreground">
          Showing {requests.length} record{requests.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Requests Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground space-y-2">
              <FileText className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">No approval requests found</p>
              <p className="text-xs text-muted-foreground">
                Try modifying your status or document type filters above.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead>Workflow / Rule</TableHead>
                  <TableHead>Document Type</TableHead>
                  <TableHead>Submitted By</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Submitted At</TableHead>
                  <TableHead className="text-right w-28">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => {
                  const cfg = ENTITY_TYPE_CONFIG[r.entity_type];

                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <ApprovalStatusBadge status={r.status} currentStep={r.current_step} />
                      </TableCell>

                      <TableCell>
                        <span className="font-medium text-sm leading-tight block">
                          {r.workflow_name || "Workflow"}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground truncate block max-w-xs">
                          ID: {r.id.substring(0, 8)}…
                        </span>
                      </TableCell>

                      <TableCell>
                        <Badge variant="secondary" className="font-normal text-xs">
                          {cfg?.label || r.entity_type}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span>{r.requested_by_name || "User"}</span>
                        </div>
                      </TableCell>

                      <TableCell className="text-right font-mono text-xs font-semibold">
                        {r.amount != null
                          ? `${currency} ${Number(r.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                          : "—"}
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(r.submitted_at), "dd MMM yyyy, HH:mm")}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedAuditId(r.id)}
                            className="h-8 w-8 p-0"
                            title="View complete audit trail"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>

                          {r.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRequestToCancel(r)}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Cancel pending request"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ApprovalAuditDialog
        open={!!selectedAuditId}
        onOpenChange={(open) => !open && setSelectedAuditId(null)}
        requestId={selectedAuditId}
        currency={currency}
      />

      <AlertDialog
        open={!!requestToCancel}
        onOpenChange={(open) => !open && setRequestToCancel(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Approval Request?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the approval request for &quot;{requestToCancel?.workflow_name}&quot; as cancelled.
              The associated document can then be revised or resubmitted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Active</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => requestToCancel && cancelMutation.mutate(requestToCancel.id)}
              disabled={cancelMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancel Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
