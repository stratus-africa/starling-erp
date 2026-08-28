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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Plus, Search, Loader2, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrderKind = "sales" | "purchase";

interface StatusDotProps {
  filled: boolean;
  color?: "blue" | "green" | "grey" | "orange";
  tooltip: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: string | null | undefined) =>
  !v
    ? "—"
    : new Date(v).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

const money = (amount: number | null | undefined, currency: string) => {
  if (amount == null) return "—";
  const formatted = Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (["USD", "EUR", "GBP"].includes(currency)) {
    const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : "£";
    return `${sym}${formatted}`;
  }
  return `${currency}${formatted}`;
};

const STATUS_COLORS: Record<string, string> = {
  // Sales order statuses
  Draft:      "text-muted-foreground",
  Confirmed:  "text-blue-500",
  Processing: "text-blue-500",
  Packed:     "text-cyan-500",
  Shipped:    "text-cyan-600",
  Delivered:  "text-emerald-500",
  Invoiced:   "text-emerald-600",
  Closed:     "text-emerald-600",
  Cancelled:  "text-destructive",
  // PO statuses
  Billed:     "text-emerald-600",
};

const PAGE_SIZE = 25;

// ─── Status Dot ───────────────────────────────────────────────────────────────

function StatusDot({ filled, color = "blue", tooltip }: StatusDotProps) {
  const colorMap = {
    blue:   filled ? "bg-blue-500"    : "bg-muted-foreground/20",
    green:  filled ? "bg-emerald-500" : "bg-muted-foreground/20",
    grey:   filled ? "bg-slate-400"   : "bg-muted-foreground/20",
    orange: filled ? "bg-orange-400"  : "bg-muted-foreground/20",
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${colorMap[color]} transition-colors`}
          aria-label={tooltip}
        />
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface OrdersListPageProps {
  kind: OrderKind;
}

export function OrdersListPage({ kind }: OrdersListPageProps) {
  const navigate = useNavigate();
  const { tenant, can } = useAuth();

  const isSales = kind === "sales";
  const table = isSales ? "sales_orders" : "purchase_orders";
  const partyTable = isSales ? "customers" : "suppliers";
  const partyField = isSales ? "customer_id" : "supplier_id";
  const detailBase = isSales ? "/sales/orders" : "/purchasing/orders";
  const createPermission = isSales ? "sales.create" : "purchasing.create";
  const canCreate = can(createPermission);
  const title = isSales ? "All Sales Orders" : "All Purchase Orders";
  const numberPrefix = isSales ? "SO" : "PO";

  const allStatuses = isSales
    ? ["Draft", "Confirmed", "Processing", "Packed", "Shipped", "Delivered", "Invoiced", "Closed", "Cancelled"]
    : ["Draft", "Confirmed", "Processing", "Delivered", "Billed", "Cancelled"];

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── Fetch orders ──
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

  // ── For sales: batch-fetch payment status and pack/ship status ──
  const orderIds = useMemo(() => rows.map((r: any) => r.id), [rows]);

  const { data: payments = [] } = useQuery({
    queryKey: ["payments_received", "by-orders", orderIds],
    enabled: isSales && orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await db.from("payments_received")
        .select("invoice_id, amount")
        .in("invoice_id", orderIds);
      if (error) return [];
      return (data ?? []) as any[];
    },
    staleTime: 30_000,
  });

  const { data: packages = [] } = useQuery({
    queryKey: ["packages", "by-orders", orderIds],
    enabled: isSales && orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await db.from("packages")
        .select("sales_order_id, status")
        .in("sales_order_id", orderIds)
        .is("deleted_at", null);
      if (error) return [];
      return (data ?? []) as any[];
    },
    staleTime: 30_000,
  });

  const { data: shipments = [] } = useQuery({
    queryKey: ["shipments", "by-orders", orderIds],
    enabled: isSales && orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await db.from("shipments")
        .select("sales_order_id, status")
        .in("sales_order_id", orderIds)
        .is("deleted_at", null);
      if (error) return [];
      return (data ?? []) as any[];
    },
    staleTime: 30_000,
  });

  // Build lookup sets
  const paidOrderIds = useMemo(() => new Set(payments.map((p: any) => p.invoice_id)), [payments]);
  const packedOrderIds = useMemo(() => new Set(packages.map((p: any) => p.sales_order_id)), [packages]);
  const shippedOrderIds = useMemo(() => new Set(shipments.map((s: any) => s.sales_order_id)), [shipments]);

  // ── Selection ──
  const allOnPageSelected = rows.length > 0 && rows.every((r: any) => selected.has(r.id));
  const toggleAll = () => {
    if (allOnPageSelected) {
      setSelected((s) => { const n = new Set(s); rows.forEach((r: any) => n.delete(r.id)); return n; });
    } else {
      setSelected((s) => { const n = new Set(s); rows.forEach((r: any) => n.add(r.id)); return n; });
    }
  };
  const toggleRow = (id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const openDetail = (id: string) =>
    navigate({ to: `${detailBase}/$id` as any, params: { id } as any });

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full flex-col bg-background">

        {/* ── Header ── */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-6 py-3">
          <h1 className="text-base font-semibold tracking-tight flex items-center gap-1">
            {title}
            <span className="ml-1 text-muted-foreground text-sm font-normal">▾</span>
          </h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 w-48 pl-8 text-xs"
                placeholder={`Search ${numberPrefix} number…`}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {allStatuses.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canCreate && (
              <Button
                size="sm"
                className="h-8"
                onClick={() => openDetail("new")}
              >
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
                <DropdownMenuItem onClick={() => { setSearch(""); setStatusFilter("all"); setPage(1); }}>
                  Clear filters
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
              <tr className="border-b text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="w-9 px-3 py-2.5 text-left">
                  <Checkbox checked={allOnPageSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                </th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">Date</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">{numberPrefix} Number</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">Reference#</th>
                <th className="px-3 py-2.5 text-left">{isSales ? "Customer Name" : "Supplier Name"}</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">Order Status</th>
                {isSales ? (
                  <>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">Invoiced</th>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">Payment</th>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">Packed</th>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">Shipped</th>
                  </>
                ) : (
                  <>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">Billed</th>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">Expected</th>
                  </>
                )}
                <th className="px-3 py-2.5 text-right whitespace-nowrap">Amount</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">
                  {isSales ? "Delivery Method" : ""}
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={isSales ? 12 : 10} className="py-16 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={isSales ? 12 : 10} className="py-16 text-center text-xs text-muted-foreground">
                    No {isSales ? "sales orders" : "purchase orders"} found.
                  </td>
                </tr>
              )}
              {rows.map((row: any) => {
                const isInvoiced = isSales
                  ? !!row.converted_invoice_id
                  : false;
                const isBilled = !isSales ? !!row.converted_bill_id : false;
                const hasPacked = isSales ? packedOrderIds.has(row.id) : false;
                const hasShipped = isSales ? shippedOrderIds.has(row.id) : false;
                const hasPaid = isSales ? paidOrderIds.has(row.id) : false;

                // Derive payment color: green if paid, blue if invoiced, grey otherwise
                const paymentColor: "green" | "blue" | "grey" =
                  hasPaid ? "green" : isInvoiced ? "blue" : "grey";

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
                        aria-label={`Select ${row.number}`}
                      />
                    </td>

                    {/* Date */}
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {fmt(row.date)}
                    </td>

                    {/* Order number */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="font-mono text-xs font-semibold text-primary">
                        {row.number ?? "—"}
                      </span>
                    </td>

                    {/* Reference (quote number for SO, notes for PO) */}
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {row.source_quote_id
                        ? <span className="text-primary">{row.source_quote_number ?? row.source_quote_id.slice(0, 8)}</span>
                        : (row.notes ?? "")}
                    </td>

                    {/* Party name */}
                    <td className="px-3 py-2.5 text-sm max-w-[180px]">
                      <span className="line-clamp-2 leading-snug">
                        {partyMap[row[partyField]] ?? row[partyField] ?? "—"}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`text-xs font-semibold uppercase tracking-wide ${STATUS_COLORS[row.status ?? ""] ?? "text-muted-foreground"}`}>
                        {row.status ?? "—"}
                      </span>
                    </td>

                    {/* Sales-only dot columns */}
                    {isSales ? (
                      <>
                        <td className="px-3 py-2.5 text-center">
                          <StatusDot
                            filled={isInvoiced}
                            color="blue"
                            tooltip={isInvoiced ? "Invoice created" : "Not yet invoiced"}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <StatusDot
                            filled={hasPaid || isInvoiced}
                            color={paymentColor}
                            tooltip={hasPaid ? "Payment received" : isInvoiced ? "Invoice sent, awaiting payment" : "No payment yet"}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <StatusDot
                            filled={hasPacked}
                            color="blue"
                            tooltip={hasPacked ? "Package created" : "Not packed"}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <StatusDot
                            filled={hasShipped}
                            color="blue"
                            tooltip={hasShipped ? "Shipment created" : "Not shipped"}
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 text-center">
                          <StatusDot
                            filled={isBilled}
                            color="blue"
                            tooltip={isBilled ? "Bill created" : "Not yet billed"}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap text-center">
                          {fmt(row.expected_date)}
                        </td>
                      </>
                    )}

                    {/* Amount */}
                    <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                      {money(row.grand_total ?? row.amount, row.currency)}
                    </td>

                    {/* Delivery method — last word of notes or blank */}
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {isSales ? (row.notes ?? "") : ""}
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
            {total} order{total !== 1 ? "s" : ""}
            {total > 0 ? ` · page ${page} of ${totalPages}` : ""}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
