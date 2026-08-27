import { z } from "zod";

export const InvoiceSchema = z.object({
  tenant_id: z.string().uuid(),
  number: z.string().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  date: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  currency: z.string().min(1),
  subtotal: z.number().finite(),
  discount_total: z.number().finite(),
  tax_total: z.number().finite(),
  grand_total: z.number().finite(),
  amount: z.number().finite().nullable().optional(),
  amount_paid: z.number().finite().optional(),
  balance_due: z.number().finite().optional(),
  balance: z.number().finite().nullable().optional(),
  status: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const InvoiceLineSchema = z.object({
  tenant_id: z.string().uuid(),
  document_id: z.string().uuid(),
  line_no: z.number().int().positive(),
  item_id: z.string().uuid().nullable().optional(),
  description: z.string().optional(),
  quantity: z.number().finite(),
  unit_price: z.number().finite(),
  discount_pct: z.number().finite(),
  tax_pct: z.number().finite(),
  line_total: z.number().finite(),
});

export const PaymentSchema = z.object({
  tenant_id: z.string().uuid(),
  number: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  amount: z.number().finite().positive(),
  mode: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
});

export const StockMovementSchema = z.object({
  tenant_id: z.string().uuid(),
  item_id: z.string().uuid(),
  warehouse_id: z.string().uuid().nullable().optional(),
  quantity: z.number().finite().refine((value) => value !== 0, "Quantity cannot be zero"),
  unit_cost: z.number().finite().nonnegative(),
  ref_type: z.string().min(1),
  ref_id: z.string().uuid().nullable().optional(),
  note: z.string().nullable().optional(),
});

export const JournalEntrySchema = z.object({
  tenant_id: z.string().uuid(),
  entry_date: z.string().min(1),
  number: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
  source_ref_type: z.string().nullable().optional(),
  source_ref_id: z.string().uuid().nullable().optional(),
  total_debit: z.number().finite().nonnegative(),
  total_credit: z.number().finite().nonnegative(),
}).refine((entry) => Math.abs(entry.total_debit - entry.total_credit) < 0.005, {
  message: "Journal entry must balance",
  path: ["total_credit"],
});

export const JournalLineSchema = z.object({
  tenant_id: z.string().uuid(),
  journal_id: z.string().uuid(),
  account_id: z.string().uuid(),
  debit: z.number().finite().nonnegative(),
  credit: z.number().finite().nonnegative(),
  memo: z.string().nullable().optional(),
}).refine((line) => !(line.debit > 0 && line.credit > 0), {
  message: "A journal line cannot contain both debit and credit",
  path: ["credit"],
});

export const PaymentAllocationSchema = z.object({
  invoice_id: z.string().uuid().optional(),
  bill_id: z.string().uuid().optional(),
  amount: z.number().finite().positive(),
}).refine((allocation) => Boolean(allocation.invoice_id) !== Boolean(allocation.bill_id), {
  message: "Allocation must target either an invoice or a bill",
});

export const PostInvoiceArgsSchema = z.object({ _invoice_id: z.string().uuid() });
export const PostBillArgsSchema = z.object({ _bill_id: z.string().uuid() });
export const PostCreditNoteArgsSchema = z.object({ _credit_note_id: z.string().uuid() });
export const PostShipmentArgsSchema = z.object({ _shipment_id: z.string().uuid() });
export const PostPackageArgsSchema = z.object({ _package_id: z.string().uuid() });
export const VoidPostedDocumentArgsSchema = z.object({
  _entity_type: z.string().min(1),
  _entity_id: z.string().uuid(),
  _permission: z.string().min(1),
  _reason: z.string().max(500).optional(),
});

export type InvoiceInput = z.infer<typeof InvoiceSchema>;
export type InvoiceLineInput = z.infer<typeof InvoiceLineSchema>;
export type PaymentInput = z.infer<typeof PaymentSchema>;
export type StockMovementInput = z.infer<typeof StockMovementSchema>;
export type JournalEntryInput = z.infer<typeof JournalEntrySchema>;
export type JournalLineInput = z.infer<typeof JournalLineSchema>;
export type PaymentAllocation = z.infer<typeof PaymentAllocationSchema>;
