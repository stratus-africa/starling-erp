import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Check,
  X,
  Clock,
  User,
  ShieldCheck,
  FileText,
  Loader2,
  Inbox,
  Eye,
  AlertCircle,
} from "lucide-react";
import {
  getMyApprovalInbox,
  actOnApprovalRequest,
  ENTITY_TYPE_CONFIG,
  type ApprovalInboxItem,
} from "@/lib/approval-workflow";
import { ApprovalAuditDialog } from "./approval-audit-dialog";
import { formatDistanceToNow } from "date-fns";

interface ApprovalInboxTabProps {
  canApprove: boolean;
  canReject: boolean;
  currency?: string;
}

export function ApprovalInboxTab({
  canApprove,
  canReject,
  currency = "KES",
}: ApprovalInboxTabProps) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);

  const {
    data: inboxItems = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["my_approval_inbox"],
    queryFn: getMyApprovalInbox,
  });

  const actionMutation = useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string;
      action: "approve" | "reject";
    }) => {
      const note = notes[id]?.trim() || undefined;
      return await actOnApprovalRequest(id, action, note);
    },
    onSuccess: (_data, vars) => {
      toast.success(
        vars.action === "approve"
          ? "Request approved successfully"
          : "Request rejected"
      );
      // Clear note
      setNotes((prev) => {
        const next = { ...prev };
        delete next[vars.id];
        return next;
      });
      refetch();
      qc.invalidateQueries({ queryKey: ["approval_requests"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Action failed");
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading your pending approvals…</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="p-6 flex items-center gap-3 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold text-sm">Failed to load approval inbox</p>
            <p className="text-xs opacity-90">{(error as Error).message}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (inboxItems.length === 0) {
    return (
      <Card className="border-dashed bg-muted/20">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-base">Inbox Clear</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              You have no pending documents requiring your sign-off right now. Enjoy your day!
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">Awaiting Your Action</h2>
          <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 font-bold">
            {inboxItems.length}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          Review and submit your approval decision for each item below
        </span>
      </div>

      <div className="grid gap-4">
        {inboxItems.map((item) => {
          const cfg = ENTITY_TYPE_CONFIG[item.entity_type];
          const isPendingAction = actionMutation.isPending && actionMutation.variables?.id === item.id;

          return (
            <Card
              key={item.id}
              className="border-border hover:border-primary/40 transition-colors shadow-xs"
            >
              <CardHeader className="pb-3 pt-4 px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold leading-tight">
                        {item.workflow_name}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[11px] font-normal">
                          {cfg?.label || item.entity_type}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Stage {item.current_step}: {item.step_name}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {item.amount != null && (
                      <div className="text-right">
                        <span className="text-[11px] text-muted-foreground block">Amount</span>
                        <span className="text-base font-bold font-mono text-foreground">
                          {currency} {Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedAuditId(item.id)}
                      className="gap-1 text-xs h-8"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View Audit
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="px-5 pb-4 pt-1 space-y-3 border-t bg-muted/10">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Submitted by:</span>
                    <span className="font-medium text-foreground">
                      {item.requested_by_name || "Workspace Member"}
                    </span>
                  </div>

                  <div>
                    Submitted {formatDistanceToNow(new Date(item.submitted_at), { addSuffix: true })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Textarea
                    placeholder="Optional review note or rationale for approval/rejection..."
                    value={notes[item.id] ?? ""}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                    rows={2}
                    className="text-xs resize-none bg-card"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-1">
                  {canReject && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => actionMutation.mutate({ id: item.id, action: "reject" })}
                      disabled={isPendingAction}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 text-xs gap-1.5 border-destructive/30"
                    >
                      {isPendingAction && actionMutation.variables?.action === "reject" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                      Reject
                    </Button>
                  )}

                  {canApprove && (
                    <Button
                      size="sm"
                      onClick={() => actionMutation.mutate({ id: item.id, action: "approve" })}
                      disabled={isPendingAction}
                      className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                    >
                      {isPendingAction && actionMutation.variables?.action === "approve" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      Approve & Advance
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ApprovalAuditDialog
        open={!!selectedAuditId}
        onOpenChange={(open) => !open && setSelectedAuditId(null)}
        requestId={selectedAuditId}
        currency={currency}
      />
    </div>
  );
}
