import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, XCircle, Ban, AlertCircle } from "lucide-react";

interface ApprovalStatusBadgeProps {
  status: "pending" | "approved" | "rejected" | "cancelled" | string;
  currentStep?: number;
  className?: string;
  showIcon?: boolean;
}

export function ApprovalStatusBadge({
  status,
  currentStep,
  className = "",
  showIcon = true,
}: ApprovalStatusBadgeProps) {
  const normStatus = status.toLowerCase();

  switch (normStatus) {
    case "approved":
      return (
        <Badge
          variant="outline"
          className={`border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 gap-1.5 font-medium ${className}`}
        >
          {showIcon && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
          <span>Approved</span>
        </Badge>
      );
    case "pending":
      return (
        <Badge
          variant="outline"
          className={`border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 gap-1.5 font-medium ${className}`}
        >
          {showIcon && <Clock className="h-3.5 w-3.5 shrink-0" />}
          <span>Pending{currentStep ? ` (Step ${currentStep})` : ""}</span>
        </Badge>
      );
    case "rejected":
      return (
        <Badge
          variant="outline"
          className={`border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400 gap-1.5 font-medium ${className}`}
        >
          {showIcon && <XCircle className="h-3.5 w-3.5 shrink-0" />}
          <span>Rejected</span>
        </Badge>
      );
    case "cancelled":
      return (
        <Badge
          variant="outline"
          className={`border-muted-foreground/30 bg-muted/40 text-muted-foreground gap-1.5 font-medium ${className}`}
        >
          {showIcon && <Ban className="h-3.5 w-3.5 shrink-0" />}
          <span>Cancelled</span>
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={`gap-1.5 ${className}`}>
          {showIcon && <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
          <span className="capitalize">{status}</span>
        </Badge>
      );
  }
}
