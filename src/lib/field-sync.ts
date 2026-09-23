// Offline-safe outbox for the Field Sales app.
// Every write is queued locally first, then sent to the same backend actions the web app uses.
// Nothing counts as recorded until the server confirms it.
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/typed-db";

export type SyncStatus = "saved_offline" | "pending" | "syncing" | "synced" | "failed";
export type OutboxKind = "customer" | "customer_update" | "lead" | "lead_update" | "quote" | "order" | "payment";

export interface OutboxItem {
  id: string; // client id; also used as the record id where possible (idempotency)
  kind: OutboxKind;
  label: string;
  payload: any;
  status: SyncStatus;
  error?: string;
  serverId?: string;
  createdAt: number;
  attempts: number;
}

const KEY = "field-sales-outbox-v1";
let items: OutboxItem[] = [];
const listeners = new Set<() => void>();
let loaded = false;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try { items = JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { items = []; }
  // anything interrupted mid-sync goes back to pending
  items = items.map((i) => (i.status === "syncing" ? { ...i, status: "pending" } : i));
}
function save() {
  if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(items.slice(-200)));
  listeners.forEach((l) => l());
}
function patch(id: string, p: Partial<OutboxItem>) {
  items = items.map((i) => (i.id === id ? { ...i, ...p } : i));
  save();
}

export function useOutbox(): OutboxItem[] {
  return useSyncExternalStore(
    (cb) => { load(); listeners.add(cb); return () => listeners.delete(cb); },
    () => { load(); return items; },
    () => [],
  );
}

export function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function newClientId() {
  return crypto.randomUUID();
}

/** Queue a write and try to send it right away. Resolves with the synced item (or the queued item if offline/failed). */
export async function enqueue(item: Omit<OutboxItem, "status" | "createdAt" | "attempts">): Promise<OutboxItem> {
  load();
  const full: OutboxItem = { ...item, status: isOnline() ? "pending" : "saved_offline", createdAt: Date.now(), attempts: 0 };
  items = [...items.filter((i) => i.id !== item.id), full];
  save();
  if (isOnline()) await process(full.id);
  return items.find((i) => i.id === full.id)!;
}

export function removeItem(id: string) {
  items = items.filter((i) => i.id !== id);
  save();
}
export function clearSynced() {
  items = items.filter((i) => i.status !== "synced");
  save();
}

const isDuplicate = (e: any) => e?.code === "23505";

async function send(it: OutboxItem): Promise<string> {
  const p = it.payload;
  switch (it.kind) {
    case "customer": {
      const { error } = await supabase.from("customers").insert({ ...p, id: it.id });
      if (error && !isDuplicate(error)) throw error;
      return it.id;
    }
    case "customer_update": {
      const { id, ...rest } = p;
      const { error } = await supabase.from("customers").update(rest).eq("id", id);
      if (error) throw error;
      return id;
    }
    case "lead": {
      const { error } = await db.from("crm_leads").insert({ ...p, id: it.id });
      if (error && !isDuplicate(error)) throw error;
      return it.id;
    }
    case "lead_update": {
      const { id, ...rest } = p;
      const { error } = await db.from("crm_leads").update(rest).eq("id", id);
      if (error) throw error;
      return id;
    }
    case "quote":
    case "order": {
      const table = it.kind === "quote" ? "sales_quotes" : "sales_orders";
      const linesTable = it.kind === "quote" ? "sales_quote_lines" : "sales_order_lines";
      const docId: string = p.docId ?? it.id;
      if (p.docId) {
        const { error } = await db.from(table).update(p.header).eq("id", docId);
        if (error) throw error;
        const { error: de } = await db.from(linesTable).update({ deleted_at: new Date().toISOString() }).eq("document_id", docId).is("deleted_at", null);
        if (de) throw de;
      } else {
        const { error } = await db.from(table).insert({ ...p.header, id: docId });
        if (error && !isDuplicate(error)) throw error;
        if (error && isDuplicate(error)) {
          // header landed on an earlier attempt — replace lines to stay idempotent
          await db.from(linesTable).update({ deleted_at: new Date().toISOString() }).eq("document_id", docId).is("deleted_at", null);
        }
      }
      const lines = (p.lines as any[]).map((l) => ({ ...l, document_id: docId, tenant_id: p.header.tenant_id }));
      const { error: le } = await db.from(linesTable).insert(lines);
      if (le) throw le;
      if (p.finalize) {
        const rpc = it.kind === "quote" ? "transition_quote" : "transition_sales_order";
        const key = it.kind === "quote" ? "_quote_id" : "_order_id";
        const { error: te } = await (supabase as any).rpc(rpc, { [key]: docId, _new_status: p.finalize, _reason: "Created from Field Sales" });
        if (te) throw new Error(`Saved as draft, but could not mark ${p.finalize}: ${te.message}`);
      }
      return docId;
    }
    case "payment": {
      // idempotency: the client ref is stamped in the notes; skip if already recorded
      const tag = `[m:${it.id.slice(0, 8)}]`;
      const { data: existing } = await supabase.from("payments_received").select("id").eq("customer_id", p._customer_id).ilike("notes", `%${tag}%`).maybeSingle();
      if (existing?.id) return existing.id;
      const args = { ...p, _notes: `${p._notes ? p._notes + " " : ""}${tag}` };
      const rpc = (p._allocations?.length ?? 0) > 0 ? "create_and_post_customer_payment" : "create_customer_payment";
      if (rpc === "create_customer_payment") delete (args as any)._allocations;
      const { data, error } = await (supabase as any).rpc(rpc, args);
      if (error) throw error;
      return String(data);
    }
  }
}

const inflight = new Set<string>();
export async function process(id: string) {
  const it = items.find((i) => i.id === id);
  if (!it || it.status === "synced" || inflight.has(id)) return;
  if (!isOnline()) { patch(id, { status: "saved_offline" }); return; }
  inflight.add(id);
  patch(id, { status: "syncing", attempts: it.attempts + 1 });
  try {
    const serverId = await send(it);
    patch(id, { status: "synced", serverId, error: undefined });
  } catch (e: any) {
    const offline = !isOnline() || e?.message === "Failed to fetch";
    patch(id, { status: offline ? "saved_offline" : "failed", error: e?.message ?? "Sync failed" });
    if (!offline) {
      const { data: u } = await supabase.auth.getUser();
      const { data: prof } = u.user ? await supabase.from("profiles").select("tenant_id").eq("id", u.user.id).maybeSingle() : { data: null };
      if (u.user && prof?.tenant_id)
        await supabase.from("notifications").insert({ tenant_id: prof.tenant_id, user_id: u.user.id, type: "sync_failed", title: "Sync failed", message: `${it.label}: ${e?.message ?? "error"}`, severity: "error" }).then(() => {}, () => {});
    }
  } finally {
    inflight.delete(id);
  }
}

export async function syncAll() {
  load();
  for (const i of items.filter((x) => x.status !== "synced")) await process(i.id);
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => { void syncAll(); });
  window.addEventListener("offline", () => listeners.forEach((l) => l()));
}

export const statusLabel: Record<SyncStatus, string> = {
  saved_offline: "Saved offline",
  pending: "Pending sync",
  syncing: "Syncing…",
  synced: "Synced",
  failed: "Sync failed",
};
