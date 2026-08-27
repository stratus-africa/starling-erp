import { z } from "zod";

const uuid = z.string().uuid();
const requiredText = (label: string) => z.string().trim().min(1, `${label} is required`);
const nullableText = z.string().trim().max(5000).nullable().optional();
const optionalDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date").nullable().optional();
const requiredDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");
const finiteNumber = (label: string) => z.number({ invalid_type_error: `${label} must be a number` }).finite(`${label} must be a finite number`);
const nonNegative = (label: string) => finiteNumber(label).nonnegative(`${label} cannot be negative`);
const positive = (label: string) => finiteNumber(label).positive(`${label} must be greater than zero`);
const percentage = (label: string) => finiteNumber(label).min(0, `${label} cannot be negative`).max(100, `${label} cannot exceed 100%`);

export const CustomerSchema = z.object({
  tenant_id: uuid,
  name: requiredText("Customer name").max(200, "Customer name must be 200 characters or less"),
  code: z.string().trim().max(24, "Code must be 24 characters or less").nullable().optional(),
  contact_person: z.string().trim().max(200).nullable().optional(),
  industry: z.string().trim().max(100).nullable().optional(),
  email: z.string().trim().email("Enter a valid email address").nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  website: z.string().trim().url("Enter a valid website URL").nullable().optional(),
  salesperson_id: uuid.nullable().optional(),
  currency: requiredText("Currency").max(10),
  payment_terms: z.string().trim().max(50).nullable().optional(),
  tax_id: z.string().trim().max(100).nullable().optional(),
  credit_limit: nonNegative("Credit limit").nullable().optional(),
  balance: nonNegative("Balance").nullable().optional(),
  status: z.enum(["Active", "Inactive", "Overdue"]).nullable().optional(),
  billing_address: nullableText,
  shipping_address: nullableText,
  notes: nullableText,
});

export const InvoiceLineSchema = z.object({
  tenant_id: uuid,
  document_id: uuid,
  line_no: z.number().int().positive(),
  item_id: uuid.nullable().optional(),
  description: z.string().trim().max(1000).optional(),
  quantity: positive("Quantity"),
  unit_price: nonNegative("Unit price"),
  discount_pct: percentage("Discount"),
  tax_pct: percentage("Tax"),
  line_total: nonNegative("Line total"),
}).superRefine((line, ctx) => {
  const expected = Math.round(line.quantity * line.unit_price * (1 - line.discount_pct / 100) * (1 + line.tax_pct / 100) * 100) / 100;
  if (Math.abs(expected - line.line_total) > 0.01) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["line_total"], message: "Line total does not match quantity, price, discount and tax" });
  }
});

const DocumentHeaderBaseSchema = z.object({
  tenant_id: uuid,
  number: z.string().trim().max(50).nullable().optional(),
  customer_id: uuid.nullable().optional(),
  supplier_id: uuid.nullable().optional(),
  date: optionalDate,
  due_date: optionalDate,
  expected_date: optionalDate,
  expiry: optionalDate,
  required_date: optionalDate,
  currency: requiredText("Currency").max(10),
  subtotal: nonNegative("Subtotal"),
  discount_total: nonNegative("Discount").default(0),
  tax_total: nonNegative("Tax").default(0),
  grand_total: nonNegative("Grand total"),
  amount: nonNegative("Amount").nullable().optional(),
  amount_paid: nonNegative("Amount paid").default(0),
  balance_due: nonNegative("Balance due").default(0),
  balance: nonNegative("Balance").nullable().optional(),
  status: z.string().trim().max(50).nullable().optional(),
  notes: nullableText,
  source_order_id: uuid.nullable().optional(),
  converted_bill_id: uuid.nullable().optional(),
  invoice_id: uuid.nullable().optional(),
});

export const InvoiceSchema = DocumentHeaderBaseSchema.extend({
  customer_id: uuid,
  date: requiredDate,
  due_date: optionalDate,
}).superRefine((doc, ctx) => {
  if (doc.grand_total + 0.01 < doc.amount_paid) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["amount_paid"], message: "Amount paid cannot exceed grand total" });
  }
  const expectedBalance = Math.round((doc.grand_total - doc.amount_paid) * 100) / 100;
  if (doc.balance_due != null && Math.abs(expectedBalance - doc.balance_due) > 0.01) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["balance_due"], message: "Balance due must equal grand total minus amount paid" });
  }
});

export const PurchaseOrderSchema = DocumentHeaderBaseSchema.extend({
  supplier_id: uuid,
  date: requiredDate,
  expected_date: optionalDate,
});

export const PaymentSchema = z.object({
  tenant_id: uuid,
  number: z.string().trim().max(50).nullable().optional(),
  date: requiredDate,
  amount: positive("Payment amount"),
  mode: requiredText("Payment mode").max(50),
  reference: z.string().trim().max(200).nullable().optional(),
  customer_id: uuid.nullable().optional(),
  supplier_id: uuid.nullable().optional(),
}).superRefine((payment, ctx) => {
  if (!payment.customer_id && !payment.supplier_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customer_id"], message: "Customer or supplier is required" });
  }
  if (payment.customer_id && payment.supplier_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["supplier_id"], message: "Payment cannot target both customer and supplier" });
  }
});

export const StockMovementSchema = z.object({
  tenant_id: uuid,
  item_id: uuid,
  warehouse_id: uuid.nullable().optional(),
  quantity: finiteNumber("Quantity").refine((value) => value !== 0, "Quantity cannot be zero"),
  unit_cost: nonNegative("Unit cost"),
  ref_type: requiredText("Reference type").max(100),
  ref_id: uuid.nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const InventoryAdjustmentSchema = z.object({
  tenant_id: uuid,
  number: requiredText("Adjustment number").max(50),
  date: requiredDate,
  item_id: uuid,
  warehouse_id: uuid.nullable().optional(),
  quantity: finiteNumber("Quantity").refine((value) => value !== 0, "Quantity cannot be zero"),
  reason: requiredText("Reason").max(500),
  status: z.string().trim().max(50).nullable().optional(),
});

export const ProductionOrderSchema = z.object({
  tenant_id: uuid,
  number: requiredText("Production order number").max(50),
  date: requiredDate,
  bom_id: uuid.nullable().optional(),
  warehouse_id: uuid.nullable().optional(),
  quantity: positive("Production quantity"),
  status: z.string().trim().max(50).nullable().optional(),
  notes: nullableText,
});

export const JournalEntrySchema = z.object({
  tenant_id: uuid,
  entry_date: requiredDate,
  number: z.string().trim().max(50).nullable().optional(),
  memo: nullableText,
  source_ref_type: z.string().trim().max(100).nullable().optional(),
  source_ref_id: uuid.nullable().optional(),
  total_debit: nonNegative("Total debit"),
  total_credit: nonNegative("Total credit"),
}).superRefine((entry, ctx) => {
  if (Math.abs(entry.total_debit - entry.total_credit) > 0.005) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["total_credit"], message: "Journal entry must balance" });
  }
});

export const JournalLineSchema = z.object({
  tenant_id: uuid,
  journal_id: uuid,
  account_id: uuid,
  debit: nonNegative("Debit"),
  credit: nonNegative("Credit"),
  memo: nullableText,
}).superRefine((line, ctx) => {
  if (line.debit > 0 && line.credit > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["credit"], message: "A journal line cannot contain both debit and credit" });
  }
  if (line.debit === 0 && line.credit === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["debit"], message: "A journal line must contain a debit or credit" });
  }
});

export const PaymentAllocationSchema = z.object({
  invoice_id: uuid.optional(),
  bill_id: uuid.optional(),
  amount: positive("Allocation amount"),
}).refine((allocation) => Boolean(allocation.invoice_id) !== Boolean(allocation.bill_id), {
  message: "Allocation must target either an invoice or a bill",
});

export const PostInvoiceArgsSchema = z.object({ _invoice_id: uuid });
export const PostBillArgsSchema = z.object({ _bill_id: uuid });
export const PostCreditNoteArgsSchema = z.object({ _credit_note_id: uuid });
export const PostShipmentArgsSchema = z.object({ _shipment_id: uuid });
export const PostPackageArgsSchema = z.object({ _package_id: uuid });
export const VoidPostedDocumentArgsSchema = z.object({
  _entity_type: requiredText("Entity type"),
  _entity_id: uuid,
  _permission: requiredText("Permission"),
  _reason: z.string().trim().max(500).optional(),
});

export const schemaByTable = {
  customers: CustomerSchema,
  invoices: InvoiceSchema,
  purchase_orders: PurchaseOrderSchema,
  payments_received: PaymentSchema,
  payments_made: PaymentSchema,
  stock_movements: StockMovementSchema,
  inventory_adjustments: InventoryAdjustmentSchema,
  production_orders: ProductionOrderSchema,
  journal_entries: JournalEntrySchema,
  journal_lines: JournalLineSchema,
} as const;

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "Form"}: ${issue.message}`).join("; ");
}

export function validateSchema<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(formatZodError(result.error));
  return result.data;
}

export type CustomerInput = z.infer<typeof CustomerSchema>;
export type InvoiceInput = z.infer<typeof InvoiceSchema>;
export type InvoiceLineInput = z.infer<typeof InvoiceLineSchema>;
export type PurchaseOrderInput = z.infer<typeof PurchaseOrderSchema>;
export type PaymentInput = z.infer<typeof PaymentSchema>;
export type StockMovementInput = z.infer<typeof StockMovementSchema>;
export type InventoryAdjustmentInput = z.infer<typeof InventoryAdjustmentSchema>;
export type ProductionOrderInput = z.infer<typeof ProductionOrderSchema>;
export type JournalEntryInput = z.infer<typeof JournalEntrySchema>;
export type JournalLineInput = z.infer<typeof JournalLineSchema>;
export type PaymentAllocation = z.infer<typeof PaymentAllocationSchema>;
