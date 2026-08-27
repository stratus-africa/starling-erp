import { z } from "zod";

export const CustomerSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required"),
  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .optional()
    .or(z.literal("")),
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

export function formatZodError(error: z.ZodError) {
  return error.issues.reduce<Record<string, string>>((errors, issue) => {
    const field = issue.path.join(".") || "form";

    if (!errors[field]) {
      errors[field] = issue.message;
    }

    return errors;
  }, {});
}
