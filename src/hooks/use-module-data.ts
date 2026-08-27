import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "./use-auth";

export interface ListOpts {
  search?: string;
  searchColumn?: string;
  orderBy?: string;
  orderAsc?: boolean;
  page?: number;
  pageSize?: number;
  filters?: Record<string, string | undefined>;
}

export function useModuleList(table: string, opts: ListOpts = {}) {
  const { search, searchColumn = "name", orderBy = "created_at", orderAsc = false, page = 1, pageSize = 25, filters } = opts;
  return useQuery({
    queryKey: [table, "list", { search, searchColumn, orderBy, orderAsc, page, pageSize, filters }],
    queryFn: async () => {
      let q = supabase.from(table as any).select("*", { count: "exact" }).is("deleted_at", null);
      if (search && search.trim()) q = q.ilike(searchColumn, `%${search.trim()}%`);
      for (const [k, v] of Object.entries(filters ?? {})) {
        if (v != null && v !== "" && v !== "all") q = q.eq(k, v);
      }
      q = q.order(orderBy, { ascending: orderAsc }).range((page - 1) * pageSize, page * pageSize - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as any[], count: count ?? 0 };
    },
  });
}

export function useModuleMutations(table: string) {
  const qc = useQueryClient();
  const { tenant } = useAuth();
  const invalidate = () => qc.invalidateQueries({ queryKey: [table, "list"] });

  const create = useMutation({
    mutationFn: async (values: Record<string, any>) => {
      if (!tenant?.id) throw new Error("No tenant");
      const payload = { ...values, tenant_id: tenant.id };
      const { data, error } = await supabase.from(table as any).insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { toast.success("Created"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Create failed"),
  });

  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, any> }) => {
      const { data, error } = await supabase.from(table as any).update(values).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { toast.success("Updated"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table as any).update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  return { create, update, remove };
}

export function useFkOptions(table: string, labelCol = "name") {
  return useQuery({
    queryKey: [table, "fk-options", labelCol],
    queryFn: async () => {
      const { data, error } = await supabase.from(table as any).select(`id, ${labelCol}`).is("deleted_at", null).order(labelCol);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 30_000,
  });
}
