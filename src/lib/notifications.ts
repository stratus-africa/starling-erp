import { supabase } from "@/integrations/supabase/client";

export const NOTIFICATION_TYPES = {
  approvalRequired: "approval_required",
  approvalApproved: "approval_approved",
  approvalRejected: "approval_rejected",
  lowStock: "low_stock",
  invoiceOverdue: "invoice_overdue",
  paymentReceived: "payment_received",
  purchaseReceived: "purchase_received",
  shipmentDispatched: "shipment_dispatched",
  accountingPostingFailed: "accounting_posting_failed",
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];
export type NotificationSeverity = "info" | "success" | "warning" | "error";

export interface AppNotification {
  id: string;
  user_id: string;
  tenant_id: string;
  type: NotificationType;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  severity: NotificationSeverity;
  read_at: string | null;
  created_at: string;
}

export async function getMyNotifications(limit = 30): Promise<AppNotification[]> {
  const { data, error } = await supabase.rpc("get_my_notifications", { _limit: limit });
  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { data, error } = await supabase.rpc("get_my_notification_unread_count");
  if (error) throw error;
  return Number(data ?? 0);
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.rpc("mark_notification_read", { _notification_id: id });
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) throw error;
}

export async function createNotification(input: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  severity?: NotificationSeverity;
}): Promise<string> {
  const { data, error } = await supabase.rpc("create_notification", {
    _user_id: input.userId,
    _type: input.type,
    _title: input.title,
    _message: input.message,
    _entity_type: input.entityType ?? null,
    _entity_id: input.entityId ?? null,
    _severity: input.severity ?? "info",
  });
  if (error) throw error;
  return String(data);
}

export function playNotificationChime() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1320, context.currentTime + 0.09);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.23);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // Browsers can reject audio until the user has interacted with the page.
  }
}
