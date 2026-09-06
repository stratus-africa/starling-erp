import { useAuth } from "@/hooks/use-auth";
import { ApprovalInboxTab } from "./approvals/approval-inbox-tab";

export function ApprovalInbox() {
  const { can, tenant } = useAuth();
  const canApprove = can("approvals.approve");
  const canReject = can("approvals.reject");

  if (!can("approvals.read")) return null;

  return (
    <ApprovalInboxTab
      canApprove={canApprove}
      canReject={canReject}
      currency={tenant?.currency || "KES"}
    />
  );
}
