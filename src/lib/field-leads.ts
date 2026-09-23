import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";

export const LEAD_STATUSES = ["New", "Contacted", "Qualified", "Unqualified", "Converted", "Lost"] as const;
export const LEAD_SOURCES = ["Walk-in", "Referral", "Phone", "Website", "Social media", "Event", "Other"];

export function useLeads(enabled: boolean) {
  return useQuery({
    queryKey: ["crm_leads"],
    enabled,
    queryFn: async () => {
      const { data, error } = await db.from("crm_leads").select("*, assignee:profiles!crm_leads_assigned_to_fkey(full_name,email)").is("deleted_at", null).order("last_activity_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}
