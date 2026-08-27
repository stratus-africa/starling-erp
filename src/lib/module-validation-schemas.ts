import { z } from "zod";

export const CustomerSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required"),
  email: z.string().trim().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().trim().optional(),
});

export const InvoiceSchema = z.object({
  customer_id: z.string().min(1, "Customer is required"),
  invoice_number: z.string().trim().min(1, "Invoice number is required"),
  invoice_date: z.string().min(1, "Invoice date is required"),
  due_date: z.string().optional(),
});

export const PurchaseOrderSchema = z.object({
  supplier_id: z.string().min(1, "Supplier is required"),
  po_number: z.string().trim().min(1, "Purchase order number is required"),
  order_date: z.string().min(1, "Order date is required"),
});

export const PaymentSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  payment_date: z.string().min(1, "Payment date is required"),
});

export const StockMovementSchema = z.object({
  item_id: z.string().min(1, "Item is required"),
  quantity: z.coerce.number(),
  movement_type: z.string().min(1, "Movement type is required"),
});

/**
 * Validation schema for invoice/order line items.
 * Used by the document editor before inserting line records.
 */
export const InvoiceLineSchema = z.object({
  line_no: z.coerce.number().int().positive("Line number must be positive"),
  item_id: z.string().nullable().optional(),
  description: z.string().trim().optional(),
  quantity: z.coerce.number().nonnegative("Quantity cannot be negative"),
  unit_price: z.coerce.number().nonnegative("Unit price cannot be negative"),
  discount_pct: z.coerce.number().min(0, "Discount cannot be negative").max(100, "Discount cannot exceed 100%"),
  tax_pct: z.coerce.number().min(0, "Tax cannot be negative"),
  line_total: z.coerce.number().nonnegative("Line total cannot be negative"),
});

/**
 * Validation schemas keyed by the application table name.
 * Consumers can safely look up a schema; tables without a dedicated
 * validation schema are intentionally omitted and remain unvalidated here.
 */
export const schemaByTable = {
  customers: CustomerSchema,
  invoices: InvoiceSchema,
  purchase_orders: PurchaseOrderSchema,
  payments_received: PaymentSchema,
  payments_made: PaymentSchema,
  stock_movements: StockMovementSchema,
} as const;

export function formatZodError(error: z.ZodError) {
  return error.issues.reduce<Record<string, string>>((errors, issue) => {
    const field = issue.path.join(".") || "form";

    if (!errors[field]) {
      errors[field] = issue.message;
    }

    return errors;
  }, {});
}
