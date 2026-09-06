import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, Clock, CheckCircle2, XCircle, Ban, ArrowRight, User } from "lucide-react";
import { getApprovalRequestAudit, ENTITY_TYPE_CONFIG } from "@/lib/approval-workflow";
import { ApprovalStatusBadge } from "./approval-status-badge";
import { format } from "date-fns";

interface ApprovalAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string | null;
  currency?: string;
}

export function ApprovalAuditDialog({
  open,
  onOpenChange,
  requestId,
  currency = "KES",
}: ApprovalAuditDialogProps) {
  const { data: audit, isLoading } = useQuery({
    queryKey: ["approval_request_audit", requestId],
    enabled: !!requestId && open,
    queryFn: async () => {
      if (!requestId) return null;
      return await getApprovalRequestAudit(requestId);
    },
  });

  if (!requestId) return null;

  const entityConfig = audit?.entity_type ? ENTITY_TYPE_CONFIG[audit.entity_type] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <DialogTitle>Approval Audit Trail</DialogTitle>
          </div>
          <DialogDescription>
            Complete verifiable log of request submission, sequential reviews, and final resolution.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1 py-2 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !audit ? (
            <div className="text-center p-8 text-sm text-muted-foreground">
              Audit trail details could not be loaded.
            </div>
          ) : (
            <>
              {/* Header Summary Card */}
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-base">{audit.workflow_name}</span>
                      <ApprovalStatusBadge status={audit.status} currentStep={audit.current_step} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Document Type:{" "}
                      <span className="font-medium text-foreground">
                        {entityConfig?.label || audit.entity_type}
                      </span>{" "}
                      · Ref: <span className="font-mono text-xs">{audit.entity_id}</span>
                    </p>
                  </div>

                  {audit.amount != null && (
                    <div className="text-right">
                      <span className="text-xs text-muted-foreground block">Document Total</span>
                      <span className="text-lg font-bold text-foreground font-mono">
                        {currency} {Number(audit.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t text-xs">
                  <div>
                    <span className="text-muted-foreground block">Submitted By</span>
                    <span className="font-medium flex items-center gap-1 mt-0.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      {audit.requested_by_name}
                    </span>
                  </div>

                  <div>
                    <span className="text-muted-foreground block">Submitted Date</span>
                    <span className="font-medium mt-0.5 block">
                      {format(new Date(audit.submitted_at), "dd MMM yyyy, HH:mm")}
                    </span>
                  </div>

                  <div>
                    <span className="text-muted-foreground block">Resolution Date</span>
                    <span className="font-medium mt-0.5 block">
                      {audit.completed_at
                        ? format(new Date(audit.completed_at), "dd MMM yyyy, HH:mm")
                        : "In Progress"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Step Sequence Visualizer */}
              <div className="space-y-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Workflow Review Stages
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {(audit.workflow_steps || []).map((step) => {
                    const isCurrent = audit.status === "pending" && audit.current_step === step.step_order;
                    const isPassed =
                      audit.current_step > step.step_order ||
                      audit.status === "approved";
                    const isRejectedHere =
                      audit.status === "rejected" && audit.current_step === step.step_order;

                    return (
                      <div
                        key={step.id}
                        className={`rounded-lg border p-3 text-xs relative ${
                          isCurrent
                            ? "border-amber-500/50 bg-amber-500/5 ring-1 ring-amber-500/30"
                            : isPassed
                            ? "border-emerald-500/40 bg-emerald-500/5"
                            : isRejectedHere
                            ? "border-rose-500/40 bg-rose-500/5"
                            : "border-border bg-card/60 opacity-60"
                        }`}
                      >
                        <div className="flex items-center justify-between font-semibold mb-1">
                          <span>Stage {step.step_order}</span>
                          {isPassed && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                          {isCurrent && <Clock className="h-3.5 w-3.5 text-amber-600 animate-pulse" />}
                          {isRejectedHere && <XCircle className="h-3.5 w-3.5 text-rose-600" />}
                        </div>
                        <p className="font-medium text-foreground truncate">{step.name}</p>
                        <p className="text-muted-foreground text-[11px] mt-0.5">
                          {step.approver_type === "role"
                            ? `Role: ${step.approver_role}`
                            : `User: ${step.approver_user_name || "Assigned User"}`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Chronological Action History */}
              <div className="space-y-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Actions & Decisions History
                </span>

                {(audit.actions_history || []).length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Awaiting initial approval action from the designated reviewer.
                  </div>
                ) : (
                  <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                    {audit.actions_history.map((action, idx) => {
                      const isApprove = action.action === "approve";
                      const isReject = action.action === "reject";
                      const isCancel = action.action === "cancel";

                      return (
                        <div key={action.id || idx} className="relative group">
                          {/* Dot */}
                          <div
                            className={`absolute -left-[23px] top-1 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-background ${
                              isApprove
                                ? "bg-emerald-500 text-white"
                                : isReject
                                ? "bg-rose-500 text-white"
                                : "bg-muted-foreground text-white"
                            }`}
                          >
                            {isApprove && <CheckCircle2 className="h-2.5 w-2.5" />}
                            {isReject && <XCircle className="h-2.5 w-2.5" />}
                            {isCancel && <Ban className="h-2.5 w-2.5" />}
                          </div>

                          <div className="rounded-lg border bg-card p-3 text-xs space-y-1.5 shadow-2xs">
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{action.acted_by_name}</span>
                                <Badge
                                  variant="outline"
                                  className={
                                    isApprove
                                      ? "border-emerald-500/30 text-emerald-700 bg-emerald-500/10 text-[10px]"
                                      : isReject
                                      ? "border-rose-500/30 text-rose-700 bg-rose-500/10 text-[10px]"
                                      : "text-[10px]"
                                  }
                                >
                                  {action.action.toUpperCase()}
                                </Badge>
                                <span className="text-muted-foreground text-[11px]">
                                  Stage {action.step_order}: {action.step_name}
                                </span>
                              </div>

                              <span className="text-muted-foreground text-[11px]">
                                {format(new Date(action.acted_at), "dd MMM yyyy, HH:mm")}
                              </span>
                            </div>

                            {action.note && (
                              <div className="rounded bg-muted/40 p-2 text-foreground/90 font-mono text-[11px] whitespace-pre-wrap">
                                &quot;{action.note}&quot;
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="shrink-0 pt-3 border-t flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
