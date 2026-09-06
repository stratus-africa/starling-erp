import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, ExternalLink, Fingerprint, Loader2, Search, Shield } from "lucide-react";

export const Route = createFileRoute("/_authenticated/inventory/serials")({
  component: SerialsPage,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (v: string | null) =>
  !v ? "—" : new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

const SERIAL_STATUSES = ["In Stock", "Reserved", "Sold", "Consumed", "Transferred", "Returned", "Scrapped"] as const;

function SerialStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    "In Stock":  "bg-success/15 text-success",
    Reserved:    "bg-info/15 text-info",
    Sold:        "bg-muted text-muted-foreground",
    Consumed:    "bg-muted text-muted-foreground",
    Transferred: "bg-info/15 text-info",
    Returned:    "bg-warning/15 text-warning",
    Scrapped:    "bg-destructive/15 text-destructive",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function SerialsPage() {
  const { tenant } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [warrantyFilter, setWarrantyFilter] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["item_serials", "all"],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("item_serials")
        .select(`
          *,
          items(id, name, sku, uom),
          item_lots(lot_number),
          warehouses(name),
          warehouse_locations(code)
        `)
        .is("deleted_at", null)
        .order("serial_number");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const now = new Date();
  const filtered = rows.filter((r: any) => {
    const s = search.toLowerCase();
    const matchSearch =
      !s ||
      r.serial_number.toLowerCase().includes(s) ||
      (r.items?.name ?? "").toLowerCase().includes(s) ||
      (r.items?.sku ?? "").toLowerCase().includes(s) ||
      (r.item_lots?.lot_number ?? "").toLowerCase().includes(s);
    const matchStatus = !statusFilter || r.status === statusFilter;
    const wEnd = r.warranty_end ? new Date(r.warranty_end) : null;
    const matchWarranty =
      !warrantyFilter ||
      (warrantyFilter === "valid"   && wEnd && wEnd >= now) ||
      (warrantyFilter === "expired" && wEnd && wEnd < now) ||
      (warrantyFilter === "none"    && !wEnd);
    return matchSearch && matchStatus && matchWarranty;
  });

  const inStockCount   = rows.filter((r: any) => r.status === "In Stock").length;
  const expWarCount    = rows.filter((r: any) => r.warranty_end && new Date(r.warranty_end) < now).length;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Fingerprint className="h-5 w-5" /> Serial Numbers
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All tracked serial numbers across serialised items.
          </p>
        </div>
        {/* Summary chips */}
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success px-2.5 py-1 font-medium">
            {inStockCount} in stock
          </span>
          {expWarCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 text-warning px-2.5 py-1 font-medium">
              <AlertTriangle className="h-3 w-3" /> {expWarCount} warranty expired
            </span>
          )}
        </div>
      </div>

      <Card className="overflow-hidden border shadow-sm p-0">
        <div className="flex items-center gap-2 border-b px-3 py-2 bg-muted/30 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search serial, item, lot…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 pl-8 text-sm w-56 bg-background"
            />
          </div>
          <Select value={statusFilter || "all"} onValueChange={v => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="h-8 w-36 text-sm bg-background"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {SERIAL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={warrantyFilter || "all"} onValueChange={v => setWarrantyFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="h-8 w-40 text-sm bg-background"><SelectValue placeholder="All warranties" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All warranties</SelectItem>
              <SelectItem value="valid">Warranty valid</SelectItem>
              <SelectItem value="expired">Warranty expired</SelectItem>
              <SelectItem value="none">No warranty</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-muted-foreground">
            {filtered.length} serial{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20">
                <TableHead className="text-xs">Serial Number</TableHead>
                <TableHead className="text-xs">Item</TableHead>
                <TableHead className="text-xs">Lot</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Warehouse</TableHead>
                <TableHead className="text-xs">Location</TableHead>
                <TableHead className="text-xs">Received</TableHead>
                <TableHead className="text-xs">Warranty Exp</TableHead>
                <TableHead className="text-xs">Source</TableHead>
                <TableHead className="text-xs w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-12">
                    {rows.length === 0
                      ? "No serial numbers yet. Enable serial tracking on an item and create serials from the item's Traceability tab."
                      : "No serials match the current filters."}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r: any) => {
                const warrantyExpired = r.warranty_end && new Date(r.warranty_end) < now;
                return (
                  <TableRow key={r.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs font-semibold">{r.serial_number}</TableCell>
                    <TableCell>
                      <Link
                        to={`/inventory/items/${r.item_id}` as any}
                        className="text-sm font-medium hover:underline"
                      >
                        {r.items?.name ?? "—"}
                      </Link>
                      {r.items?.sku && (
                        <div className="text-xs text-muted-foreground font-mono">{r.items.sku}</div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {r.item_lots?.lot_number ?? "—"}
                    </TableCell>
                    <TableCell><SerialStatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.warehouses?.name ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {r.warehouse_locations?.code ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(r.received_date)}</TableCell>
                    <TableCell>
                      {r.warranty_end ? (
                        <span className={`text-xs flex items-center gap-1 ${warrantyExpired ? "text-destructive" : "text-muted-foreground"}`}>
                          {warrantyExpired && <AlertTriangle className="h-3 w-3" />}
                          <Shield className="h-3 w-3" />
                          {fmtDate(r.warranty_end)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.received_from_ref_type ?? r.issued_to_ref_type ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                        <Link to={`/inventory/items/${r.item_id}` as any} title="Open item">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
