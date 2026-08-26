import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Loader2, Boxes, ChevronLeft, ChevronRight } from "lucide-react";

const REF_LABELS: Record<string, string> = {
  bill: "Purchase In", invoice: "Sale", package: "Package", shipment: "Shipment",
  adjustment: "Adjustment", transfer_out: "Transfer Out", transfer_in: "Transfer In",
  production_consume: "Production Consume", production_receive: "Production Receive",
  credit_note: "Credit Return",
};

const money = (n: number) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function InventoryLedgerPage() {
  const { tenant } = useAuth();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data, isLoading } = useQuery({
    queryKey: ["stock_movements", "ledger", page],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data: movements, error, count } = await supabase
        .from("stock_movements")
        .select("*", { count: "exact" })
        .eq("tenant_id", tenant!.id)
        .order("created_at", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (error) throw error;

      const itemIds = [...new Set((movements ?? []).map((m: any) => m.item_id).filter(Boolean))];
      const whIds = [...new Set((movements ?? []).map((m: any) => m.warehouse_id).filter(Boolean))];
      const [{ data: items }, { data: warehouses }] = await Promise.all([
        itemIds.length ? supabase.from("items").select("id,name,sku").in("id", itemIds) : Promise.resolve({ data: [] as any[] }),
        whIds.length ? supabase.from("warehouses").select("id,name,code").in("id", whIds) : Promise.resolve({ data: [] as any[] }),
      ]);

      const itemMap = new Map((items ?? []).map((i: any) => [i.id, i]));
      const whMap = new Map((warehouses ?? []).map((w: any) => [w.id, w]));

      return {
        rows: (movements ?? []).map((m: any) => ({
          ...m,
          item: itemMap.get(m.item_id),
          warehouse: whMap.get(m.warehouse_id),
        })),
        count: count ?? 0,
      };
    },
  });

  const rows = (data?.rows ?? []).filter((r: any) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return r.item?.name?.toLowerCase().includes(s) || r.item?.sku?.toLowerCase().includes(s) || r.note?.toLowerCase().includes(s);
  });

  const total = data?.count ?? 0;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Boxes className="h-5 w-5" /> Inventory Ledger
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Complete stock movement history across all items and warehouses.</p>
      </div>

      <Card className="overflow-hidden border shadow-sm p-0">
        <div className="flex items-center gap-2 border-b px-3 py-2 bg-muted/30">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search item, SKU, or note…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 pl-8 text-sm bg-background" />
          </div>
          <div className="ml-auto text-xs text-muted-foreground">{total} movement{total === 1 ? "" : "s"}</div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20">
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Item</TableHead>
                <TableHead className="text-xs">Warehouse</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Reference</TableHead>
                <TableHead className="text-right text-xs w-24">In</TableHead>
                <TableHead className="text-right text-xs w-24">Out</TableHead>
                <TableHead className="text-right text-xs w-28">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-12"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-12">No stock movements yet. Post an invoice, bill, adjustment, or production order to generate movements.</TableCell></TableRow>
              )}
              {rows.map((m: any) => {
                const qty = Number(m.quantity);
                const isIn = qty > 0;
                return (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm">{new Date(m.created_at).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{m.item?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground font-mono">{m.item?.sku ?? ""}</div>
                    </TableCell>
                    <TableCell className="text-sm">{m.warehouse?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={isIn ? "secondary" : "outline"} className="text-xs">{REF_LABELS[m.ref_type] ?? m.ref_type}</Badge>
                    </TableCell>
                    <TableCell className="text-sm font-mono text-xs text-muted-foreground">{m.note ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-success">{isIn ? Math.abs(qty) : "—"}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-destructive">{!isIn ? Math.abs(qty) : "—"}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{money(Math.abs(qty * Number(m.unit_cost || 0)))}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
          <div>Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-3 w-3" /></Button>
            <Button variant="outline" size="sm" className="h-7" disabled={page * pageSize >= total} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-3 w-3" /></Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/inventory/ledger")({
  component: InventoryLedgerPage,
});
