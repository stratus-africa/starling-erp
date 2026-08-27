import { supabase } from "@/integrations/supabase/client";

export type ApprovalEntityType =
  | "purchase_order"
  | "expense"
  | "inventory_adjustment"
  | "credit_note"
  | "payment"
  | "journal_entry"
  | "discount"
  | "refund"
  | (string & {});

export interface ApprovalInboxItem {
  id: string;
  entity_type: string;
  entity_id: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  current_step: number;
  workflow_name: string;
  step_name: string;
  amount: number | null;
  requested_by: string;
  submitted_at: string;
}

const rpc = (name: string, args: Record<string, unknown> = {}) =>
  (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(name, args);

export async function createApprovalRequest(input: {
  entityType: ApprovalEntityType;
  entityId: string;
  amount?: number | null;
  payload?: Record<string, unknown>;
  idempotencyKey?: string | null;
  workflowCode?: string | null;
}) {
  const { data, error } = await rpc("create_approval_request", {
    _entity_type: input.entityType,
    _entity_id: input.entityId,
    _amount: input.amount ?? null,
    _payload: input.payload ?? {},
    _idempotency_key: input.idempotencyKey ?? null,
    _workflow_code: input.workflowCode ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function actOnApprovalRequest(requestId: string, action: "approve" | "reject", note?: string) {
  const { data, error } = await rpc("act_on_approval_request", {
    _request_id: requestId,
    _action: action,
    _note: note ?? null,
  });
  if (error) throw new Error(error.message);
  return data as ApprovalInboxItem;
}

export async function getMyApprovalInbox(): Promise<ApprovalInboxItem[]> {
  const { data, error } = await rpc("get_my_approval_inbox");
  if (error) throw new Error(error.message);
  return (data ?? []) as ApprovalInboxItem[];
}

export async function createApprovalWorkflow(input: {
  code: string;
  name: string;
  entityType: ApprovalEntityType;
  description?: string;
  conditions?: Record<string, unknown>;
}) {
  const { data, error } = await rpc("create_approval_workflow", {
    _code: input.code,
    _name: input.name,
    _entity_type: input.entityType,
    _description: input.description ?? null,
    _conditions: input.conditions ?? {},
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function addApprovalWorkflowStep(input: {
  workflowId: string;
  stepOrder: number;
  name: string;
  approverType: "role" | "user";
  approverRole?: string;
  approverUserId?: string;
  minimumApprovals?: number;
}) {
  const { data, error } = await rpc("add_approval_workflow_step", {
    _workflow_id: input.workflowId,
    _step_order: input.stepOrder,
    _name: input.name,
    _approver_type: input.approverType,
    _approver_role: input.approverRole ?? null,
    _approver_user_id: input.approverUserId ?? null,
    _minimum_approvals: input.minimumApprovals ?? 1,
  });
  if (error) throw new Error(error.message);
  return data as string;
}
