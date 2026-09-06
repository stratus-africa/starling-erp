import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const db = supabase as any;

export interface SourceQuoteLine {
  id: string;
  line_no: number;
  item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  tax_pct: number;
  line_total: number;
}

export interface EligibleQuote {
  id: string;
  number: string;
  date: string | null;
  expiry: string | null;
  amount: number;
  currency: string;
  notes: string | null;
  itemCount: number;
  lines: SourceQuoteLine[];
}

export interface SourceOrderLine {
  id: string;
  line_no: number;
  item_id: string | null;
  description: string;
  ordered_quantity: number;
  already_invoiced_quantity: number;
  remaining_quantity: number;
  unit_price: number;
  discount_pct: number;
  tax_pct: number;
  line_total: number;
}

export interface EligibleOrder {
  id: string;
  number: string;
  date: string | null;
  status: string;
  amount: number;
  currency: string;
  notes: string | null;
  totalOrderedQty: number;
  totalRemainingQty: number;
  remainingItemsCount: number;
  lines: SourceOrderLine[];
}

/**
 * Detects accepted, unconverted Quotes for the selected customer when creating a Sales Order.
 */
export function useEligibleQuotesForSalesOrder(customerId: string | null | undefined) {
  const { tenant } = useAuth();

  return useQuery({
    queryKey: ["sales_quotes", "eligible-for-order", tenant?.id, customerId],
    enabled: !!tenant?.id && !!customerId,
    staleTime: 10_000,
    queryFn: async () => {
      if (!tenant?.id || !customerId) return [] as EligibleQuote[];

      // 1. Fetch quotes that are 'Accepted' and not soft-deleted
      const { data: quotes, error: quotesErr } = await db
        .from("sales_quotes")
        .select("id, number, date, expiry, amount, grand_total, currency, notes, converted_order_id")
        .eq("tenant_id", tenant.id)
        .eq("customer_id", customerId)
        .eq("status", "Accepted")
        .is("deleted_at", null)
        .is("converted_order_id", null)
        .order("date", { ascending: false });

      if (quotesErr) throw quotesErr;
      if (!quotes || quotes.length === 0) return [] as EligibleQuote[];

      const quoteIds = quotes.map((q: any) => q.id);

      // 2. Check for active sales orders that reference these quotes
      const { data: existingOrders, error: ordersErr } = await db
        .from("sales_orders")
        .select("id, source_quote_id, status")
        .eq("tenant_id", tenant.id)
        .in("source_quote_id", quoteIds)
        .is("deleted_at", null)
        .neq("status", "Cancelled");

      if (ordersErr) throw ordersErr;

      const convertedQuoteIds = new Set(
        (existingOrders ?? []).map((o: any) => o.source_quote_id).filter(Boolean)
      );

      // Filter out quotes that already have an active sales order
      const candidateQuotes = quotes.filter((q: any) => !convertedQuoteIds.has(q.id));
      if (candidateQuotes.length === 0) return [] as EligibleQuote[];

      const candidateIds = candidateQuotes.map((q: any) => q.id);

      // 3. Fetch quote lines for eligible quotes
      const { data: quoteLines, error: linesErr } = await db
        .from("sales_quote_lines")
        .select("id, document_id, line_no, item_id, description, quantity, unit_price, discount_pct, tax_pct, line_total")
        .in("document_id", candidateIds)
        .is("deleted_at", null)
        .order("line_no", { ascending: true });

      if (linesErr) throw linesErr;

      const linesByQuote: Record<string, SourceQuoteLine[]> = {};
      for (const l of (quoteLines ?? []) as any[]) {
        if (!linesByQuote[l.document_id]) linesByQuote[l.document_id] = [];
        linesByQuote[l.document_id].push({
          id: l.id,
          line_no: Number(l.line_no ?? 1),
          item_id: l.item_id || null,
          description: l.description || "",
          quantity: Number(l.quantity ?? 1),
          unit_price: Number(l.unit_price ?? 0),
          discount_pct: Number(l.discount_pct ?? 0),
          tax_pct: Number(l.tax_pct ?? 0),
          line_total: Number(l.line_total ?? 0),
        });
      }

      return candidateQuotes.map((q: any) => {
        const lines = linesByQuote[q.id] ?? [];
        return {
          id: q.id,
          number: q.number || "Quote",
          date: q.date,
          expiry: q.expiry,
          amount: Number(q.grand_total ?? q.amount ?? 0),
          currency: q.currency || "USD",
          notes: q.notes,
          itemCount: lines.length,
          lines,
        } as EligibleQuote;
      });
    },
  });
}

/**
 * Detects Open Sales Orders with remaining un-invoiced quantities for the selected customer when creating an Invoice.
 */
export function useEligibleOrdersForInvoice(customerId: string | null | undefined) {
  const { tenant } = useAuth();

  return useQuery({
    queryKey: ["sales_orders", "eligible-for-invoice", tenant?.id, customerId],
    enabled: !!tenant?.id && !!customerId,
    staleTime: 10_000,
    queryFn: async () => {
      if (!tenant?.id || !customerId) return [] as EligibleOrder[];

      // 1. Fetch candidate open sales orders
      const openStatuses = ["Confirmed", "Processing", "Packed", "Shipped", "Delivered"];
      const { data: orders, error: ordersErr } = await db
        .from("sales_orders")
        .select("id, number, date, status, amount, grand_total, currency, notes, converted_invoice_id")
        .eq("tenant_id", tenant.id)
        .eq("customer_id", customerId)
        .in("status", openStatuses)
        .is("deleted_at", null)
        .is("converted_invoice_id", null)
        .order("date", { ascending: false });

      if (ordersErr) throw ordersErr;
      if (!orders || orders.length === 0) return [] as EligibleOrder[];

      const orderIds = orders.map((o: any) => o.id);

      // 2. Fetch sales order lines
      const { data: orderLines, error: linesErr } = await db
        .from("sales_order_lines")
        .select("id, document_id, line_no, item_id, description, quantity, unit_price, discount_pct, tax_pct, line_total")
        .in("document_id", orderIds)
        .is("deleted_at", null)
        .order("line_no", { ascending: true });

      if (linesErr) throw linesErr;
      if (!orderLines || orderLines.length === 0) return [] as EligibleOrder[];

      // 3. Fetch all active invoices linked to these orders to calculate previously invoiced quantities
      const { data: linkedInvoices, error: invErr } = await db
        .from("invoices")
        .select("id, source_order_id, status")
        .eq("tenant_id", tenant.id)
        .in("source_order_id", orderIds)
        .is("deleted_at", null)
        .neq("status", "Cancelled");

      if (invErr) throw invErr;

      const invoiceIdToOrder: Record<string, string> = {};
      const activeInvoiceIds: string[] = [];
      for (const inv of (linkedInvoices ?? []) as any[]) {
        invoiceIdToOrder[inv.id] = inv.source_order_id;
        activeInvoiceIds.push(inv.id);
      }

      // 4. Fetch invoice lines already billed
      const invoicedQtyByOrderAndItem: Record<string, Record<string, number>> = {};
      if (activeInvoiceIds.length > 0) {
        const { data: invLines, error: invLinesErr } = await db
          .from("invoice_lines")
          .select("document_id, item_id, description, quantity")
          .in("document_id", activeInvoiceIds)
          .is("deleted_at", null);

        if (invLinesErr) throw invLinesErr;

        for (const il of (invLines ?? []) as any[]) {
          const ordId = invoiceIdToOrder[il.document_id];
          if (!ordId) continue;
          if (!invoicedQtyByOrderAndItem[ordId]) invoicedQtyByOrderAndItem[ordId] = {};
          const key = il.item_id ? `item:${il.item_id}` : `desc:${il.description?.trim().toLowerCase()}`;
          invoicedQtyByOrderAndItem[ordId][key] = (invoicedQtyByOrderAndItem[ordId][key] || 0) + Number(il.quantity || 0);
        }
      }

      // 5. Calculate remaining quantities per order line
      const eligibleOrders: EligibleOrder[] = [];

      for (const ord of orders as any[]) {
        const linesForOrder = (orderLines as any[]).filter((l) => l.document_id === ord.id);
        const orderInvoiced = invoicedQtyByOrderAndItem[ord.id] || {};

        const billableLines: SourceOrderLine[] = [];
        let totalOrdered = 0;
        let totalRemaining = 0;

        for (const l of linesForOrder) {
          const key = l.item_id ? `item:${l.item_id}` : `desc:${l.description?.trim().toLowerCase()}`;
          const alreadyInvoiced = orderInvoiced[key] || 0;
          const orderedQty = Number(l.quantity || 0);
          const remainingQty = Math.max(0, orderedQty - alreadyInvoiced);

          totalOrdered += orderedQty;
          totalRemaining += remainingQty;

          if (remainingQty > 0) {
            billableLines.push({
              id: l.id,
              line_no: Number(l.line_no ?? 1),
              item_id: l.item_id || null,
              description: l.description || "",
              ordered_quantity: orderedQty,
              already_invoiced_quantity: alreadyInvoiced,
              remaining_quantity: remainingQty,
              unit_price: Number(l.unit_price || 0),
              discount_pct: Number(l.discount_pct || 0),
              tax_pct: Number(l.tax_pct || 0),
              line_total: Number(l.line_total || 0),
            });
          }
        }

        // Only offer this order if there is billable quantity remaining
        if (billableLines.length > 0 && totalRemaining > 0) {
          eligibleOrders.push({
            id: ord.id,
            number: ord.number || "Sales Order",
            date: ord.date,
            status: ord.status,
            amount: Number(ord.grand_total ?? ord.amount ?? 0),
            currency: ord.currency || "USD",
            notes: ord.notes,
            totalOrderedQty: totalOrdered,
            totalRemainingQty: totalRemaining,
            remainingItemsCount: billableLines.length,
            lines: billableLines,
          });
        }
      }

      return eligibleOrders;
    },
  });
}

/**
 * Secondary search: Detects Accepted Quotes for Invoice creation ONLY when no Open Sales Orders exist.
 */
export function useEligibleQuotesForInvoice(
  customerId: string | null | undefined,
  hasOpenOrders: boolean
) {
  const { tenant } = useAuth();

  return useQuery({
    queryKey: ["sales_quotes", "fallback-for-invoice", tenant?.id, customerId],
    enabled: !!tenant?.id && !!customerId && !hasOpenOrders,
    staleTime: 10_000,
    queryFn: async () => {
      if (!tenant?.id || !customerId || hasOpenOrders) return [] as EligibleQuote[];

      const { data: quotes, error: quotesErr } = await db
        .from("sales_quotes")
        .select("id, number, date, expiry, amount, grand_total, currency, notes, converted_order_id")
        .eq("tenant_id", tenant.id)
        .eq("customer_id", customerId)
        .eq("status", "Accepted")
        .is("deleted_at", null)
        .is("converted_order_id", null)
        .order("date", { ascending: false });

      if (quotesErr) throw quotesErr;
      if (!quotes || quotes.length === 0) return [] as EligibleQuote[];

      const quoteIds = quotes.map((q: any) => q.id);

      const { data: quoteLines, error: linesErr } = await db
        .from("sales_quote_lines")
        .select("id, document_id, line_no, item_id, description, quantity, unit_price, discount_pct, tax_pct, line_total")
        .in("document_id", quoteIds)
        .is("deleted_at", null)
        .order("line_no", { ascending: true });

      if (linesErr) throw linesErr;

      const linesByQuote: Record<string, SourceQuoteLine[]> = {};
      for (const l of (quoteLines ?? []) as any[]) {
        if (!linesByQuote[l.document_id]) linesByQuote[l.document_id] = [];
        linesByQuote[l.document_id].push({
          id: l.id,
          line_no: Number(l.line_no ?? 1),
          item_id: l.item_id || null,
          description: l.description || "",
          quantity: Number(l.quantity ?? 1),
          unit_price: Number(l.unit_price ?? 0),
          discount_pct: Number(l.discount_pct ?? 0),
          tax_pct: Number(l.tax_pct ?? 0),
          line_total: Number(l.line_total ?? 0),
        });
      }

      return quotes.map((q: any) => {
        const lines = linesByQuote[q.id] ?? [];
        return {
          id: q.id,
          number: q.number || "Quote",
          date: q.date,
          expiry: q.expiry,
          amount: Number(q.grand_total ?? q.amount ?? 0),
          currency: q.currency || "USD",
          notes: q.notes,
          itemCount: lines.length,
          lines,
        } as EligibleQuote;
      });
    },
  });
}
