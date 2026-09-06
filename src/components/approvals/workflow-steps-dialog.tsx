import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Trash2,
  Users,
  User,
  Shield,
  ArrowDown,
  CheckCircle2,
} from "lucide-react";
import {
  addApprovalWorkflowStep,
  updateApprovalWorkflowStep,
  deleteApprovalWorkflowStep,
} from "@/lib/approval-workflow";
import type { ApprovalWorkflow, ApprovalWorkflowStep } from "@/lib/db-types";
import { db } from "@/lib/typed-db";
import { useAuth, type AppRole } from "@/hooks/use-auth";

const AVAILABLE_ROLES: { role: AppRole; label: string }[] = [
  { role: "tenant_admin", label: "Tenant Administrator" },
  { role: "purchasing", label: "Purchasing Officer / Manager" },
  { role: "accounting", label: "Accounting & Finance" },
  { role: "sales", label: "Sales & Commercial" },
  { role: "inventory", label: "Warehouse & Inventory" },
  { role: "manufacturing", label: "Manufacturing & Operations" },
  { role: "viewer", label: "Auditor / Viewer" },
];

interface WorkflowStepsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow: ApprovalWorkflow | null;
}

export function WorkflowStepsDialog({
  open,
  onOpenChange,
  workflow,
}: WorkflowStepsDialogProps) {
  const qc = useQueryClient();
  const { tenant } = useAuth();

  // Form state for adding/editing a step
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [stepName, setStepName] = useState("");
  const [approverType, setApproverType] = useState<"role" | "user">("role");
  const [approverRole, setApproverRole] = useState<string>("purchasing");
  const [approverUserId, setApproverUserId] = useState<string>("");
  const [minApprovals, setMinApprovals] = useState<number>(1);
  const [isAddingNew, setIsAddingNew] = useState(false);

  // Fetch tenant users for specific user assignment
  const { data: tenantUsers = [] } = useQuery({
    queryKey: ["tenant_users_for_approval_steps", tenant?.id],
    enabled: !!tenant?.id && open,
    queryFn: async () => {
      const { data, error } = await db
        .from("profiles")
        .select("id, email, full_name")
        .eq("tenant_id", tenant!.id);
      if (error) throw error;
      return data || [];
    },
  });

  // Query workflow with latest steps
  const {
    data: steps = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["workflow_steps", workflow?.id],
    enabled: !!workflow?.id && open,
    queryFn: async () => {
      const { data, error } = await db
        .from("approval_workflow_steps")
        .select(`
          id,
          workflow_id,
          step_order,
          name,
          approver_type,
          approver_role,
          approver_user_id,
          minimum_approvals,
          created_at,
          user:profiles!approval_workflow_steps_approver_user_id_fkey(full_name, email)
        `)
        .eq("workflow_id", workflow!.id)
        .order("step_order", { ascending: true });

      if (error) throw error;
      return (data || []).map((s: any) => ({
        ...s,
        approver_user_name: s.user?.full_name || s.user?.email,
      })) as ApprovalWorkflowStep[];
    },
  });

  const resetForm = () => {
    setEditingStepId(null);
    setStepName("");
    setApproverType("role");
    setApproverRole("purchasing");
    setApproverUserId(tenantUsers[0]?.id || "");
    setMinApprovals(1);
    setIsAddingNew(false);
  };

  const startEditStep = (step: ApprovalWorkflowStep) => {
    setEditingStepId(step.id);
    setStepName(step.name);
    setApproverType(step.approver_type);
    setApproverRole(step.approver_role || "purchasing");
    setApproverUserId(step.approver_user_id || "");
    setMinApprovals(step.minimum_approvals || 1);
    setIsAddingNew(true);
  };

  const saveStepMutation = useMutation({
    mutationFn: async () => {
      if (!workflow) throw new Error("No active workflow");
      if (!stepName.trim()) throw new Error("Step name is required");

      if (approverType === "role" && !approverRole) {
        throw new Error("Please select an approver role");
      }
      if (approverType === "user" && !approverUserId) {
        throw new Error("Please select a specific user");
      }

      if (editingStepId) {
        await updateApprovalWorkflowStep({
          stepId: editingStepId,
          name: stepName.trim(),
          approverType,
          approverRole: approverType === "role" ? approverRole : null,
          approverUserId: approverType === "user" ? approverUserId : null,
          minimumApprovals: minApprovals,
        });
      } else {
        const nextOrder = (steps.length > 0 ? Math.max(...steps.map((s) => s.step_order)) : 0) + 1;
        await addApprovalWorkflowStep({
          workflowId: workflow.id,
          stepOrder: nextOrder,
          name: stepName.trim(),
          approverType,
          approverRole: approverType === "role" ? approverRole : null,
          approverUserId: approverType === "user" ? approverUserId : null,
          minimumApprovals: minApprovals,
        });
      }
    },
    onSuccess: () => {
      toast.success(editingStepId ? "Approval step updated" : "Approval step added");
      refetch();
      qc.invalidateQueries({ queryKey: ["approval_workflows"] });
      resetForm();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to save step");
    },
  });

  const deleteStepMutation = useMutation({
    mutationFn: async (stepId: string) => {
      await deleteApprovalWorkflowStep(stepId);
    },
    onSuccess: () => {
      toast.success("Step removed");
      refetch();
      qc.invalidateQueries({ queryKey: ["approval_workflows"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete step");
    },
  });

  if (!workflow) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <DialogTitle>Approval Chain: {workflow.name}</DialogTitle>
          </div>
          <DialogDescription>
            Configure sequential review stages for this workflow. Documents must be approved at each stage before proceeding.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1 py-3 space-y-5">
          {/* Visual Step Pipeline */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sequential Stages ({steps.length})
              </span>
              {!isAddingNew && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    resetForm();
                    setIsAddingNew(true);
                  }}
                  className="h-8 gap-1.5 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Stage
                </Button>
              )}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : steps.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground text-sm">
                No approval steps configured. Click &quot;Add Stage&quot; to create the first step.
              </div>
            ) : (
              <div className="space-y-2.5">
                {steps.map((step, idx) => {
                  const roleCfg = AVAILABLE_ROLES.find((r) => r.role === step.approver_role);
                  const isLast = idx === steps.length - 1;

                  return (
                    <div key={step.id} className="relative">
                      <div className="flex items-center justify-between rounded-xl border bg-card p-3.5 hover:border-primary/40 transition-colors shadow-xs">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                            {step.step_order}
                          </div>

                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate leading-tight">{step.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              {step.approver_type === "role" ? (
                                <Badge variant="secondary" className="gap-1 text-[11px] font-normal">
                                  <Users className="h-3 w-3" />
                                  Role: {roleCfg?.label || step.approver_role}
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="gap-1 text-[11px] font-normal">
                                  <User className="h-3 w-3" />
                                  User: {step.approver_user_name || "Specific User"}
                                </Badge>
                              )}

                              {step.minimum_approvals > 1 && (
                                <Badge variant="outline" className="text-[10px]">
                                  Requires {step.minimum_approvals} sign-offs
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEditStep(step)}
                            className="h-8 px-2 text-xs"
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteStepMutation.mutate(step.id)}
                            disabled={steps.length <= 1 || deleteStepMutation.isPending}
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title={steps.length <= 1 ? "Workflows must have at least one step" : "Delete step"}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {!isLast && (
                        <div className="flex justify-center my-1 text-muted-foreground/50">
                          <ArrowDown className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add / Edit Step Form */}
          {isAddingNew && (
            <div className="rounded-xl border bg-muted/20 p-4 space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {editingStepId ? "Edit Approval Stage" : "Add Approval Stage"}
                </p>
                <Button variant="ghost" size="sm" onClick={resetForm} className="h-7 text-xs">
                  Cancel
                </Button>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="step-name">Stage Label *</Label>
                  <Input
                    id="step-name"
                    value={stepName}
                    onChange={(e) => setStepName(e.target.value)}
                    placeholder="e.g. Finance Controller Review"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Approver Routing</Label>
                    <Select
                      value={approverType}
                      onValueChange={(val) => setApproverType(val as "role" | "user")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="role">By Role (e.g. Any Purchasing officer)</SelectItem>
                        <SelectItem value="user">By Specific User</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {approverType === "role" ? (
                    <div className="space-y-1.5">
                      <Label>Assigned Role *</Label>
                      <Select value={approverRole} onValueChange={setApproverRole}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          {AVAILABLE_ROLES.map((r) => (
                            <SelectItem key={r.role} value={r.role}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label>Assigned User *</Label>
                      <Select value={approverUserId} onValueChange={setApproverUserId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select user" />
                        </SelectTrigger>
                        <SelectContent>
                          {tenantUsers.map((u: any) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.full_name ? `${u.full_name} (${u.email})` : u.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="min-approvals">Minimum Sign-offs Required</Label>
                  <Input
                    id="min-approvals"
                    type="number"
                    min={1}
                    max={10}
                    value={minApprovals}
                    onChange={(e) => setMinApprovals(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-32"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Number of approved actions needed before this stage is considered complete (typically 1).
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={resetForm}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => saveStepMutation.mutate()}
                    disabled={saveStepMutation.isPending}
                    className="gap-1.5"
                  >
                    {saveStepMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    {editingStepId ? "Update Stage" : "Save Stage"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 pt-3 border-t flex justify-end">
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
