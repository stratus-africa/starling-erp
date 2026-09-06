import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/typed-db";
import type {
  ApprovalWorkflow,
  ApprovalWorkflowStep,
  ApprovalRequest,
  ApprovalRequestAudit,
} from "@/lib/db-types";

export type ApprovalEntityType =
  | "purchase_order"
  | "purchase_requisition"
  | "expense"
  | "bill"
  | "inventory_adjustment"
  | "credit_note"
  | "payment"
  | "journal_entry"
  | "discount"
  | "refund"
  | "bom"
  | "production_order"
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
  requested_by_name?: string | null;
  submitted_at: string;
}

export interface EntityTypeConfig {
  label: string;
  category: "procurement" | "finance" | "inventory" | "sales" | "manufacturing";
  description: string;
  defaultThreshold?: number;
  entityRoutePrefix?: string;
}

export const ENTITY_TYPE_CONFIG: Record<string, EntityTypeConfig> = {
  purchase_order: {
    label: "Purchase Orders",
    category: "procurement",
    description: "Supplier purchase orders before placement and confirmation",
    defaultThreshold: 10000,
    entityRoutePrefix: "/purchasing/orders",
  },
  purchase_requisition: {
    label: "Purchase Requisitions",
    category: "procurement",
    description: "Internal department purchase requests prior to PO issuance",
    defaultThreshold: 5000,
    entityRoutePrefix: "/purchasing/requisitions",
  },
  expense: {
    label: "Expenses",
    category: "finance",
    description: "Operational and corporate expense claims",
    defaultThreshold: 5000,
    entityRoutePrefix: "/accounting/expenses",
  },
  bill: {
    label: "Supplier Bills",
    category: "finance",
    description: "Vendor invoices payable requiring accounting authorization",
    defaultThreshold: 10000,
    entityRoutePrefix: "/purchasing/bills",
  },
  payment: {
    label: "Payments",
    category: "finance",
    description: "Outgoing vendor and remittance payments",
    defaultThreshold: 10000,
    entityRoutePrefix: "/purchasing/payments",
  },
  journal_entry: {
    label: "Manual Journals",
    category: "finance",
    description: "General ledger manual adjustments and reclassifications",
    entityRoutePrefix: "/accounting/journals",
  },
  credit_note: {
    label: "Credit Notes",
    category: "finance",
    description: "Customer credit adjustments and invoice write-backs",
    defaultThreshold: 2000,
    entityRoutePrefix: "/sales/credit-notes",
  },
  refund: {
    label: "Customer Refunds",
    category: "finance",
    description: "Outgoing customer refunds and dispute settlements",
    defaultThreshold: 1000,
    entityRoutePrefix: "/sales/refunds",
  },
  discount: {
    label: "Sales Discounts",
    category: "sales",
    description: "Discounts exceeding standard commercial sales quotas",
    defaultThreshold: 15,
  },
  inventory_adjustment: {
    label: "Stock Adjustments",
    category: "inventory",
    description: "Stock write-offs, variance corrections, and counts",
    entityRoutePrefix: "/inventory/adjustments",
  },
  bom: {
    label: "Bills of Materials (BOM)",
    category: "manufacturing",
    description: "Engineering BOM release and activation sign-offs",
    entityRoutePrefix: "/manufacturing/bom",
  },
  production_order: {
    label: "Production Orders",
    category: "manufacturing",
    description: "Work orders released to manufacturing production lines",
    entityRoutePrefix: "/manufacturing/orders",
  },
};

const rpc = (name: string, args: Record<string, unknown> = {}) =>
  (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>)(name, args);

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Administration (CRUD)
// ─────────────────────────────────────────────────────────────────────────────

export async function getApprovalWorkflows(tenantId?: string): Promise<ApprovalWorkflow[]> {
  let query = db
    .from("approval_workflows")
    .select(`
      id,
      tenant_id,
      code,
      name,
      entity_type,
      description,
      conditions,
      is_active,
      created_by,
      created_at,
      updated_at,
      steps:approval_workflow_steps (
        id,
        workflow_id,
        step_order,
        name,
        approver_type,
        approver_role,
        approver_user_id,
        minimum_approvals,
        created_at
      )
    `)
    .order("created_at", { ascending: true });

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data || []).map((w: any) => ({
    ...w,
    steps: (w.steps || []).sort(
      (a: ApprovalWorkflowStep, b: ApprovalWorkflowStep) => a.step_order - b.step_order
    ),
    step_count: (w.steps || []).length,
  }));
}

export async function createApprovalWorkflow(input: {
  code: string;
  name: string;
  entityType: ApprovalEntityType;
  description?: string;
  conditions?: Record<string, unknown>;
}): Promise<string> {
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

export async function updateApprovalWorkflow(input: {
  id: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
  conditions?: Record<string, unknown>;
}): Promise<ApprovalWorkflow> {
  const { data, error } = await rpc("update_approval_workflow", {
    _workflow_id: input.id,
    _name: input.name,
    _description: input.description ?? null,
    _is_active: input.isActive ?? true,
    _conditions: input.conditions ?? {},
  });
  if (error) throw new Error(error.message);
  return data as ApprovalWorkflow;
}

export async function toggleWorkflowActive(workflowId: string, isActive: boolean): Promise<void> {
  const { error } = await db
    .from("approval_workflows")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", workflowId);

  if (error) throw new Error(error.message);
}

export async function deleteApprovalWorkflow(workflowId: string): Promise<boolean> {
  const { data, error } = await rpc("delete_approval_workflow", {
    _workflow_id: workflowId,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step Administration
// ─────────────────────────────────────────────────────────────────────────────

export async function addApprovalWorkflowStep(input: {
  workflowId: string;
  stepOrder: number;
  name: string;
  approverType: "role" | "user";
  approverRole?: string | null;
  approverUserId?: string | null;
  minimumApprovals?: number;
}): Promise<string> {
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

export async function updateApprovalWorkflowStep(input: {
  stepId: string;
  name: string;
  approverType: "role" | "user";
  approverRole?: string | null;
  approverUserId?: string | null;
  minimumApprovals?: number;
}): Promise<ApprovalWorkflowStep> {
  const { data, error } = await rpc("update_approval_workflow_step", {
    _step_id: input.stepId,
    _name: input.name,
    _approver_type: input.approverType,
    _approver_role: input.approverRole ?? null,
    _approver_user_id: input.approverUserId ?? null,
    _minimum_approvals: input.minimumApprovals ?? 1,
  });
  if (error) throw new Error(error.message);
  return data as ApprovalWorkflowStep;
}

export async function deleteApprovalWorkflowStep(stepId: string): Promise<boolean> {
  const { data, error } = await rpc("delete_approval_workflow_step", {
    _step_id: stepId,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution & Inbox
// ─────────────────────────────────────────────────────────────────────────────

export async function createApprovalRequest(input: {
  entityType: ApprovalEntityType;
  entityId: string;
  amount?: number | null;
  payload?: Record<string, unknown>;
  idempotencyKey?: string | null;
  workflowCode?: string | null;
}): Promise<string> {
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

export async function actOnApprovalRequest(
  requestId: string,
  action: "approve" | "reject",
  note?: string
): Promise<ApprovalInboxItem> {
  const { data, error } = await rpc("act_on_approval_request", {
    _request_id: requestId,
    _action: action,
    _note: note ?? null,
  });
  if (error) throw new Error(error.message);
  return data as ApprovalInboxItem;
}

export async function cancelApprovalRequest(requestId: string, reason?: string): Promise<void> {
  const { error } = await rpc("cancel_approval_request", {
    _request_id: requestId,
    _reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function getMyApprovalInbox(): Promise<ApprovalInboxItem[]> {
  const { data, error } = await rpc("get_my_approval_inbox");
  if (error) throw new Error(error.message);
  return (data ?? []) as ApprovalInboxItem[];
}

export async function getAllApprovalRequests(filters?: {
  status?: string;
  entityType?: string;
  limit?: number;
}): Promise<ApprovalRequest[]> {
  let query = db
    .from("approval_requests")
    .select(`
      id,
      tenant_id,
      workflow_id,
      entity_type,
      entity_id,
      requested_by,
      status,
      current_step,
      amount,
      payload,
      idempotency_key,
      submitted_at,
      completed_at,
      created_at,
      updated_at,
      workflow:approval_workflows (name, code),
      requester:profiles!approval_requests_requested_by_fkey (full_name, email)
    `)
    .order("submitted_at", { ascending: false });

  if (filters?.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters?.entityType && filters.entityType !== "all") {
    query = query.eq("entity_type", filters.entityType);
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  } else {
    query = query.limit(100);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data || []).map((r: any) => ({
    ...r,
    workflow_name: r.workflow?.name,
    requested_by_name: r.requester?.full_name || r.requester?.email,
    requested_by_email: r.requester?.email,
  }));
}

export async function getApprovalRequestAudit(requestId: string): Promise<ApprovalRequestAudit | null> {
  const { data, error } = await rpc("get_approval_request_audit", {
    _request_id: requestId,
  });
  if (error) throw new Error(error.message);

  const rows = (data as ApprovalRequestAudit[]) || [];
  return rows[0] || null;
}
