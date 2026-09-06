import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  createApprovalWorkflow,
  updateApprovalWorkflow,
  addApprovalWorkflowStep,
  ENTITY_TYPE_CONFIG,
  type ApprovalEntityType,
} from "@/lib/approval-workflow";
import type { ApprovalWorkflow } from "@/lib/db-types";

interface WorkflowFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow?: ApprovalWorkflow | null;
  currency?: string;
}

export function WorkflowFormDialog({
  open,
  onOpenChange,
  workflow,
  currency = "KES",
}: WorkflowFormDialogProps) {
  const isEdit = !!workflow;
  const qc = useQueryClient();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [entityType, setEntityType] = useState<ApprovalEntityType>("purchase_order");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  // Conditions
  const [conditionType, setConditionType] = useState<"always" | "min_amount">("always");
  const [minAmount, setMinAmount] = useState<string>("");

  useEffect(() => {
    if (workflow) {
      setCode(workflow.code);
      setName(workflow.name);
      setEntityType(workflow.entity_type as ApprovalEntityType);
      setDescription(workflow.description || "");
      setIsActive(workflow.is_active);

      const conditions = workflow.conditions || {};
      if (conditions.min_amount != null && conditions.min_amount > 0) {
        setConditionType("min_amount");
        setMinAmount(String(conditions.min_amount));
      } else {
        setConditionType("always");
        setMinAmount("");
      }
    } else {
      setCode("");
      setName("");
      setEntityType("purchase_order");
      setDescription("");
      setIsActive(true);
      setConditionType("always");
      setMinAmount("");
    }
  }, [workflow, open]);

  // Auto-generate code slug from name if new
  const handleNameChange = (val: string) => {
    setName(val);
    if (!isEdit && !code) {
      const generatedCode = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      setCode(generatedCode);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Workflow name is required");
      if (!code.trim()) throw new Error("Workflow code is required");

      const conditionsPayload: Record<string, unknown> = {
        require_approval: true,
      };

      if (conditionType === "min_amount") {
        const numVal = parseFloat(minAmount);
        if (isNaN(numVal) || numVal <= 0) {
          throw new Error("Please enter a valid positive threshold amount");
        }
        conditionsPayload.min_amount = numVal;
      }

      if (isEdit && workflow) {
        return await updateApprovalWorkflow({
          id: workflow.id,
          name: name.trim(),
          description: description.trim() || null,
          isActive,
          conditions: conditionsPayload,
        });
      } else {
        const workflowId = await createApprovalWorkflow({
          code: code.trim(),
          name: name.trim(),
          entityType,
          description: description.trim() || undefined,
          conditions: conditionsPayload,
        });

        // Automatically add default Step 1 for new workflows
        const defaultRole =
          entityType === "purchase_order" || entityType === "purchase_requisition"
            ? "purchasing"
            : entityType === "expense" || entityType === "payment" || entityType === "bill"
            ? "accounting"
            : entityType === "bom" || entityType === "production_order"
            ? "manufacturing"
            : "tenant_admin";

        try {
          await addApprovalWorkflowStep({
            workflowId,
            stepOrder: 1,
            name: "Initial Review & Sign-off",
            approverType: "role",
            approverRole: defaultRole,
            minimumApprovals: 1,
          });
        } catch {
          // ignore step creation if step was already added by default triggers
        }

        return workflowId;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Workflow updated successfully" : "Workflow created successfully");
      qc.invalidateQueries({ queryKey: ["approval_workflows"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to save workflow");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Approval Workflow" : "New Approval Workflow"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modify the trigger rules and details for this approval workflow."
              : "Define a document approval policy and specify when multi-step sign-offs are required."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wf-name">Workflow Name *</Label>
              <Input
                id="wf-name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. High Value Purchase Orders"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wf-code">Identifier Code *</Label>
              <Input
                id="wf-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={isEdit}
                placeholder="e.g. po_over_10000"
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wf-entity">Target Document / Entity Type *</Label>
            <Select
              value={entityType}
              onValueChange={(val) => setEntityType(val as ApprovalEntityType)}
              disabled={isEdit}
            >
              <SelectTrigger id="wf-entity">
                <SelectValue placeholder="Select target document" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ENTITY_TYPE_CONFIG).map(([type, cfg]) => (
                  <SelectItem key={type} value={type}>
                    <div className="flex flex-col text-left py-0.5">
                      <span className="font-medium text-sm">{cfg.label}</span>
                      <span className="text-[11px] text-muted-foreground">{cfg.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wf-desc">Description</Label>
            <Textarea
              id="wf-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain who this applies to and the business intent..."
              rows={2}
            />
          </div>

          {/* Trigger Condition / Policy */}
          <div className="rounded-lg border bg-muted/20 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Trigger Rule / Policy</Label>
              <span className="text-xs text-muted-foreground">Conditions for routing to approval</span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="cond-always"
                  name="condition_rule"
                  checked={conditionType === "always"}
                  onChange={() => setConditionType("always")}
                  className="text-primary focus:ring-primary h-4 w-4"
                />
                <label htmlFor="cond-always" className="text-sm cursor-pointer">
                  Always require approval for every document
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="cond-threshold"
                  name="condition_rule"
                  checked={conditionType === "min_amount"}
                  onChange={() => setConditionType("min_amount")}
                  className="text-primary focus:ring-primary h-4 w-4"
                />
                <label htmlFor="cond-threshold" className="text-sm cursor-pointer">
                  Require approval only when amount exceeds threshold
                </label>
              </div>
            </div>

            {conditionType === "min_amount" && (
              <div className="pt-2 pl-6 space-y-1.5 animate-in fade-in duration-200">
                <Label htmlFor="wf-min-amount" className="text-xs font-medium">
                  Minimum Amount ({currency})
                </Label>
                <div className="relative">
                  <Input
                    id="wf-min-amount"
                    type="number"
                    step="any"
                    value={minAmount}
                    onChange={(e) => setMinAmount(e.target.value)}
                    placeholder="e.g. 10000"
                    className="font-mono"
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                    {currency}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Documents with a total below this amount will automatically bypass approval.
                </p>
              </div>
            )}
          </div>

          {/* Status Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="wf-status" className="text-sm font-medium">
                Active Status
              </Label>
              <p className="text-xs text-muted-foreground">
                When enabled, new documents will be evaluated against this rule.
              </p>
            </div>
            <Switch id="wf-status" checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saveMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Save Changes" : "Create Workflow"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
