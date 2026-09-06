import type { Database, Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Invoice = Tables<"invoices">;
export type InvoiceInsert = TablesInsert<"invoices">;
export type InvoiceUpdate = TablesUpdate<"invoices">;
export type InvoiceLine = Tables<"invoice_lines">;
export type InvoiceLineInsert = TablesInsert<"invoice_lines">;
export type InvoiceLineUpdate = TablesUpdate<"invoice_lines">;
export type PaymentReceived = Tables<"payments_received">;
export type PaymentReceivedInsert = TablesInsert<"payments_received">;
export type PaymentMade = Tables<"payments_made">;
export type PaymentMadeInsert = TablesInsert<"payments_made">;
export type StockMovement = Tables<"stock_movements">;
export type StockMovementInsert = TablesInsert<"stock_movements">;
export type JournalEntry = Tables<"journal_entries">;
export type JournalLine = Tables<"journal_lines">;
export type Package = Tables<"packages">;
export type PackageInsert = TablesInsert<"packages">;
export type PackageLine = Tables<"package_lines">;
export type PackageLineInsert = TablesInsert<"package_lines">;
export type Shipment = Tables<"shipments">;
export type ShipmentInsert = TablesInsert<"shipments">;
export type SalesOrder = Tables<"sales_orders">;
export type SalesOrderLine = Tables<"sales_order_lines">;
export type Customer = Tables<"customers">;
export type Item = Tables<"items">;
export type Warehouse = Tables<"warehouses">;
export type ChartOfAccount = Tables<"chart_of_accounts">;
export type AppRole = Database["public"]["Enums"]["app_role"];
export type Payment = PaymentReceived | PaymentMade;
export type Tenant = Tables<"tenants"> & {
  legal_name?: string | null;
  trading_name?: string | null;
  registration_number?: string | null;
  tax_id?: string | null;
  vat_number?: string | null;
  business_type?: string | null;
  industry?: string | null;
  description?: string | null;
  year_established?: number | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state_province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  timezone?: string | null;
  date_format?: string | null;
  number_format?: string | null;
  fiscal_year_start?: string | null;
  fiscal_year_end?: string | null;
  tax_authority?: string | null;
  tax_regime?: string | null;
  tax_inclusive_pricing?: boolean | null;
  logo_url?: string | null;
  signature_url?: string | null;
  stamp_url?: string | null;
};

export interface ApprovalWorkflow {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  entity_type: string;
  description: string | null;
  conditions: {
    min_amount?: number | null;
    max_amount?: number | null;
    require_approval?: boolean;
    [key: string]: unknown;
  };
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  steps?: ApprovalWorkflowStep[];
  step_count?: number;
}

export interface ApprovalWorkflowStep {
  id: string;
  workflow_id: string;
  step_order: number;
  name: string;
  approver_type: "role" | "user";
  approver_role: string | null;
  approver_user_id: string | null;
  approver_user_name?: string | null;
  minimum_approvals: number;
  created_at?: string;
}

export interface ApprovalRequest {
  id: string;
  tenant_id: string;
  workflow_id: string;
  entity_type: string;
  entity_id: string;
  requested_by: string;
  requested_by_name?: string | null;
  requested_by_email?: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  current_step: number;
  amount: number | null;
  payload: Record<string, unknown>;
  idempotency_key?: string | null;
  submitted_at: string;
  completed_at: string | null;
  created_at?: string;
  updated_at?: string;
  workflow_name?: string | null;
  step_name?: string | null;
}

export interface ApprovalAction {
  id: string;
  tenant_id: string;
  request_id: string;
  workflow_step_id: string;
  action: "approve" | "reject" | "cancel";
  acted_by: string;
  acted_by_name?: string | null;
  note: string | null;
  acted_at: string;
  step_name?: string;
  step_order?: number;
}

export interface ApprovalRequestAudit {
  request_id: string;
  entity_type: string;
  entity_id: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  amount: number | null;
  current_step: number;
  submitted_at: string;
  completed_at: string | null;
  requested_by_id: string;
  requested_by_name: string;
  requested_by_email: string;
  workflow_id: string;
  workflow_code: string;
  workflow_name: string;
  workflow_steps: Array<{
    id: string;
    step_order: number;
    name: string;
    approver_type: "role" | "user";
    approver_role: string | null;
    approver_user_id: string | null;
    approver_user_name: string | null;
    minimum_approvals: number;
  }>;
  actions_history: Array<{
    id: string;
    action: "approve" | "reject" | "cancel";
    note: string | null;
    acted_at: string;
    acted_by_id: string;
    acted_by_name: string;
    step_name: string;
    step_order: number;
  }>;
}

