export const ACCOUNTING_EVENT_TYPES = [
  "invoice_posted",
  "bill_posted",
  "customer_payment_posted",
  "supplier_payment_posted",
  "credit_note_posted",
  "supplier_credit_posted",
  "expense_posted",
  "manual_journal_posted",
  "bank_transaction_posted",
  "inventory_adjustment_posted",
  "inventory_receipt_posted",
  "inventory_issue_posted",
  "sales_order_fulfillment_posted",
  "purchase_receipt_posted",
  "production_consumption_posted",
  "production_completion_posted",
  "reversal_posted",
  "void_posted",
  "opening_balance_posted",
] as const;

export type AccountingEventType = (typeof ACCOUNTING_EVENT_TYPES)[number];
export type AccountingStatus = "draft" | "validated" | "posted" | "reversed" | "voided" | "failed";
export type PostingDirection = "debit" | "credit";
export type AccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense"
  | "bank"
  | "cash"
  | "ar"
  | "ap"
  | "inventory";

export interface BusinessDocument {
  id: string;
  tenant_id: string;
  document_type: string;
  source_table: string;
  currency: string;
  document_date: string;
  status: string;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, unknown>;
}

export interface AccountingEvent {
  id: string;
  tenant_id: string;
  source_document_type: string;
  source_document_id: string;
  event_type: AccountingEventType;
  event_date: string;
  currency: string;
  status: AccountingStatus;
  idempotency_key: string;
  created_by?: string | null;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface PostingLine {
  id?: string;
  tenant_id: string;
  account_id: string;
  account_type: AccountType;
  direction: PostingDirection;
  amount: number;
  currency: string;
  description?: string | null;
  source_line_id?: string | null;
}

export interface AccountingPosting {
  id: string;
  tenant_id: string;
  event_id: string;
  posting_type: string;
  posting_date: string;
  currency: string;
  status: AccountingStatus;
  source_reference?: string | null;
  reversal_of_posting_id?: string | null;
  created_by?: string | null;
  created_at: string;
  lines: PostingLine[];
}

export interface PostingValidationContext {
  tenant_id: string;
  source_document: BusinessDocument;
  event: AccountingEvent;
  currency: string;
  posting_date: string;
}

export interface PostingResult {
  posting_id: string;
  event_id: string;
  journal_entry_id?: string | null;
  ar_allocation_id?: string | null;
  ap_allocation_id?: string | null;
  inventory_movement_id?: string | null;
}

export const ACCOUNTING_LIFECYCLE = [
  "Business Document",
  "Accounting Event",
  "Posting Engine",
  "Accounting Posting",
  "GL / AR / AP / Inventory",
] as const;

export function assertBalancedPosting(lines: PostingLine[]) {
  const debitTotal = lines
    .filter((line) => line.direction === "debit")
    .reduce((sum, line) => sum + Number(line.amount || 0), 0);

  const creditTotal = lines
    .filter((line) => line.direction === "credit")
    .reduce((sum, line) => sum + Number(line.amount || 0), 0);

  if (Math.abs(debitTotal - creditTotal) > 0.01) {
    throw new Error("Accounting posting is out of balance.");
  }
}

const STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  quote: ["Draft", "Sent", "Viewed", "Accepted", "Rejected", "Cancelled"],
  sales_order: ["Draft", "Confirmed", "Processing", "Completed", "Cancelled"],
};

export function assertStatusTransitionAllowed(
  entityType: string,
  oldStatus: string | null | undefined,
  newStatus: string | null | undefined,
): boolean {
  const normalizedType = entityType.toLowerCase().replace(/[_\-\s]+/g, "_");
  const from = (oldStatus ?? "").trim();
  const to = (newStatus ?? "").trim();
  if (!from || !to) return false;

  const allowed = STATUS_TRANSITIONS[normalizedType];
  if (!allowed) return false;

  const validPair =
    normalizedType === "quote"
      ? [
          ["Draft", "Sent"],
          ["Draft", "Cancelled"],
          ["Sent", "Viewed"],
          ["Sent", "Cancelled"],
          ["Viewed", "Accepted"],
          ["Viewed", "Rejected"],
          ["Viewed", "Cancelled"],
          ["Accepted", "Cancelled"],
          ["Rejected", "Cancelled"],
        ]
      : [
          ["Draft", "Confirmed"],
          ["Draft", "Cancelled"],
          ["Confirmed", "Processing"],
          ["Confirmed", "Cancelled"],
          ["Processing", "Completed"],
          ["Processing", "Cancelled"],
          ["Completed", "Cancelled"],
        ];

  return validPair.some(([previous, next]) => previous === from && next === to);
}

export function makeIdempotencyKey(sourceType: string, sourceId: string, eventType: string) {
  return `${sourceType}:${sourceId}:${eventType}`;
}

export async function createAccountingEvent(_input: Omit<AccountingEvent, "id" | "created_at">): Promise<AccountingEvent> {
  throw new Error("Accounting event creation must be done in the authoritative server-side RPC/service layer.");
}

export async function createAccountingPosting(_input: Omit<AccountingPosting, "id" | "created_at">): Promise<PostingResult> {
  throw new Error("Accounting postings must be created by the authoritative posting engine, not by UI logic.");
}

export async function reversePosting(_originalPostingId: string, _reason: string): Promise<PostingResult> {
  throw new Error("Reversal posting requires the authoritative server-side posting engine.");
}

export async function voidPosting(_postingId: string, _reason: string): Promise<PostingResult> {
  throw new Error("Void action must be implemented as a reversal event in the authoritative posting layer.");
}
