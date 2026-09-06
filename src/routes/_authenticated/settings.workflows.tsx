import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Workflow, Inbox, ShieldCheck, History, Sliders } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getMyApprovalInbox, getApprovalWorkflows } from "@/lib/approval-workflow";

import { WorkflowListTab } from "@/components/approvals/workflow-list-tab";
import { ApprovalInboxTab } from "@/components/approvals/approval-inbox-tab";
import { ApprovalHistoryTab } from "@/components/approvals/approval-history-tab";

export const Route = createFileRoute("/_authenticated/settings/workflows")({
  component: ApprovalWorkflowsPage,
  head: () => ({
    meta: [
      { title: "Approval Workflows | AURORA ERP" },
      {
        name: "description",
        content:
          "Configure enterprise multi-step approval pipelines, review pending documents, and monitor audit trails.",
      },
    ],
  }),
});

function ApprovalWorkflowsPage() {
  const { can, tenant } = useAuth();

  const canManage = can("approvals.manage") || can("settings.roles");
  const canRead = can("approvals.read");
  const canApprove = can("approvals.approve");
  const canReject = can("approvals.reject");

  // Determine initial active tab based on permissions
  const defaultTab = canManage ? "workflows" : "inbox";
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Live query for urgent inbox count
  const { data: inboxItems = [] } = useQuery({
    queryKey: ["my_approval_inbox"],
    queryFn: getMyApprovalInbox,
    enabled: canRead,
    refetchInterval: 30000, // auto-refresh every 30s
  });

  // Query workflow count
  const { data: workflows = [] } = useQuery({
    queryKey: ["approval_workflows", tenant?.id],
    queryFn: () => getApprovalWorkflows(tenant?.id),
    enabled: canRead || canManage,
  });

  const currency = tenant?.currency || "KES";

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Workflow className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Approval Workflows
            </h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Configure multi-step sign-off rules across procurement, finance, inventory, and operations,
            decision on pending documents, and inspect verifiable audit trails.
          </p>
        </div>
      </div>

      {/* Main Tabs Workspace */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="border-b">
          <TabsList className="h-11 bg-transparent p-0 gap-6">
            {canManage && (
              <TabsTrigger
                value="workflows"
                className="relative h-11 rounded-none border-b-2 border-transparent bg-transparent px-2 pb-3 pt-2 font-medium text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none gap-2"
              >
                <Sliders className="h-4 w-4" />
                <span>Workflows & Policies</span>
                {workflows.length > 0 && (
                  <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-xs font-semibold">
                    {workflows.length}
                  </Badge>
                )}
              </TabsTrigger>
            )}

            {canRead && (
              <TabsTrigger
                value="inbox"
                className="relative h-11 rounded-none border-b-2 border-transparent bg-transparent px-2 pb-3 pt-2 font-medium text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none gap-2"
              >
                <Inbox className="h-4 w-4" />
                <span>My Approval Inbox</span>
                {inboxItems.length > 0 && (
                  <Badge className="bg-amber-500 hover:bg-amber-600 text-white rounded-full px-2 py-0.5 text-xs font-bold animate-pulse">
                    {inboxItems.length}
                  </Badge>
                )}
              </TabsTrigger>
            )}

            {canRead && (
              <TabsTrigger
                value="history"
                className="relative h-11 rounded-none border-b-2 border-transparent bg-transparent px-2 pb-3 pt-2 font-medium text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none gap-2"
              >
                <History className="h-4 w-4" />
                <span>Audit Log & History</span>
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* Tab 1: Workflows & Step Pipelines */}
        {canManage && (
          <TabsContent value="workflows" className="space-y-4 focus-visible:outline-none">
            <WorkflowListTab
              canManage={canManage}
              currency={currency}
              tenantId={tenant?.id}
            />
          </TabsContent>
        )}

        {/* Tab 2: Actionable Inbox */}
        {canRead && (
          <TabsContent value="inbox" className="space-y-4 focus-visible:outline-none">
            <ApprovalInboxTab
              canApprove={canApprove}
              canReject={canReject}
              currency={currency}
            />
          </TabsContent>
        )}

        {/* Tab 3: History & Compliance Log */}
        {canRead && (
          <TabsContent value="history" className="space-y-4 focus-visible:outline-none">
            <ApprovalHistoryTab
              canManage={canManage}
              currency={currency}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
