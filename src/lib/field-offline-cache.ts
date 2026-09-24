// Keeps the lists the Field Sales app needs (customers, items, open invoices,
// deposit accounts, tax rates) on the phone so forms still work with no signal.
// Read-only copies only — every write still goes through the sync queue.
import type { QueryClient } from "@tanstack/react-query";

const KEY = "field-sales-cache-v1";
const ROOTS = new Set(["customers", "items", "invoices", "bank_accounts", "tax_rates", "field-items", "taxes"]);
const MAX_AGE = 1000 * 60 * 60 * 24 * 14;

type Entry = { key: unknown[]; data: unknown; at: number };

function read(): Record<string, Entry> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; }
}

export function startFieldOfflineCache(qc: QueryClient) {
  if (typeof window === "undefined") return () => {};
  const store = read();
  const now = Date.now();
  for (const [h, e] of Object.entries(store)) {
    if (now - e.at > MAX_AGE) { delete store[h]; continue; }
    if (qc.getQueryData(e.key) === undefined) qc.setQueryData(e.key, e.data, { updatedAt: 0 });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* storage full — skip */ }
  };
  const unsub = qc.getQueryCache().subscribe((ev) => {
    const q = ev.query;
    const root = String((q.queryKey as unknown[])[0] ?? "");
    if (!ROOTS.has(root) || q.state.status !== "success" || q.state.dataUpdatedAt === 0) return;
    store[q.queryHash] = { key: q.queryKey as unknown[], data: q.state.data, at: q.state.dataUpdatedAt };
    clearTimeout(timer);
    timer = setTimeout(flush, 500);
  });
  return () => { unsub(); clearTimeout(timer); flush(); };
}
