import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

type Row = Record<string, any>;

export interface RoleDashboardData {
  sales: {
    quotes: number;
    orders: number;
    invoiced: number;
    collected: number;
    outstanding: number;
    trend: { x: string; a: number; b: number }[];
    products: { primary: string; secondary: string; status: string; tone: "success" | "info" }[];
  };
  logistics: {
    fulfilment: number;
    awaitingShipment: number;
    packedToday: number;
    inTransit: number;
    delivered: number;
    trend: { x: string; a: number; b: number }[];
    deliveries: { primary: string; secondary: string; status: string; tone: "success" | "warning" | "info" }[];
  };
  procurement: {
    pendingRequisitions: number;
    approvedRequisitions: number;
    openPurchaseOrders: number;
    deliveriesThisWeek: number;
    lowStock: number;
    trend: { x: string; a: number; b: number }[];
    suppliers: { primary: string; secondary: string; status: string; tone: "success" | "warning" | "destructive" }[];
  };
  production: {
    salesOrders: number;
    orders: number;
    activeRuns: number;
    completed: number;
    shortages: number;
    trend: { x: string; a: number; b: number }[];
    alerts: { primary: string; secondary: string; status: string; tone: "success" | "warning" | "destructive" }[];
  };
}

const emptyData: RoleDashboardData = {
  sales: { quotes: 0, orders: 0, invoiced: 0, collected: 0, outstanding: 0, trend: [], products: [] },
  logistics: { fulfilment: 0, awaitingShipment: 0, packedToday: 0, inTransit: 0, delivered: 0, trend: [], deliveries: [] },
  procurement: { pendingRequisitions: 0, approvedRequisitions: 0, openPurchaseOrders: 0, deliveriesThisWeek: 0, lowStock: 0, trend: [], suppliers: [] },
  production: { salesOrders: 0, orders: 0, activeRuns: 0, completed: 0, shortages: 0, trend: [], alerts: [] },
};

function active(query: any) {
  return query.is("deleted_at", null);
}

function dayKey(value: string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function lastDays(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - count + index + 1);
    return date.toISOString().slice(0, 10);
  });
}

export function useRoleDashboardData() {
  return useQuery({
    queryKey: ["dashboard", "role-data"],
    queryFn: async (): Promise<RoleDashboardData> => {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      const startDate = start.toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      const weekDate = weekStart.toISOString().slice(0, 10);

      const [quotes, orders, invoices, received, packages, shipments, requisitions, purchaseOrders, items, productionOrders] = await Promise.all([
        db.from("sales_quotes").select("id,date,amount,status").then((r: any) => r),
        db.from("sales_orders").select("id,date,grand_total,status").then((r: any) => r),
        db.from("invoices").select("id,date,grand_total,balance_due,status").then((r: any) => r),
        db.from("payments_received").select("id,date,amount,status").then((r: any) => r),
        db.from("packages").select("id,date,status").then((r: any) => r),
        db.from("shipments").select("id,date,status,number").then((r: any) => r),
        db.from("purchase_requisitions").select("id,date,status").then((r: any) => r),
        db.from("purchase_orders").select("id,date,grand_total,status,supplier_id,suppliers(name)").then((r: any) => r),
        db.from("items").select("id,name,sku,stock,reorder,uom").then((r: any) => r),
        db.from("production_orders").select("id,date,status,quantity,qty_produced").then((r: any) => r),
      ]);

      for (const result of [quotes, orders, invoices, received, packages, shipments, requisitions, purchaseOrders, items, productionOrders]) {
        if (result.error) throw result.error;
      }

      const quoteRows = quotes.data ?? [];
      const orderRows = orders.data ?? [];
      const invoiceRows = invoices.data ?? [];
      const receivedRows = received.data ?? [];
      const packageRows = packages.data ?? [];
      const shipmentRows = shipments.data ?? [];
      const requisitionRows = requisitions.data ?? [];
      const purchaseOrderRows = purchaseOrders.data ?? [];
      const itemRows = items.data ?? [];
      const productionRows = productionOrders.data ?? [];
      const days = lastDays(7);

      const trend = (rowsA: Row[], fieldA: string, rowsB: Row[], fieldB: string) =>
        days.map((day) => ({
          x: day.slice(5),
          a: rowsA.filter((row) => dayKey(row.date) === day).reduce((sum, row) => sum + Number(row[fieldA] ?? 1), 0),
          b: rowsB.filter((row) => dayKey(row.date) === day).reduce((sum, row) => sum + Number(row[fieldB] ?? 1), 0),
        }));

      const salesProducts = new Map<string, { qty: number; value: number }>();
      invoiceRows.forEach((invoice: Row) => {
        const key = invoice.status || "Unclassified";
        const current = salesProducts.get(key) ?? { qty: 0, value: 0 };
        current.qty += 1;
        current.value += Number(invoice.grand_total ?? 0);
        salesProducts.set(key, current);
      });

      const supplierRows = new Map<string, number>();
      purchaseOrderRows.forEach((order: Row) => {
        const name = order.suppliers?.name ?? "Unassigned supplier";
        supplierRows.set(name, (supplierRows.get(name) ?? 0) + 1);
      });

      return {
        sales: {
          quotes: quoteRows.length,
          orders: orderRows.length,
          invoiced: invoiceRows.filter((row: Row) => dayKey(row.date) >= startDate).reduce((sum: number, row: Row) => sum + Number(row.grand_total ?? 0), 0),
          collected: receivedRows.filter((row: Row) => dayKey(row.date) >= startDate).reduce((sum: number, row: Row) => sum + Number(row.amount ?? 0), 0),
          outstanding: invoiceRows.reduce((sum: number, row: Row) => sum + Number(row.balance_due ?? 0), 0),
          trend: trend(invoiceRows, "grand_total", receivedRows, "amount"),
          products: Array.from(salesProducts.entries()).slice(0, 5).map(([name, value]) => ({ primary: name, secondary: `${value.qty} invoices · ${value.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, status: "Live", tone: "success" as const })),
        },
        logistics: {
          fulfilment: orderRows.filter((row: Row) => ["confirmed", "approved", "processing", "open", "Confirmed", "Approved", "Processing", "Open"].includes(row.status)).length,
          awaitingShipment: shipmentRows.filter((row: Row) => !["Delivered", "delivered", "Cancelled", "cancelled"].includes(row.status)).length,
          packedToday: packageRows.filter((row: Row) => dayKey(row.date) === today).length,
          inTransit: shipmentRows.filter((row: Row) => ["In Transit", "in_transit", "Shipped", "shipped"].includes(row.status)).length,
          delivered: shipmentRows.filter((row: Row) => dayKey(row.date) >= startDate && ["Delivered", "delivered"].includes(row.status)).length,
          trend: trend(packageRows, "id", shipmentRows, "id"),
          deliveries: shipmentRows.slice(0, 5).map((row: Row) => ({ primary: row.number ?? "Shipment", secondary: dayKey(row.date), status: row.status ?? "Pending", tone: ["Delivered", "delivered"].includes(row.status) ? "success" as const : "info" as const })),
        },
        procurement: {
          pendingRequisitions: requisitionRows.filter((row: Row) => ["Draft", "Pending", "pending", "Submitted", "submitted"].includes(row.status)).length,
          approvedRequisitions: requisitionRows.filter((row: Row) => ["Approved", "approved"].includes(row.status)).length,
          openPurchaseOrders: purchaseOrderRows.filter((row: Row) => !["Closed", "closed", "Cancelled", "cancelled"].includes(row.status)).length,
          deliveriesThisWeek: purchaseOrderRows.filter((row: Row) => dayKey(row.date) >= weekDate).length,
          lowStock: itemRows.filter((row: Row) => row.reorder != null && Number(row.stock ?? 0) <= Number(row.reorder)).length,
          trend: trend(purchaseOrderRows, "grand_total", purchaseOrderRows, "id"),
          suppliers: Array.from(supplierRows.entries()).slice(0, 5).map(([name, count]) => ({ primary: name, secondary: `${count} purchase order${count === 1 ? "" : "s"}`, status: "Active", tone: "info" as const })),
        },
        production: {
          salesOrders: orderRows.filter((row: Row) => ["production", "Production"].includes(row.status)).length,
          orders: productionRows.length,
          activeRuns: productionRows.filter((row: Row) => ["In Progress", "in_progress", "Released", "Released"].includes(row.status)).length,
          completed: productionRows.filter((row: Row) => dayKey(row.date) >= startDate && ["Completed", "completed", "Closed", "closed"].includes(row.status)).length,
          shortages: itemRows.filter((row: Row) => row.reorder != null && Number(row.stock ?? 0) <= Number(row.reorder)).length,
          trend: trend(productionRows, "quantity", productionRows, "qty_produced"),
          alerts: itemRows.filter((row: Row) => row.reorder != null && Number(row.stock ?? 0) <= Number(row.reorder)).slice(0, 5).map((row: Row) => ({ primary: row.name, secondary: `${row.stock ?? 0} ${row.uom ?? "units"} · reorder at ${row.reorder}`, status: Number(row.stock ?? 0) === 0 ? "Critical" : "Low", tone: Number(row.stock ?? 0) === 0 ? "destructive" as const : "warning" as const })),
        },
      };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: emptyData,
  });
}
