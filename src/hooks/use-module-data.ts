import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "./use-auth";
import { insertRow, softDeleteRow, updateRow, type Row } from "@/lib/typed-db";

const db = supabase as any;

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
      let q = db.from(table).select("*", { count: "exact" }).is("deleted_at", null);
      if (search && search.trim()) q = q.ilike(searchColumn, `%${search.trim()}%`);
      for (const [k, v] of Object.entries(filters ?? {})) {
        if (v != null && v !== "" && v !== "all") q = q.eq(k, v);
      }
      q = q.order(orderBy, { ascending: orderAsc }).range((page - 1) * pageSize, page * pageSize - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      if (table === "units_of_measure") {
        const seen = new Set<string>();
        const uniqueRows = rows.filter((row) => {
          const key = String(row.code ?? "").trim().toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return { rows: uniqueRows, count: uniqueRows.length };
      }
      return { rows, count: count ?? 0 };
    },
  });
}

export function useModuleMutations(table: string) {
  const qc = useQueryClient();
  const { tenant } = useAuth();
  const invalidate = () => qc.invalidateQueries({ queryKey: [table, "list"] });

  const create = useMutation({
    mutationFn: async (values: Row) => {
      if (!tenant?.id) throw new Error("No tenant");
      const normalizedValues = table === "units_of_measure" && typeof values.code === "string"
        ? { ...values, code: values.code.trim().toLowerCase() }
        : values;
      return insertRow(table, { ...normalizedValues, tenant_id: tenant.id });
    },
    onSuccess: () => { toast.success("Created"); invalidate(); },
    onError: (e: Error) => toast.error(e.message ?? "Create failed"),
  });

  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Row }) => {
      const normalizedValues = table === "units_of_measure" && typeof values.code === "string"
        ? { ...values, code: values.code.trim().toLowerCase() }
        : values;
      await updateRow(table, id, normalizedValues);
      return id;
    },
    onSuccess: () => { toast.success("Updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message ?? "Update failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await softDeleteRow(table, id);
    },
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message ?? "Delete failed"),
  });

  return { create, update, remove };
}

export function useFkOptions(table: string, labelCol: string = "name") {
  return useQuery({
    queryKey: [table, "fk-options", labelCol],
    queryFn: async () => {
      const { data, error } = await db.from(table).select(`id, ${labelCol}`).is("deleted_at", null).order(labelCol);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    staleTime: 30_000,
  });
}
