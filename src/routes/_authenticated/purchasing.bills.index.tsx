import { createFileRoute } from "@tanstack/react-router";
import { DocumentViewWindow } from "@/components/document-view-window";

export const Route = createFileRoute("/_authenticated/purchasing/bills/")({
  component: () => (
    <DocumentViewWindow
      kind="bill"
      title="Bills"
      description="Manage supplier bills, approvals, posting, and payments."
      table="bills"
      fields={[]}
      searchColumn="number"
      filters={[{ key: "status", label: "Status", options: ["Draft", "Pending Approval", "Approved", "Posted", "Partially Paid", "Paid", "Overdue", "Voided", "Cancelled"] }]}
    />
  ),
});
