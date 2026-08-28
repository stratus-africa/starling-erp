import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Search, Loader2, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentKind = "received" | "made";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const fmt = (v: string | null | undefined) =>
  !v
    ? "—"
    : new Date(v).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

const moneyFmt = (amount: number | null | undefined, currency = "KES") => {
  if (amount == null) return "—";
  const formatted = Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency}${formatted}`;
};

// ─── Summary Bar ──────────────────────────────────────────────────────────────

function SummaryBar({
  rows,
  kind,
}: {
  rows: any[];
  kind: PaymentKind;
}) {
  const total = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const thisMonth = rows.filter((r) => {
    if (!r.date) return false;
    const d = new Date(r.date);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const thisMonthTotal = thisMonth.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  // Dominant currency
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const c = r.currency ?? "KES";
    counts[c] = (counts[c] ?? 0) + 1;
  }
  const currency = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "KES";

  const label = kind === "received" ? "Total Received" : "Total Paid Out";
  const monthLabel = kind === "received" ? "Received This Month" : "Paid This Month";

  return (
    <div className="mx-6 mt-3 mb-1 rounded-lg border bg-muted/30 px-5 py-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Payment Summary
      </p>
      <div className="flex flex-wrap items-start gap-x-10 gap-y-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">{label}</span>
          <span className="font-mono text-sm font-semibold tabular-nums">
            {moneyFmt(total, currency)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">{monthLabel}</span>
          <span className="font-mono text-sm tabular-nums text-blue-600 font-semibold">
            {moneyFmt(thisMonthTotal, currency)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">Transactions</span>
          <span className="font-mono text-sm tabular-nums">{rows.length.toLocaleString()}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">This Month</span>
          <span className="font-mono text-sm tabular-nums">{thisMonth.length.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PaymentsListPage({ kind }: { kind: PaymentKind }) {
  const { } = useAuth(); // reserved for future permission checks

  const isReceived = kind === "received";
  const table = isReceived ? "payments_received" : "payments_made";
  const partyTable = isReceived ? "customers" : "suppliers";
  const partyField = isReceived ? "customer_id" : "supplier_id";
  const title = isReceived ? "All Received Payments" : "All Payments Made";
  const partyLabel = isReceived ? "Customer Name" : "Supplier Name";
  const invoiceLabel = isReceived ? "Invoice#" : "Bill#";

  const [search, setSearch] = useState("");
  const [modeFilter, setModeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── Summary data (all rows, no pagination) ──
  const { data: allRows = [] } = useQuery({
    queryKey: [table, "summary"],
    queryFn: async () => {
      const { data } = await db.from(table as any)
        .select("amount, date, currency")
        .is("deleted_at", null)
        .limit(5000);
      return (data ?? []) as any[];
    },
    staleTime: 30_000,
  });

  // ── Paginated rows ──
  const { data, isLoading } = useQuery({
    queryKey: [table, "list", { search, modeFilter, page }],
    queryFn: async () => {
      let q = db.from(table as any)
        .select("*", { count: "exact" })
        .is("deleted_at", null)
        .order("date", { ascending: false })
        .order("number", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      if (search.trim()) q = (q as any).ilike("number", `%${search.trim()}%`);
      if (modeFilter !== "all") q = (q as any).eq("mode", modeFilter);

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as any[], count: count ?? 0 };
    },
    staleTime: 10_000,
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Batch-fetch party names ──
  const partyIds = useMemo(
    () => Array.from(new Set(rows.map((r: any) => r[partyField]).filter(Boolean))),
    [rows, partyField]
  );
  const { data: parties = [] } = useQuery({
    queryKey: [partyTable, "names", partyIds],
    enabled: partyIds.length > 0,
    queryFn: async () => {
      const { data, error } = await db.from(partyTable as any)
        .select("id,name")
        .in("id", partyIds as string[]);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    staleTime: 60_000,
  });
  const partyMap = useMemo(
    () => Object.fromEntries(parties.map((p) => [p.id, p.name])),
    [parties]
  );

  // ── Selection ──
  const allOnPageSelected =
    rows.length > 0 && rows.every((r: any) => selected.has(r.id));
  const toggleAll = () => {
    if (allOnPageSelected) {
      setSelected((s) => {
        const n = new Set(s);
        rows.forEach((r: any) => n.delete(r.id));
        return n;
      });
    } else {
      setSelected((s) => {
        const n = new Set(s);
        rows.forEach((r: any) => n.add(r.id));
        return n;
      });
    }
  };
  const toggleRow = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  // Payments don't have individual detail routes — clicking a row is a no-op
  // (they are created via RecordPaymentDialog from invoices/bills)
  const openDetail = (_id: string) => {
    // no-op: individual payment records are viewed inline
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-background">

      {/* ── Header ── */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-6 py-3">
        <h1 className="flex items-center gap-1.5 text-base font-semibold tracking-tight">
          {title}
          <span className="text-muted-foreground text-sm font-normal">▾</span>
        </h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 w-44 pl-8 text-xs"
              placeholder="Search payment #…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select value={modeFilter} onValueChange={(v) => { setModeFilter(v); setPage(1); }}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="All Modes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modes</SelectItem>
              {["Cash", "Bank Transfer", "M-Pesa", "Card", "Cheque", "EFT", "Mobile Money"].map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* No "New" button — payments are created from invoices/bills */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 w-8 px-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => { setSearch(""); setModeFilter("all"); setPage(1); }}
              >
                Clear filters
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Summary Bar ── */}
      <SummaryBar rows={allRows} kind={kind} />

      {/* ── Table ── */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
            <tr className="border-b text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="w-9 px-3 py-2.5 text-left">
                <Checkbox
                  checked={allOnPageSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className="px-3 py-2.5 text-left whitespace-nowrap">Date ↕</th>
              <th className="px-3 py-2.5 text-left whitespace-nowrap">Payment#</th>
              <th className="px-3 py-2.5 text-left whitespace-nowrap">Payment Type</th>
              <th className="px-3 py-2.5 text-left whitespace-nowrap">Reference#</th>
              <th className="px-3 py-2.5 text-left">{partyLabel}</th>
              <th className="px-3 py-2.5 text-left">{invoiceLabel}</th>
              <th className="px-3 py-2.5 text-left whitespace-nowrap">Mode</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">Amount</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">Unused Amount</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={10} className="py-16 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="py-16 text-center text-xs text-muted-foreground">
                  No {isReceived ? "payments received" : "payments made"} found.
                </td>
              </tr>
            )}
            {rows.map((row: any) => {
              const partyName = row[partyField]
                ? (partyMap[row[partyField]] ?? "—")
                : "—";

              // invoice# comes from reference field (stored as invoice numbers)
              // or from the notes field
              const invoiceNums = row.reference ?? row.notes ?? "—";

              // Unused amount = amount not applied to any invoice
              // We treat it as 0 if there's a reference (fully applied)
              const unusedAmount = row.reference ? 0 : (row.amount ?? 0);

              const isOverdue = row.voided_at || row.reversal_id;
              const partyIsOverdue = false; // payments don't have overdue state like invoices

              return (
                <tr
                  key={row.id}
                  className="group cursor-pointer border-b transition-colors hover:bg-muted/40"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("[data-no-nav]")) return;
                    openDetail(row.id);
                  }}
                >
                  {/* Checkbox */}
                  <td className="px-3 py-2" data-no-nav>
                    <Checkbox
                      checked={selected.has(row.id)}
                      onCheckedChange={() => toggleRow(row.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>

                  {/* Date */}
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                    {fmt(row.date)}
                  </td>

                  {/* Payment number */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="font-mono text-xs font-semibold text-primary">
                      {row.number ?? "—"}
                    </span>
                  </td>

                  {/* Payment type */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="text-xs text-primary font-medium">
                      {isReceived ? "Invoice Payment" : "Bill Payment"}
                    </span>
                  </td>

                  {/* Reference */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="font-mono text-xs text-muted-foreground">
                      {row.reference ?? "—"}
                    </span>
                  </td>

                  {/* Party name */}
                  <td className="px-3 py-2 max-w-[200px]">
                    <span className={`text-sm leading-snug ${isOverdue ? "text-destructive" : partyIsOverdue ? "text-amber-600" : ""}`}>
                      {partyName}
                    </span>
                  </td>

                  {/* Invoice / Bill numbers */}
                  <td className="px-3 py-2 max-w-[220px]">
                    <span className="font-mono text-xs text-primary line-clamp-2 leading-snug">
                      {invoiceNums}
                    </span>
                  </td>

                  {/* Mode */}
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {row.mode ?? "—"}
                  </td>

                  {/* Amount */}
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums whitespace-nowrap font-medium">
                    {moneyFmt(row.amount, row.currency ?? "KES")}
                  </td>

                  {/* Unused amount */}
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums whitespace-nowrap text-muted-foreground">
                    {moneyFmt(unusedAmount, row.currency ?? "KES")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      <div className="flex shrink-0 items-center justify-between border-t px-6 py-2 text-xs text-muted-foreground">
        <span>
          {selected.size > 0 ? `${selected.size} selected · ` : ""}
          {total} payment{total !== 1 ? "s" : ""}
          {total > 0 ? ` · page ${page} of ${totalPages}` : ""}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline" size="sm" className="h-7 px-2"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline" size="sm" className="h-7 px-2"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
