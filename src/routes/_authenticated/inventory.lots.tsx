import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertTriangle, ExternalLink, FlaskConical, Loader2, Search,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/inventory/lots")({
  component: LotsPage,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (v: string | null) =>
  !v ? "—" : new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

const qty = (v: any) =>
  Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const LOT_STATUSES = ["Active", "Quarantine", "Released", "Expired", "Consumed", "Recalled"] as const;

function expiryDaysLeft(expiry: string | null): number | null {
  if (!expiry) return null;
  return Math.ceil((new Date(expiry).getTime() - Date.now()) / 86_400_000);
}

function ExpiryCell({ expiry }: { expiry: string | null }) {
  if (!expiry) return <span className="text-muted-foreground text-xs">—</span>;
  const days = expiryDaysLeft(expiry);
  if (days === null) return null;
  if (days < 0)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
        <AlertTriangle className="h-3 w-3" /> Expired
        <span className="text-muted-foreground">({fmtDate(expiry)})</span>
      </span>
    );
  if (days <= 30)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
        <AlertTriangle className="h-3 w-3" /> {fmtDate(expiry)}
        <span className="text-muted-foreground">({days}d left)</span>
      </span>
    );
  return <span className="text-xs">{fmtDate(expiry)}</span>;
}

function LotStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    Active:     "bg-success/15 text-success",
    Released:   "bg-success/15 text-success",
    Quarantine: "bg-warning/15 text-warning",
    Expired:    "bg-destructive/15 text-destructive",
    Recalled:   "bg-destructive/15 text-destructive",
    Consumed:   "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function LotsPage() {
  const { tenant } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expiryFilter, setExpiryFilter] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["item_lots", "all"],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("item_lots")
        .select("*, items(id,name,sku,uom), warehouses(name)")
        .is("deleted_at", null)
        .order("expiry_date", { ascending: true, nullsFirst: false })
        .order("lot_number");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: stockRows = [] } = useQuery({
    queryKey: ["inventory_lot_stock", "all"],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("inventory_lot_stock")
        .select("lot_id, on_hand");
      if (error) throw error;
      return (data ?? []) as { lot_id: string | null; on_hand: number | null }[];
    },
  });

  // Aggregate on_hand per lot
  const lotOnHand = new Map<string, number>();
  for (const r of stockRows) {
    if (r.lot_id) lotOnHand.set(r.lot_id, (lotOnHand.get(r.lot_id) ?? 0) + Number(r.on_hand ?? 0));
  }

  const filtered = rows.filter(r => {
    const s = search.toLowerCase();
    const matchSearch =
      !s ||
      r.lot_number.toLowerCase().includes(s) ||
      (r.supplier_lot_ref ?? "").toLowerCase().includes(s) ||
      (r.items?.name ?? "").toLowerCase().includes(s) ||
      (r.items?.sku ?? "").toLowerCase().includes(s);
    const matchStatus = !statusFilter || r.status === statusFilter;
    const days = expiryDaysLeft(r.expiry_date);
    const matchExpiry =
      !expiryFilter ||
      (expiryFilter === "expired"   && days !== null && days < 0) ||
      (expiryFilter === "expiring"  && days !== null && days >= 0 && days <= 30) ||
      (expiryFilter === "noexpiry"  && r.expiry_date === null);
    return matchSearch && matchStatus && matchExpiry;
  });

  const expiredCount  = rows.filter(r => expiryDaysLeft(r.expiry_date) !== null && expiryDaysLeft(r.expiry_date)! < 0).length;
  const expiringCount = rows.filter(r => { const d = expiryDaysLeft(r.expiry_date); return d !== null && d >= 0 && d <= 30; }).length;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <FlaskConical className="h-5 w-5" /> Lots &amp; Batches
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All lot and batch records across tracked items.
          </p>
        </div>
      </div>

      {/* Expiry alerts */}
      {(expiredCount > 0 || expiringCount > 0) && (
        <div className="flex flex-wrap gap-2">
          {expiredCount > 0 && (
            <button
              onClick={() => setExpiryFilter(expiryFilter === "expired" ? "" : "expired")}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                expiryFilter === "expired"
                  ? "border-destructive bg-destructive/10 text-destructive"
                  : "border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10"
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {expiredCount} expired lot{expiredCount !== 1 ? "s" : ""}
            </button>
          )}
          {expiringCount > 0 && (
            <button
              onClick={() => setExpiryFilter(expiryFilter === "expiring" ? "" : "expiring")}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                expiryFilter === "expiring"
                  ? "border-warning bg-warning/10 text-warning"
                  : "border-warning/30 bg-warning/5 text-warning hover:bg-warning/10"
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {expiringCount} expiring within 30 days
            </button>
          )}
        </div>
      )}

      <Card className="overflow-hidden border shadow-sm p-0">
        <div className="flex items-center gap-2 border-b px-3 py-2 bg-muted/30 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search lot, item, supplier ref…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 pl-8 text-sm w-60 bg-background"
            />
          </div>
          <Select value={statusFilter || "all"} onValueChange={v => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="h-8 w-36 text-sm bg-background"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {LOT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={expiryFilter || "all"} onValueChange={v => setExpiryFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="h-8 w-40 text-sm bg-background"><SelectValue placeholder="All expiries" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All expiries</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="expiring">Expiring ≤30d</SelectItem>
              <SelectItem value="noexpiry">No expiry</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-muted-foreground">
            {filtered.length} lot{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20">
                <TableHead className="text-xs">Lot Number</TableHead>
                <TableHead className="text-xs">Item</TableHead>
                <TableHead className="text-xs">Supplier Ref</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Mfg Date</TableHead>
                <TableHead className="text-xs">Expiry Date</TableHead>
                <TableHead className="text-xs text-right">Initial Qty</TableHead>
                <TableHead className="text-xs text-right">On Hand</TableHead>
                <TableHead className="text-xs">CoA Ref</TableHead>
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
                      ? "No lot records yet. Enable batch tracking on an item and create lots from the item's Traceability tab."
                      : "No lots match the current filters."}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r: any) => {
                const onHand = lotOnHand.get(r.id) ?? 0;
                return (
                  <TableRow key={r.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs font-semibold">{r.lot_number}</TableCell>
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
                    <TableCell className="text-xs text-muted-foreground">{r.supplier_lot_ref ?? "—"}</TableCell>
                    <TableCell><LotStatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(r.manufactured_date)}</TableCell>
                    <TableCell><ExpiryCell expiry={r.expiry_date} /></TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-xs text-muted-foreground">
                      {qty(r.initial_qty)} {r.items?.uom}
                    </TableCell>
                    <TableCell className={`text-right font-mono tabular-nums text-sm font-semibold ${onHand < 0 ? "text-destructive" : onHand === 0 ? "text-muted-foreground" : ""}`}>
                      {qty(onHand)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.certificate_ref ?? "—"}</TableCell>
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
