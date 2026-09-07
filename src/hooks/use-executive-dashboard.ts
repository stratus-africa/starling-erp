import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const db = supabase as any;

type Row = Record<string, any>;
export interface ExecutiveDashboardData {
  revenue: { m: string; rev: number; exp: number }[];
  sales: { d: string; v: number }[];
  stockByWh: { name: string; value: number }[];
  revenueMtd: number;
  orders: number;
  activeCustomers: number;
  inventoryValue: number;
  topCustomers: { n: string; v: number; p: number }[];
  alerts: { t: string; s: string; type: "destructive" | "warning" | "info" }[];
}

const EMPTY: ExecutiveDashboardData = {
  revenue: [], sales: [], stockByWh: [], revenueMtd: 0, orders: 0, activeCustomers: 0,
  inventoryValue: 0, topCustomers: [], alerts: [],
};

const day = (value: string | null | undefined) => value?.slice(0, 10) ?? "";
const month = (value: Date) => value.toISOString().slice(0, 7);

export function useExecutiveDashboard() {
  const { tenant } = useAuth();
  return useQuery({
    queryKey: ["dashboard", "executive", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async (): Promise<ExecutiveDashboardData> => {
      const now = new Date();
      const currentMonth = month(now);
      const start = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      const startDate = start.toISOString().slice(0, 10);
      const [invoices, orders, customers, stock, warehouses, expenses, requisitions] = await Promise.all([
        db.from("invoices").select("date,grand_total,balance_due,customer_id,due_date,status").is("deleted_at", null),
        db.from("sales_orders").select("id,date,status").is("deleted_at", null),
        db.from("customers").select("id").is("deleted_at", null).eq("status", "Active"),
        db.from("inventory_item_stock").select("item_id,on_hand").eq("tenant_id", tenant.id),
        db.from("inventory_warehouse_stock").select("warehouse_id,on_hand").eq("tenant_id", tenant.id),
        db.from("expenses").select("date,total,amount,status").is("deleted_at", null),
        db.from("purchase_requisitions").select("id,status").is("deleted_at", null),
      ]);
      for (const result of [invoices, orders, customers, stock, warehouses, expenses, requisitions]) {
        if (result.error) throw result.error;
      }

      const invoiceRows = invoices.data ?? [];
      const expenseRows = expenses.data ?? [];
      const orderRows = orders.data ?? [];
      const revenueMtd = invoiceRows.filter((row: Row) => day(row.date).slice(0, 7) === currentMonth).reduce((sum: number, row: Row) => sum + Number(row.grand_total ?? 0), 0);
      const inventoryValue = (stock.data ?? []).reduce((sum: number, row: Row) => sum + Number(row.on_hand ?? 0), 0);
      const monthBuckets = Array.from({ length: 7 }, (_, index) => {
        const d = new Date(start.getFullYear(), start.getMonth() + index, 1);
        return { key: month(d), label: d.toLocaleString(undefined, { month: "short" }), rev: 0, exp: 0 };
      });
      invoiceRows.forEach((row: Row) => { const bucket = monthBuckets.find((item) => item.key === day(row.date).slice(0, 7)); if (bucket) bucket.rev += Number(row.grand_total ?? 0); });
      expenseRows.forEach((row: Row) => { const bucket = monthBuckets.find((item) => item.key === day(row.date).slice(0, 7)); if (bucket) bucket.exp += Number(row.total ?? row.amount ?? 0); });
      const salesDays = Array.from({ length: 7 }, (_, index) => { const d = new Date(); d.setDate(d.getDate() - 6 + index); return day(d.toISOString()); });
      const sales = salesDays.map((date) => ({ d: new Date(`${date}T00:00:00`).toLocaleString(undefined, { weekday: "short" }), v: orderRows.filter((row: Row) => day(row.date) === date).length }));
      const stockByWh = new Map<string, number>();
      (warehouses.data ?? []).forEach((row: Row) => stockByWh.set(row.warehouse_id ?? "unassigned", (stockByWh.get(row.warehouse_id ?? "unassigned") ?? 0) + Number(row.on_hand ?? 0)));
      const warehouseIds = Array.from(stockByWh.keys()).filter((id) => id !== "unassigned");
      const { data: warehouseRows, error: warehouseError } = warehouseIds.length ? await db.from("warehouses").select("id,name").in("id", warehouseIds) : { data: [], error: null };
      if (warehouseError) throw warehouseError;
      const warehouseNames = Object.fromEntries((warehouseRows ?? []).map((row: Row) => [row.id, row.name]));
      const overdue = invoiceRows.filter((row: Row) => Number(row.balance_due ?? 0) > 0 && row.due_date && day(row.due_date) < day(now.toISOString())).length;
      const lowStock = (stock.data ?? []).filter((row: Row) => Number(row.on_hand ?? 0) <= 0).length;
      return {
        revenue: monthBuckets.map(({ label: m, rev, exp }) => ({ m, rev, exp })),
        sales,
        stockByWh: Array.from(stockByWh.entries()).map(([id, value]) => ({ name: warehouseNames[id] ?? "Unassigned", value })),
        revenueMtd,
        orders: orderRows.length,
        activeCustomers: customers.data?.length ?? 0,
        inventoryValue,
        topCustomers: [],
        alerts: [
          ...(overdue ? [{ t: `${overdue} overdue invoice${overdue === 1 ? "" : "s"}`, s: "Review outstanding receivables", type: "destructive" as const }] : []),
          ...(lowStock ? [{ t: `${lowStock} item${lowStock === 1 ? "" : "s"} out of stock`, s: "Review inventory replenishment", type: "warning" as const }] : []),
          ...((requisitions.data ?? []).filter((row: Row) => ["Draft", "Pending", "Submitted"].includes(row.status)).slice(0, 1).map(() => ({ t: "Purchase requisition awaiting approval", s: "Review procurement workflow", type: "info" as const }))),
        ],
      };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: EMPTY,
  });
}
