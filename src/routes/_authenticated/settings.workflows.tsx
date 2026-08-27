import { createFileRoute } from "@tanstack/react-router";
import { ApprovalInbox } from "@/components/approval-inbox";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Workflow, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/workflows")({
  component: ApprovalWorkflowsPage,
});

function ApprovalWorkflowsPage() {
  const { can } = useAuth();
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Approval Workflows</h1>
        <p className="text-sm text-muted-foreground">One approval engine for purchasing, finance, inventory, sales and manufacturing.</p>
      </div>

      {can("approvals.manage") && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Workflow className="h-5 w-5" />Workflow Engine</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            {[
              ["Purchase Orders", "purchase_order"],
              ["Expenses", "expense"],
              ["Inventory Adjustments", "inventory_adjustment"],
              ["Credit Notes", "credit_note"],
              ["Payments", "payment"],
              ["Journal Entries", "journal_entry"],
              ["Discounts", "discount"],
              ["Refunds", "refund"],
            ].map(([label, type]) => <div key={type} className="rounded-lg border p-3"><div className="font-medium">{label}</div><div className="text-xs text-muted-foreground">{type}</div></div>)}
          </CardContent>
        </Card>
      )}

      {can("approvals.read") && <div><h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="h-5 w-5" />My Approval Inbox</h2><ApprovalInbox /></div>}
    </div>
  );
}
