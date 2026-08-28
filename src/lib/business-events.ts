import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/typed-db";

export type BusinessEventAction =
  | "created"
  | "updated"
  | "approved"
  | "posted"
  | "voided"
  | "reconciled"
  | "received"
  | "applied"
  | "deleted"
  | "rejected"
  | "cancelled";

export interface BusinessEvent {
  id: string;
  tenant_id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  occurred_at: string;
  created_at: string;
}

export async function recordBusinessEvent(input: {
  action: BusinessEventAction | string;
  entityType: string;
  entityId?: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const { data, error } = await db.rpc("record_business_event", {
    _action: input.action,
    _entity_type: input.entityType,
    _entity_id: input.entityId ?? null,
    _old_values: input.oldValues ?? null,
    _new_values: input.newValues ?? null,
    _metadata: input.metadata ?? {},
  });
  if (error) throw error;
  return String(data);
}

export async function getBusinessEvents(options: {
  limit?: number;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
} = {}): Promise<BusinessEvent[]> {
  const { data, error } = await db.rpc("get_business_events", {
    _limit: options.limit ?? 100,
    _action: options.action ?? null,
    _entity_type: options.entityType ?? null,
    _entity_id: options.entityId ?? null,
    _from: options.from ?? null,
    _to: options.to ?? null,
  });
  if (error) throw error;
  return (data ?? []) as BusinessEvent[];
}

export const BUSINESS_EVENT_LABELS: Record<string, string> = {
  created: "Created",
  approved: "Approved",
  posted: "Posted",
  voided: "Voided",
  received: "Received",
  applied: "Applied",
  reconciled: "Reconciled",
  rejected: "Rejected",
  cancelled: "Cancelled",
  updated: "Updated",
  deleted: "Deleted",
};
