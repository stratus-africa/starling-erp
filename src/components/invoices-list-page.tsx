import { useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Plus, Search, Loader2, MoreHorizontal, Receipt } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Types ────────────────────────────────────────────────────────────────────

export type InvoiceKind = "invoice" | "bill";

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

const moneyFmt = (amount: number | null | undefined, currency: string) => {
  if (amount == null) return "—";
  const formatted = Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency}${formatted}`;
};

const summaryMoney = (amount: number, currency = "KES") =>
  `${currency}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Returns a human-readable due status and its color class */
function getDueStatus(dueDate: string | null, status: string | null): { label: string; color: string } {
  if (status === "Paid" || status === "Voided" || status === "Cancelled") {
    return { label: status.toUpperCase(), color: "text-emerald-600" };
  }
  if (!dueDate) return { label: status?.toUpperCase() ?? "—", color: "text-muted-foreground" };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (diffDays < 0) {
    const abs = Math.abs(diffDays);
    return {
      label: `OVERDUE BY ${abs} DAY${abs !== 1 ? "S" : ""}`,
      color: "text-destructive",
    };
  }
  if (diffDays === 0) return { label: "DUE TODAY", color: "text-amber-500" };
  return { label: `DUE IN ${diffDays} DAY${diffDays !== 1 ? "S" : ""}`, color: "text-blue-500" };
}

// ─── Payment Summary Bar ──────────────────────────────────────────────────────

function PaymentSummaryBar({ rows, currency, kind }: { rows: any[]; currency: string; kind: InvoiceKind }) {
  const isBill = kind === "bill";
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const unpaid = rows.filter((r) => r.status !== "Paid" && r.status !== "Voided" && r.status !== "Cancelled");

  const totalOutstanding = unpaid.reduce((s, r) => s + Number(r.balance_due ?? r.grand_total ?? 0), 0);

  const dueToday = unpaid
    .filter((r) => {
      if (!r.due_date) return false;
      const d = new Date(r.due_date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime();
    })
    .reduce((s, r) => s + Number(r.balance_due ?? 0), 0);

  const dueIn30 = unpaid
    .filter((r) => {
      if (!r.due_date) return false;
      const d = new Date(r.due_date);
      d.setHours(0, 0, 0, 0);
      const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
      return diff > 0 && diff <= 30;
    })
    .reduce((s, r) => s + Number(r.balance_due ?? 0), 0);

  const overdue = unpaid
    .filter((r) => {
      if (!r.due_date) return false;
      const d = new Date(r.due_date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() < today.getTime();
    })
    .reduce((s, r) => s + Number(r.balance_due ?? 0), 0);

  // Avg days to pay (bills) / avg days to get paid (invoices)
  const paidWithDates = rows.filter((r) => r.status === "Paid" && r.due_date && r.updated_at);
  const avgDays =
    paidWithDates.length > 0
      ? Math.round(
          paidWithDates.reduce((s, r) => {
            const paid = new Date(r.updated_at);
            const due = new Date(r.due_date);
            return s + Math.max(0, Math.round((paid.getTime() - due.getTime()) / 86_400_000));
          }, 0) / paidWithDates.length,
        )
      : null;

  const stats = isBill
    ? [
        {
          label: "Total Outstanding Payables",
          value: summaryMoney(totalOutstanding, currency),
          highlight: false,
          bold: true,
          accent: "",
        },
        {
          label: "Due Today",
          value: summaryMoney(dueToday, currency),
          highlight: dueToday > 0,
          bold: false,
          accent: dueToday > 0 ? "text-amber-500" : "",
        },
        {
          label: "Due Within 30 Days",
          value: summaryMoney(dueIn30, currency),
          highlight: false,
          bold: false,
          accent: "",
        },
        {
          label: "Overdue Bills",
          value: summaryMoney(overdue, currency),
          highlight: overdue > 0,
          bold: false,
          accent: overdue > 0 ? "text-destructive" : "",
        },
        {
          label: "Avg. No. of Days to Pay",
          value: avgDays != null ? `${avgDays} Days` : "—",
          highlight: false,
          bold: true,
          accent: "",
        },
      ]
    : [
        {
          label: "Total Outstanding Receivables",
          value: summaryMoney(totalOutstanding, currency),
          highlight: false,
          bold: true,
          accent: "",
        },
        {
          label: "Due Today",
          value: summaryMoney(dueToday, currency),
          highlight: dueToday > 0,
          bold: false,
          accent: dueToday > 0 ? "text-amber-500" : "",
        },
        {
          label: "Due Within 30 Days",
          value: summaryMoney(dueIn30, currency),
          highlight: false,
          bold: false,
          accent: "",
        },
        {
          label: "Overdue Invoice",
          value: summaryMoney(overdue, currency),
          highlight: overdue > 0,
          bold: false,
          accent: overdue > 0 ? "text-destructive" : "",
        },
        {
          label: "Average No. of Days for Getting Paid",
          value: avgDays != null ? `${avgDays} Days` : "—",
          highlight: false,
          bold: true,
          accent: "",
        },
      ];

  return (
    <div className="mx-6 mt-3 mb-1 rounded-lg border bg-muted/30 px-5 py-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Payment Summary</p>
      <div className="grid gap-0" style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
        {stats.map((s, i) => (
          <div key={i} className={`flex flex-col gap-0.5 pr-4 ${i > 0 ? "border-l pl-4" : ""}`}>
            <span className="text-[11px] text-muted-foreground">{s.label}</span>
            <span
              className={`font-mono text-sm tabular-nums ${
                s.bold ? "font-semibold text-foreground" : ""
              } ${s.accent || ""}`}
            >
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
// ─── Main Component ───────────────────────────────────────────────────────────

interface InvoicesListPageProps {
  kind: InvoiceKind;
}

export function InvoicesListPage({ kind }: InvoicesListPageProps) {
  const navigate = useNavigate();
  const { can } = useAuth();

  const isInvoice = kind === "invoice";
  const table = isInvoice ? "invoices" : "bills";
  const partyTable = isInvoice ? "customers" : "suppliers";
  const partyField = isInvoice ? "customer_id" : "supplier_id";
  const sourceField = isInvoice ? "source_order_id" : "source_po_id";
  const detailBase = isInvoice ? "/sales/invoices" : "/purchasing/bills";
  const numLabel = isInvoice ? "Invoice#" : "Bill#";
  const orderLabel = isInvoice ? "Order Number" : "PO Number";
  const partyLabel = isInvoice ? "Customer Name" : "Supplier Name";
  const amountLabel = isInvoice ? "Invoice Amount" : "Bill Amount";
  const title = isInvoice ? "All Invoices" : "All Bills";
  const createPermission = isInvoice ? "sales.create" : "purchasing.create";
  const canCreate = can(createPermission);

  const allStatuses = isInvoice
    ? ["Draft", "Sent", "Posted", "Paid", "Overdue", "Cancelled"]
    : ["Pending", "Posted", "Paid", "Overdue", "Cancelled"];

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── Fetch all unpaid for summary (no pagination) ──
  const { data: allUnpaid = [] } = useQuery({
    queryKey: [table, "summary"],
    queryFn: async () => {
      const { data } = await db.from(table as any)
        .select("balance_due, grand_total, due_date, status, updated_at, currency")
        .is("deleted_at", null)
        .limit(2000);
      return (data ?? []) as any[];
    },
    staleTime: 30_000,
  });

  // Derive dominant currency from data
  const dominantCurrency = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of allUnpaid) counts[r.currency] = (counts[r.currency] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "KES";
  }, [allUnpaid]);

  // ── Fetch paginated rows ──
  const { data, isLoading } = useQuery({
    queryKey: [table, "list", { search, statusFilter, page }],
    queryFn: async () => {
      let q = db.from(table as any)
        .select("*", { count: "exact" })
        .is("deleted_at", null)
        .order("date", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      if (search.trim()) q = (q as any).ilike("number", `%${search.trim()}%`);
      if (statusFilter !== "all") q = (q as any).eq("status", statusFilter);
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
    [rows, partyField],
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
  const partyMap = useMemo(() => Object.fromEntries(parties.map((p) => [p.id, p.name])), [parties]);

  // ── Batch-fetch source order/PO numbers ──
  const sourceIds = useMemo(
    () => Array.from(new Set(rows.map((r: any) => r[sourceField]).filter(Boolean))),
    [rows, sourceField],
  );
  const sourceTable = isInvoice ? "sales_orders" : "purchase_orders";
  const { data: sourceOrders = [] } = useQuery({
    queryKey: [sourceTable, "numbers", sourceIds],
    enabled: sourceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await db.from(sourceTable as any)
        .select("id,number")
        .in("id", sourceIds as string[]);
      if (error) throw error;
      return (data ?? []) as { id: string; number: string }[];
    },
    staleTime: 60_000,
  });
  const sourceMap = useMemo(() => Object.fromEntries(sourceOrders.map((o) => [o.id, o.number])), [sourceOrders]);

  // ── Selection ──
  const allOnPageSelected = rows.length > 0 && rows.every((r: any) => selected.has(r.id));
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

  const openDetail = (id: string) => navigate({ to: `${detailBase}/$id` as any, params: { id } });

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-background">
      {/* ── Header ── */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-6 py-3">
        <h1 className="flex items-center gap-1.5 text-base font-semibold tracking-tight">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          {title}
          <span className="text-muted-foreground text-sm font-normal">▾</span>
        </h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 w-48 pl-8 text-xs"
              placeholder={`Search ${isInvoice ? "invoice" : "bill"} #…`}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {allStatuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canCreate && (
            <Button size="sm" className="h-8" onClick={() => openDetail("new")}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 w-8 px-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setPage(1);
                }}
              >
                Clear filters
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Payment Summary ── */}
      <PaymentSummaryBar rows={allUnpaid} currency={dominantCurrency} kind={kind} />

      {/* ── Table ── */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
            <tr className="border-b text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="w-9 px-3 py-2.5 text-left">
                <Checkbox checked={allOnPageSelected} onCheckedChange={toggleAll} aria-label="Select all" />
              </th>
              <th className="px-3 py-2.5 text-left whitespace-nowrap">Date</th>
              <th className="px-3 py-2.5 text-left whitespace-nowrap">{numLabel}</th>
              <th className="px-3 py-2.5 text-left whitespace-nowrap">{orderLabel}</th>
              <th className="px-3 py-2.5 text-left">{partyLabel}</th>
              <th className="px-3 py-2.5 text-left whitespace-nowrap">Invoice Status</th>
              <th className="px-3 py-2.5 text-left whitespace-nowrap">Due Date</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">{amountLabel}</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">Balance</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={9} className="py-16 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-16 text-center text-xs text-muted-foreground">
                  No {isInvoice ? "invoices" : "bills"} found.
                </td>
              </tr>
            )}
            {rows.map((row: any) => {
              const partyName = row[partyField] ? (partyMap[row[partyField]] ?? "—") : "—";
              const sourceNumber = row[sourceField]
                ? (sourceMap[row[sourceField]] ?? row.notes ?? "—")
                : (row.notes ?? "—");
              const { label: dueLabel, color: dueColor } = getDueStatus(row.due_date, row.status);
              const balance = row.balance_due ?? row.balance ?? 0;

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
                  <td className="px-3 py-2.5" data-no-nav>
                    <Checkbox
                      checked={selected.has(row.id)}
                      onCheckedChange={() => toggleRow(row.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>

                  {/* Date */}
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmt(row.date)}</td>

                  {/* Invoice / Bill number */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="font-mono text-xs font-semibold text-primary">{row.number ?? "—"}</span>
                  </td>

                  {/* Source order number */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="font-mono text-xs text-muted-foreground">{sourceNumber}</span>
                  </td>

                  {/* Party name */}
                  <td className="px-3 py-2.5 max-w-[240px]">
                    <span
                      className={`text-sm leading-snug ${balance > 0 && row.due_date && new Date(row.due_date) < new Date() ? "text-destructive font-medium" : ""}`}
                    >
                      {partyName}
                    </span>
                  </td>

                  {/* Due status */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={`text-[11px] font-semibold tracking-wide ${dueColor}`}>{dueLabel}</span>
                  </td>

                  {/* Due date */}
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmt(row.due_date)}</td>

                  {/* Invoice amount */}
                  <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                    {moneyFmt(row.grand_total ?? row.amount, row.currency)}
                  </td>

                  {/* Balance due */}
                  <td
                    className={`px-3 py-2.5 text-right font-mono text-xs tabular-nums whitespace-nowrap ${balance > 0 ? "font-semibold" : "text-muted-foreground"}`}
                  >
                    {moneyFmt(balance, row.currency)}
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
          {total} {isInvoice ? "invoice" : "bill"}
          {total !== 1 ? "s" : ""}
          {total > 0 ? ` · page ${page} of ${totalPages}` : ""}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
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
