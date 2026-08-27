import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DashboardMetric {
  key: string;
  label: string;
  value: number;
  href: string;
}
export interface DashboardPoint {
  x: string;
  a: number;
  b: number;
}
export interface DashboardListItem {
  primary: string;
  secondary: string;
  status: string;
  tone?: "success" | "warning" | "info" | "destructive";
}
export interface SalesDashboardData {
  metrics: DashboardMetric[];
  trend: DashboardPoint[];
  top_products: DashboardListItem[];
}

export function useSalesDashboard() {
  return useQuery({
    queryKey: ["dashboard", "sales"],
    queryFn: async (): Promise<SalesDashboardData> => {
      const { data, error } = await supabase.rpc("get_sales_dashboard");
      if (error) throw error;
      return data as unknown as SalesDashboardData;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
