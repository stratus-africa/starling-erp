import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
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
  Plus,
  Search,
  Settings2,
  Workflow,
  ShieldCheck,
  CheckCircle2,
  Layers,
  ArrowRight,
  Edit,
  Trash2,
  Sliders,
  Loader2,
  AlertCircle,
  FileCheck,
} from "lucide-react";
import {
  getApprovalWorkflows,
  toggleWorkflowActive,
  deleteApprovalWorkflow,
  ENTITY_TYPE_CONFIG,
} from "@/lib/approval-workflow";
import type { ApprovalWorkflow } from "@/lib/db-types";
import { WorkflowFormDialog } from "./workflow-form-dialog";
import { WorkflowStepsDialog } from "./workflow-steps-dialog";

interface WorkflowListTabProps {
  canManage: boolean;
  currency?: string;
  tenantId?: string;
}

export function WorkflowListTab({
  canManage,
  currency = "KES",
  tenantId,
}: WorkflowListTabProps) {
  const qc = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<ApprovalWorkflow | null>(null);
  const [managingStepsWorkflow, setManagingStepsWorkflow] = useState<ApprovalWorkflow | null>(null);
  const [workflowToDelete, setWorkflowToDelete] = useState<ApprovalWorkflow | null>(null);

  const {
    data: workflows = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["approval_workflows", tenantId],
    queryFn: () => getApprovalWorkflows(tenantId),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await toggleWorkflowActive(id, isActive);
    },
    onSuccess: () => {
      toast.success("Workflow status updated");
      refetch();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update status");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteApprovalWorkflow(id);
    },
    onSuccess: () => {
      toast.success("Workflow deleted");
      setWorkflowToDelete(null);
      refetch();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete workflow");
    },
  });

  // Filtered workflows
  const filteredWorkflows = useMemo(() => {
    return workflows.filter((w) => {
      const cfg = ENTITY_TYPE_CONFIG[w.entity_type];
      const categoryMatch =
        selectedCategory === "all" || (cfg && cfg.category === selectedCategory);

      if (!categoryMatch) return false;

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();

      return (
        w.name.toLowerCase().includes(term) ||
        w.code.toLowerCase().includes(term) ||
        w.entity_type.toLowerCase().includes(term) ||
        (w.description && w.description.toLowerCase().includes(term)) ||
        (w.steps || []).some((s) => s.name.toLowerCase().includes(term))
      );
    });
  }, [workflows, selectedCategory, searchTerm]);

  // KPIs
  const stats = useMemo(() => {
    const total = workflows.length;
    const active = workflows.filter((w) => w.is_active).length;
    const multiStep = workflows.filter((w) => (w.steps?.length || 0) > 1).length;
    const coveredEntities = new Set(workflows.map((w) => w.entity_type)).size;
    return { total, active, multiStep, coveredEntities };
  }, [workflows]);

  const CATEGORIES = [
    { id: "all", label: "All Categories" },
    { id: "procurement", label: "Procurement" },
    { id: "finance", label: "Finance & Accounts" },
    { id: "inventory", label: "Inventory" },
    { id: "sales", label: "Sales" },
    { id: "manufacturing", label: "Manufacturing" },
  ];

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading approval workflows…</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="p-6 flex items-center gap-3 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold text-sm">Failed to load workflows</p>
            <p className="text-xs opacity-90">{(error as Error).message}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="rounded-xl border bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Total Workflows</span>
            <Workflow className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold mt-1 text-foreground font-mono">{stats.total}</p>
          <span className="text-[11px] text-muted-foreground">Configured in workspace</span>
        </div>

        <div className="rounded-xl border bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Active Policies</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400 font-mono">
            {stats.active}
          </p>
          <span className="text-[11px] text-muted-foreground">Enforcing sign-offs</span>
        </div>

        <div className="rounded-xl border bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Multi-Stage Chains</span>
            <Layers className="h-4 w-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-bold mt-1 text-foreground font-mono">{stats.multiStep}</p>
          <span className="text-[11px] text-muted-foreground">2+ sequential approvals</span>
        </div>

        <div className="rounded-xl border bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Entity Types</span>
            <FileCheck className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold mt-1 text-foreground font-mono">{stats.coveredEntities}</p>
          <span className="text-[11px] text-muted-foreground">Documents governed</span>
        </div>
      </div>

      {/* Controls & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search workflows by title, code, or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          {canManage && (
            <Button
              onClick={() => {
                setEditingWorkflow(null);
                setIsCreateOpen(true);
              }}
              className="h-9 gap-1.5 text-xs shadow-xs"
            >
              <Plus className="h-4 w-4" />
              Create Workflow
            </Button>
          )}
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map((cat) => (
          <Button
            key={cat.id}
            variant={selectedCategory === cat.id ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(cat.id)}
            className="h-8 text-xs shrink-0 rounded-full px-3.5"
          >
            {cat.label}
          </Button>
        ))}
      </div>

      {/* Workflow Cards Grid */}
      {filteredWorkflows.length === 0 ? (
        <Card className="border-dashed bg-muted/10">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground space-y-3">
            <Workflow className="h-10 w-10 text-muted-foreground/40" />
            <div className="space-y-1">
              <h3 className="font-semibold text-base">No Workflows Found</h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                No approval workflows match your current search or category filter.
              </p>
            </div>
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingWorkflow(null);
                  setIsCreateOpen(true);
                }}
                className="gap-1.5 text-xs mt-2"
              >
                <Plus className="h-3.5 w-3.5" />
                Define New Workflow
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredWorkflows.map((wf) => {
            const cfg = ENTITY_TYPE_CONFIG[wf.entity_type];
            const hasMinAmount =
              wf.conditions?.min_amount != null && Number(wf.conditions.min_amount) > 0;
            const stepsCount = wf.steps?.length || 0;

            return (
              <Card
                key={wf.id}
                className={`border transition-all flex flex-col justify-between ${
                  wf.is_active
                    ? "border-border hover:border-primary/40 shadow-xs"
                    : "border-border/60 bg-muted/20 opacity-75"
                }`}
              >
                <CardHeader className="pb-3 pt-4 px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-semibold truncate leading-snug">
                          {wf.name}
                        </CardTitle>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary" className="font-normal text-[11px]">
                          {cfg?.label || wf.entity_type}
                        </Badge>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          [{wf.code}]
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={wf.is_active}
                        onCheckedChange={(checked) =>
                          toggleMutation.mutate({ id: wf.id, isActive: checked })
                        }
                        disabled={!canManage || toggleMutation.isPending}
                        title={wf.is_active ? "Active rule" : "Disabled rule"}
                      />
                    </div>
                  </div>

                  {wf.description && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
                      {wf.description}
                    </p>
                  )}
                </CardHeader>

                <CardContent className="px-5 pb-4 pt-1 space-y-3.5 flex-1 flex flex-col justify-between">
                  {/* Trigger Condition Pill */}
                  <div className="rounded-lg bg-muted/30 border p-2.5 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Trigger Policy:</span>
                    {hasMinAmount ? (
                      <span className="font-semibold text-foreground font-mono">
                        Amount &gt; {currency} {Number(wf.conditions.min_amount).toLocaleString()}
                      </span>
                    ) : (
                      <Badge variant="outline" className="text-[11px] font-normal border-primary/30">
                        Always Required
                      </Badge>
                    )}
                  </div>

                  {/* Step Pipeline Visualization */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Approval Pipeline</span>
                      <span className="font-medium">
                        {stepsCount} {stepsCount === 1 ? "Stage" : "Stages"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
                      {stepsCount === 0 ? (
                        <span className="text-xs text-amber-600 dark:text-amber-400">
                          ⚠️ No steps configured
                        </span>
                      ) : (
                        wf.steps!.map((step, idx) => (
                          <div key={step.id} className="flex items-center shrink-0">
                            <div className="rounded-md border bg-card px-2.5 py-1 text-[11px] flex items-center gap-1.5 shadow-2xs">
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[10px]">
                                {step.step_order}
                              </span>
                              <span className="font-medium truncate max-w-[120px]">
                                {step.name}
                              </span>
                            </div>
                            {idx < wf.steps!.length - 1 && (
                              <ArrowRight className="h-3 w-3 mx-1 text-muted-foreground/40 shrink-0" />
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Actions Footer */}
                  {canManage && (
                    <div className="flex items-center justify-between pt-3 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setManagingStepsWorkflow(wf)}
                        className="h-8 gap-1.5 text-xs"
                      >
                        <Sliders className="h-3.5 w-3.5" />
                        Manage Stages ({stepsCount})
                      </Button>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingWorkflow(wf);
                            setIsCreateOpen(true);
                          }}
                          className="h-8 px-2.5 text-xs"
                        >
                          <Edit className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setWorkflowToDelete(wf)}
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <WorkflowFormDialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) setEditingWorkflow(null);
        }}
        workflow={editingWorkflow}
        currency={currency}
      />

      {/* Steps Pipeline Dialog */}
      <WorkflowStepsDialog
        open={!!managingStepsWorkflow}
        onOpenChange={(open) => !open && setManagingStepsWorkflow(null)}
        workflow={managingStepsWorkflow}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!workflowToDelete}
        onOpenChange={(open) => !open && setWorkflowToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow Rule?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{workflowToDelete?.name}&quot;?
              This will remove all associated sequential steps. Existing completed approval records will remain intact for audit compliance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => workflowToDelete && deleteMutation.mutate(workflowToDelete.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Workflow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
