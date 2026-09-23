import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";

const KEY = "sales_salesperson_required";

/** Workspace sales settings (stored in the tenant-scoped config store). */
export function useSalesSettings() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["inventory_config", "sales-settings"],
    queryFn: async () => {
      const { data, error } = await db.from("inventory_config").select("key, value").eq("key", KEY);
      if (error) throw error;
      return (data ?? []) as { key: string; value: string }[];
    },
  });
  const salespersonRequired = rows.find((r) => r.key === KEY)?.value === "true";
  const setSalespersonRequired = useMutation({
    mutationFn: async (value: boolean) => {
      const { error } = await db.rpc("upsert_inventory_config", { _key: KEY, _value: value ? "true" : "false" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sales setting saved.");
      qc.invalidateQueries({ queryKey: ["inventory_config"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not save setting"),
  });
  return { isLoading, salespersonRequired, setSalespersonRequired };
}

/** People in this workspace who can be picked as salesperson. */
export function useSalespeople() {
  const { tenant } = useAuth();
  return useQuery({
    queryKey: ["profiles", "salespeople", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("profiles")
        .select("id, full_name, email")
        .eq("tenant_id", tenant!.id)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string | null; email: string | null }[];
    },
  });
}
