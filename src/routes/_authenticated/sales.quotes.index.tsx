import { useState, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Plus, Search, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sales/quotes/")({
  component: QuotesListPage,
});

const STATUS_COLORS: Record<string, string> = {
  Draft: "text-muted-foreground border-muted-foreground/30",
  Sent: "text-blue-500 border-blue-400/30",
  Accepted: "text-emerald-500 border-emerald-400/30",
  Approved: "text-emerald-500 border-emerald-400/30",
  Invoiced: "text-cyan-500 border-cyan-400/30",
  Rejected: "text-destructive border-destructive/30",
  Expired: "text-orange-500 border-orange-400/30",
  Cancelled: "text-destructive border-destructive/30",
};

const fmt = (v: string | null) =>
  !v
    ? "—"
    : new Date(v).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

const money = (amount: number | null, currency: string) => {
  if (amount == null) return "—";
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : `${currency} `;
  const prefix = ["USD", "EUR", "GBP"].includes(currency) ? sym : "";
  const suffix = ["USD", "EUR", "GBP"].includes(currency) ? "" : currency + " ";
  const formatted = Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return prefix ? `${prefix}${formatted}` : `${suffix}${formatted}`;
};

const PAGE_SIZE = 25;

function QuotesListPage() {
  const navigate = useNavigate();
  const { tenant, can } = useAuth();
  const canCreate = can("sales.create");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Fetch quotes
  const { data, isLoading } = useQuery({
    queryKey: ["sales_quotes", "list", { search, statusFilter, page }],
    queryFn: async () => {
      let q = supabase
        .from("sales_quotes")
        .select("*", { count: "exact" })
        .is("deleted_at", null)
        .order("date", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      if (search.trim()) q = q.ilike("number", `%${search.trim()}%`);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as any[], count: count ?? 0 };
    },
    staleTime: 10_000,
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Batch-fetch customer names
  const customerIds = useMemo(() => Array.from(new Set(rows.map((r: any) => r.customer_id).filter(Boolean))), [rows]);
  const { data: customers = [] } = useQuery({
    queryKey: ["customers", "names", customerIds],
    enabled: customerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id,name")
        .in("id", customerIds as string[]);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    staleTime: 60_000,
  });
  const customerMap = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c.name])), [customers]);

  const location = tenant?.name ?? "—";

  const allOnPageSelected = rows.length > 0 && rows.every((r: any) => selected.has(r.id));

  const toggleAll = () => {
    if (allOnPageSelected) {
      setSelected((s) => {
        const next = new Set(s);
        rows.forEach((r: any) => next.delete(r.id));
        return next;
      });
    } else {
      setSelected((s) => {
        const next = new Set(s);
        rows.forEach((r: any) => next.add(r.id));
        return next;
      });
    }
  };

  const toggleRow = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-6 py-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Quotes</h1>
          <p className="text-xs text-muted-foreground">Prepare and send price quotes to customers.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 w-52 pl-8 text-xs"
              placeholder="Search quote number…"
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
              {["Draft", "Sent", "Accepted", "Approved", "Invoiced", "Rejected", "Expired"].map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canCreate && (
            <Button
              size="sm"
              className="h-8"
              onClick={() => navigate({ to: "/sales/quotes/$id", params: { id: "new" } })}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Quote
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
            <tr className="border-b text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="w-10 px-4 py-3 text-left">
                <Checkbox checked={allOnPageSelected} onCheckedChange={toggleAll} aria-label="Select all" />
              </th>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Location</th>
              <th className="px-4 py-3 text-left">Quote Number</th>
              <th className="px-4 py-3 text-left">Reference Number</th>
              <th className="px-4 py-3 text-left">Customer Name</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="py-16 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-16 text-center text-xs text-muted-foreground">
                  No quotes found.
                </td>
              </tr>
            )}
            {rows.map((row: any) => (
              <tr
                key={row.id}
                className="group cursor-pointer border-b transition-colors hover:bg-muted/40"
                onClick={(e) => {
                  // Don't navigate when clicking the checkbox cell
                  if ((e.target as HTMLElement).closest("[data-checkbox]")) return;
                  navigate({ to: "/sales/quotes/$id", params: { id: row.id } });
                }}
              >
                <td className="px-4 py-3" data-checkbox>
                  <Checkbox
                    checked={selected.has(row.id)}
                    onCheckedChange={() => toggleRow(row.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${row.number}`}
                  />
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmt(row.date)}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{location}</td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs font-medium text-primary">{row.number ?? "—"}</span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{row.notes ?? ""}</td>
                <td className="px-4 py-3 text-sm">{customerMap[row.customer_id] ?? row.customer_id ?? "—"}</td>
                <td className="px-4 py-3">
                  {row.status ? (
                    <Badge
                      variant="outline"
                      className={`text-[11px] font-semibold tracking-wide uppercase ${STATUS_COLORS[row.status] ?? "text-muted-foreground"}`}
                    >
                      {row.status}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                  {money(row.grand_total ?? row.amount, row.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex shrink-0 items-center justify-between border-t px-6 py-2 text-xs text-muted-foreground">
        <span>
          {selected.size > 0 ? `${selected.size} selected · ` : ""}
          {total} quote{total !== 1 ? "s" : ""}
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
