import { useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Plus, Search, Loader2, List, LayoutGrid, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const KANBAN_COLS: { key: string; label: string; statuses: string[]; headerClass: string }[] = [
  {
    key: "not_shipped",
    label: "Packages, Not Shipped",
    statuses: ["Draft", "Packed"],
    headerClass: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
  },
  {
    key: "shipped",
    label: "Shipped Packages",
    statuses: ["Shipped"],
    headerClass: "bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800",
  },
  {
    key: "delivered",
    label: "Delivered Packages",
    statuses: ["Delivered"],
    headerClass: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800",
  },
];

const STATUS_COLORS: Record<string, string> = {
  Draft:     "text-muted-foreground",
  Packed:    "text-blue-500",
  Shipped:   "text-cyan-500",
  Delivered: "text-emerald-500",
  Cancelled: "text-destructive",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: string | null | undefined) =>
  !v ? "—" : new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" });

// ─── Kanban Card ─────────────────────────────────────────────────────────────

function KanbanCard({
  pkg,
  customerName,
  soNumber,
  shipDate,
  totalQty,
  selected,
  onToggle,
  onClick,
}: {
  pkg: any;
  customerName: string;
  soNumber: string;
  shipDate: string | null;
  totalQty: number;
  selected: boolean;
  onToggle: () => void;
  onClick: () => void;
}) {
  return (
    <div
      className="cursor-pointer rounded-md border bg-background p-3 shadow-sm transition-colors hover:bg-muted/40"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-no-nav]")) return;
        onClick();
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <span data-no-nav>
            <Checkbox
              checked={selected}
              onCheckedChange={onToggle}
              onClick={(e) => e.stopPropagation()}
              className="mt-0.5"
            />
          </span>
          <span className="text-sm font-medium truncate leading-snug">
            {customerName}
          </span>
        </div>
        <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
          {totalQty.toFixed(2)}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        <span className="font-mono text-primary">{pkg.number ?? "—"}</span>
        <span className="font-mono text-primary">{soNumber}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>{pkg.carrier ?? "—"}</span>
        <span>{fmt(shipDate ?? pkg.date)}</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PackagesListPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const canCreate = can("sales.create");

  const [view, setView] = useState<"list" | "kanban">("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── Fetch packages ──
  const { data, isLoading } = useQuery({
    queryKey: ["packages", "list", { search, statusFilter, page, view }],
    queryFn: async () => {
      let q = supabase
        .from("packages")
        .select("*", { count: "exact" })
        .is("deleted_at", null)
        .order("date", { ascending: false });

      // Kanban fetches all (up to 500); list paginates
      if (view === "list") {
        q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1) as any;
      } else {
        q = q.limit(500) as any;
      }

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

  // ── Batch-fetch customer names ──
  const customerIds = useMemo(
    () => Array.from(new Set(rows.map((r: any) => r.customer_id).filter(Boolean))),
    [rows]
  );
  const { data: customers = [] } = useQuery({
    queryKey: ["customers", "names", customerIds],
    enabled: customerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers").select("id,name").in("id", customerIds as string[]);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    staleTime: 60_000,
  });
  const customerMap = useMemo(
    () => Object.fromEntries(customers.map((c) => [c.id, c.name])),
    [customers]
  );

  // ── Batch-fetch sales order numbers ──
  const orderIds = useMemo(
    () => Array.from(new Set(rows.map((r: any) => r.sales_order_id).filter(Boolean))),
    [rows]
  );
  const { data: orders = [] } = useQuery({
    queryKey: ["sales_orders", "numbers", orderIds],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_orders").select("id,number").in("id", orderIds as string[]);
      if (error) throw error;
      return (data ?? []) as { id: string; number: string }[];
    },
    staleTime: 60_000,
  });
  const orderMap = useMemo(
    () => Object.fromEntries(orders.map((o) => [o.id, o.number])),
    [orders]
  );

  // ── Batch-fetch package quantities from package_lines ──
  const pkgIds = useMemo(() => rows.map((r: any) => r.id), [rows]);
  const { data: lines = [] } = useQuery({
    queryKey: ["package_lines", "by-packages", pkgIds],
    enabled: pkgIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("package_lines").select("document_id,quantity")
        .in("document_id", pkgIds).is("deleted_at", null);
      if (error) return [];
      return (data ?? []) as { document_id: string; quantity: number }[];
    },
    staleTime: 30_000,
  });
  const qtyMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of lines) {
      m[l.document_id] = (m[l.document_id] ?? 0) + l.quantity;
    }
    return m;
  }, [lines]);

  // ── Batch-fetch shipment dates ──
  const { data: shipments = [] } = useQuery({
    queryKey: ["shipments", "ship-dates", pkgIds],
    enabled: pkgIds.length > 0,
    queryFn: async () => {
      // shipments link to sales_order_id; use carrier match or join via sales_order_id
      const { data, error } = await supabase
        .from("shipments")
        .select("sales_order_id,ship_date")
        .in("sales_order_id", orderIds as string[])
        .is("deleted_at", null);
      if (error) return [];
      return (data ?? []) as { sales_order_id: string; ship_date: string | null }[];
    },
    enabled: orderIds.length > 0,
    staleTime: 30_000,
  });
  const shipDateMap = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const s of shipments) {
      if (s.sales_order_id) m[s.sales_order_id] = s.ship_date;
    }
    return m;
  }, [shipments]);

  // ── Selection helpers ──
  const allOnPageSelected = rows.length > 0 && rows.every((r: any) => selected.has(r.id));
  const toggleAll = () => {
    if (allOnPageSelected) {
      setSelected((s) => { const n = new Set(s); rows.forEach((r: any) => n.delete(r.id)); return n; });
    } else {
      setSelected((s) => { const n = new Set(s); rows.forEach((r: any) => n.add(r.id)); return n; });
    }
  };
  const toggleRow = (id: string) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const openDetail = (id: string) =>
    navigate({ to: "/sales/packages/$id" as any, params: { id } });

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-background">

      {/* ── Header ── */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-6 py-3">
        <h1 className="text-base font-semibold tracking-tight flex items-center gap-1">
          All Packages
          <span className="ml-1 text-muted-foreground text-sm font-normal">▾</span>
        </h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 w-44 pl-8 text-xs"
              placeholder="Search package#…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {["Draft", "Packed", "Shipped", "Delivered", "Cancelled"].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* View toggle */}
          <div className="flex items-center rounded-md border bg-muted/50 p-0.5">
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setView("list")}
              aria-label="List view"
            >
              <List className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={view === "kanban" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setView("kanban")}
              aria-label="Kanban view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
          </div>

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
              <DropdownMenuItem onClick={() => { setSearch(""); setStatusFilter("all"); setPage(1); }}>
                Clear filters
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Content ── */}
      {view === "list" ? (
        <>
          {/* LIST VIEW */}
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <tr className="border-b text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="w-9 px-3 py-2.5 text-left">
                    <Checkbox checked={allOnPageSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                  </th>
                  <th className="px-3 py-2.5 text-left whitespace-nowrap">Package Date</th>
                  <th className="px-3 py-2.5 text-left whitespace-nowrap">Package#</th>
                  <th className="px-3 py-2.5 text-left whitespace-nowrap">Carrier</th>
                  <th className="px-3 py-2.5 text-left whitespace-nowrap">Tracking#</th>
                  <th className="px-3 py-2.5 text-left whitespace-nowrap">Sales Order#</th>
                  <th className="px-3 py-2.5 text-left whitespace-nowrap">Status</th>
                  <th className="px-3 py-2.5 text-left whitespace-nowrap">Shipment Date</th>
                  <th className="px-3 py-2.5 text-left">Customer Name</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Quantity</th>
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
                      No packages found.
                    </td>
                  </tr>
                )}
                {rows.map((row: any) => {
                  const shipDate = row.sales_order_id ? shipDateMap[row.sales_order_id] : null;
                  const soNumber = row.sales_order_id ? (orderMap[row.sales_order_id] ?? "—") : "—";
                  const customerName = row.customer_id ? (customerMap[row.customer_id] ?? "—") : "—";
                  const qty = qtyMap[row.id] ?? 0;

                  return (
                    <tr
                      key={row.id}
                      className="group cursor-pointer border-b transition-colors hover:bg-muted/40"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("[data-no-nav]")) return;
                        openDetail(row.id);
                      }}
                    >
                      <td className="px-3 py-2.5" data-no-nav>
                        <Checkbox
                          checked={selected.has(row.id)}
                          onCheckedChange={() => toggleRow(row.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {fmt(row.date)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="font-mono text-xs font-semibold text-primary">{row.number ?? "—"}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs">{row.carrier ?? "—"}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{row.tracking ?? "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="font-mono text-xs text-primary">{soNumber}</span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`text-xs font-semibold uppercase tracking-wide ${STATUS_COLORS[row.status ?? ""] ?? "text-muted-foreground"}`}>
                          {row.status ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {fmt(shipDate)}
                      </td>
                      <td className="px-3 py-2.5 text-sm max-w-[200px]">
                        <span className="line-clamp-2 leading-snug">{customerName}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                        {qty.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* List pagination */}
          <div className="flex shrink-0 items-center justify-between border-t px-6 py-2 text-xs text-muted-foreground">
            <span>
              {selected.size > 0 ? `${selected.size} selected · ` : ""}
              {total} package{total !== 1 ? "s" : ""}
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
        </>
      ) : (
        /* ── KANBAN VIEW ── */
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex h-full gap-4 items-start">
              {KANBAN_COLS.map((col) => {
                const colRows = rows.filter((r: any) => col.statuses.includes(r.status ?? "Draft"));
                return (
                  <div key={col.key} className="flex w-[280px] shrink-0 flex-col rounded-lg border bg-muted/20 overflow-hidden">
                    {/* Column header */}
                    <div className={`flex items-center justify-between border-b px-3 py-2.5 ${col.headerClass}`}>
                      <span className="text-xs font-semibold">{col.label}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs px-1.5 py-0">
                          {colRows.length}
                        </Badge>
                        <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </div>

                    {/* Cards */}
                    <div className="flex flex-col gap-2 overflow-y-auto p-2" style={{ maxHeight: "calc(100vh - 160px)" }}>
                      {colRows.length === 0 && (
                        <p className="py-6 text-center text-xs text-muted-foreground">No packages</p>
                      )}
                      {colRows.map((row: any) => {
                        const shipDate = row.sales_order_id ? shipDateMap[row.sales_order_id] : null;
                        const soNumber = row.sales_order_id ? (orderMap[row.sales_order_id] ?? "—") : "—";
                        const customerName = row.customer_id ? (customerMap[row.customer_id] ?? "—") : "—";
                        const qty = qtyMap[row.id] ?? 0;
                        return (
                          <KanbanCard
                            key={row.id}
                            pkg={row}
                            customerName={customerName}
                            soNumber={soNumber}
                            shipDate={shipDate}
                            totalQty={qty}
                            selected={selected.has(row.id)}
                            onToggle={() => toggleRow(row.id)}
                            onClick={() => openDetail(row.id)}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
