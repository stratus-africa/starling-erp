import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DocumentEvent {
  id: string;
  entity_type: string;
  entity_id: string;
  status: string;
  note: string | null;
  actor_email: string | null;
  created_at: string;
}

export async function logDocumentEvent(opts: {
  tenantId: string;
  entityType: string;
  entityId: string;
  status: string;
  note?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
}) {
  await supabase.from("document_events" as any).insert({
    tenant_id: opts.tenantId,
    entity_type: opts.entityType,
    entity_id: opts.entityId,
    status: opts.status,
    note: opts.note ?? null,
    actor_id: opts.actorId ?? null,
    actor_email: opts.actorEmail ?? null,
  });
}

export function useDocumentEvents(entityType: string, entityId: string | null) {
  return useQuery({
    queryKey: ["document_events", entityType, entityId],
    enabled: !!entityId && entityId !== "new",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_events" as any)
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as DocumentEvent[];
    },
  });
}
