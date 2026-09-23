import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/typed-db";

export const INVENTORY_MODULES = [
  { key: "module_serials", url: "/inventory/serials", title: "Serial Numbers", description: "Track individual units by serial number." },
  { key: "module_lots", url: "/inventory/lots", title: "Lots & Batches", description: "Track stock by lot or batch with expiry dates." },
  { key: "module_adjustments", url: "/inventory/adjustments", title: "Adjustments", description: "Manually correct stock quantities." },
] as const;

export function useInventoryModules() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["inventory_config", "modules"],
    queryFn: async () => {
      const { data, error } = await db
        .from("inventory_config")
        .select("key, value")
        .in("key", INVENTORY_MODULES.map((m) => m.key));
      if (error) throw error;
      return (data ?? []) as { key: string; value: string }[];
    },
  });
  // Enabled by default until switched off.
  const isEnabled = (key: string) => rows.find((r) => r.key === key)?.value !== "false";
  const isUrlEnabled = (url: string) => {
    const m = INVENTORY_MODULES.find((x) => x.url === url);
    return !m || isEnabled(m.key);
  };
  const setEnabled = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: boolean }) => {
      const { error } = await db.rpc("upsert_inventory_config", { _key: key, _value: value ? "true" : "false" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Inventory setting saved.");
      qc.invalidateQueries({ queryKey: ["inventory_config"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not save setting"),
  });
  return { isLoading, isEnabled, isUrlEnabled, setEnabled };
}
