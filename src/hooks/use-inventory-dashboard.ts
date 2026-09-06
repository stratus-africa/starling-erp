import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─── Shape returned by get_inventory_dashboard() ─────────────────────────────

export interface InventoryKpis {
  total_skus: number;
  total_value: number;
  total_units: number;
  reserved_units: number;
  available_units: number;
  low_stock_count: number;
  out_of_stock_count: number;
  pending_transfers: number;
  pending_adjustments: number;
  items_on_order: number;
  slow_moving_count: number;
  expiry_tracked_count: number;
}

export interface MovementTrendPoint {
  x: string;
  inbound: number;
  outbound: number;
}

export interface TopItem {
  item_id: string;
  name: string;
  sku: string | null;
  on_hand: number;
  cost: number;
  value: number;
  uom: string | null;
  type: string | null;
}

export interface WarehouseDist {
  warehouse_id: string | null;
  warehouse_name: string | null;
  warehouse_code: string | null;
  on_hand: number;
  value: number;
}

export interface LowStockItem {
  item_id: string;
  name: string;
  sku: string | null;
  on_hand: number;
  reorder: number;
  uom: string | null;
  pct: number;
}

export interface OutOfStockItem {
  item_id: string;
  name: string;
  sku: string | null;
  on_hand: number;
  reorder: number | null;
  uom: string | null;
  last_sale: string | null;
}

export interface PendingTransfer {
  id: string;
  number: string;
  date: string;
  item_name: string | null;
  item_sku: string | null;
  quantity: number;
  uom: string | null;
  status: string | null;
  from_wh: string | null;
  to_wh: string | null;
}

export interface PendingAdjustment {
  id: string;
  number: string;
  date: string;
  item_name: string | null;
  item_sku: string | null;
  quantity: number;
  uom: string | null;
  reason: string | null;
  warehouse: string | null;
}

export interface RecentMovement {
  id: string;
  created_at: string;
  item_name: string | null;
  item_sku: string | null;
  quantity: number;
  unit_cost: number;
  ref_type: string;
  note: string | null;
  warehouse: string | null;
  location_code: string | null;
}

export interface SlowMovingItem {
  item_id: string;
  name: string;
  sku: string | null;
  on_hand: number;
  cost: number;
  value: number;
  uom: string | null;
  last_movement: string | null;
}

export interface ValuationByCategory {
  category: string;
  sku_count: number;
  units: number;
  value: number;
}

export interface InventoryDashboardData {
  kpis: InventoryKpis;
  movement_trend: MovementTrendPoint[];
  top_items: TopItem[];
  warehouse_dist: WarehouseDist[];
  low_stock: LowStockItem[];
  out_of_stock: OutOfStockItem[];
  pending_transfers: PendingTransfer[];
  pending_adjustments: PendingAdjustment[];
  recent_movements: RecentMovement[];
  slow_moving: SlowMovingItem[];
  valuation_by_category: ValuationByCategory[];
}

// ─── Default (empty) state used while loading ─────────────────────────────────

export const EMPTY_INVENTORY_DASHBOARD: InventoryDashboardData = {
  kpis: {
    total_skus: 0,
    total_value: 0,
    total_units: 0,
    reserved_units: 0,
    available_units: 0,
    low_stock_count: 0,
    out_of_stock_count: 0,
    pending_transfers: 0,
    pending_adjustments: 0,
    items_on_order: 0,
    slow_moving_count: 0,
    expiry_tracked_count: 0,
  },
  movement_trend: [],
  top_items: [],
  warehouse_dist: [],
  low_stock: [],
  out_of_stock: [],
  pending_transfers: [],
  pending_adjustments: [],
  recent_movements: [],
  slow_moving: [],
  valuation_by_category: [],
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useInventoryDashboard() {
  return useQuery({
    queryKey: ["dashboard", "inventory"],
    queryFn: async (): Promise<InventoryDashboardData> => {
      const { data, error } = await supabase.rpc("get_inventory_dashboard");
      if (error) throw error;
      return (data as unknown as InventoryDashboardData) ?? EMPTY_INVENTORY_DASHBOARD;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: EMPTY_INVENTORY_DASHBOARD,
  });
}
