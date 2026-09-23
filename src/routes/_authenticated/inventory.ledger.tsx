import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Boxes, QrCode } from "lucide-react";
import { useReportTable, ReportToolbar, ReportPagination, downloadCsv } from "@/components/report-table-kit";
import { InventoryStockTools } from "@/components/inventory-stock-tools";

const REF_LABELS: Record<string, string> = {
  bill: "Purchase In",
  invoice: "Sale",
  package: "Package",
  shipment: "Shipment",
  adjustment: "Adjustment",
  transfer_out: "Transfer Out",
  transfer_in: "Transfer In",
  production_consume: "Production Consume",
  production_receive: "Production Receive",
  credit_note: "Credit Return",
};

const money = (n: number) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function InventoryLedgerPage() {
  const { tenant } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["stock_movements", "ledger", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const {
        data: movements,
        error,
        count,
      } = await supabase
        .from("stock_movements")
        .select("*", { count: "exact" })
        .eq("tenant_id", tenant!.id)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;

      const itemIds = [...new Set((movements ?? []).map((m: any) => m.item_id).filter(Boolean))];
      const whIds = [...new Set((movements ?? []).map((m: any) => m.warehouse_id).filter(Boolean))];
      const locIds = [...new Set((movements ?? []).map((m: any) => m.location_id).filter(Boolean))];

      const [{ data: items }, { data: warehouses }, { data: locations }] = await Promise.all([
        itemIds.length
          ? supabase.from("items").select("id,name,sku").in("id", itemIds)
          : Promise.resolve({ data: [] as any[] }),
        whIds.length
          ? supabase.from("warehouses").select("id,name,code").in("id", whIds)
          : Promise.resolve({ data: [] as any[] }),
        locIds.length
          ? supabase
              .from("warehouse_locations")
              .select("id,code,name,aisle,rack,level,bin,zone_id,warehouse_zones(code,name,zone_type)")
              .in("id", locIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const itemMap = new Map((items ?? []).map((i: any) => [i.id, i]));
      const whMap = new Map((warehouses ?? []).map((w: any) => [w.id, w]));
      const locMap = new Map((locations ?? []).map((l: any) => [l.id, l]));

      return {
        rows: (movements ?? []).map((m: any) => ({
          ...m,
          item: itemMap.get(m.item_id),
          warehouse: whMap.get(m.warehouse_id),
          location: m.location_id ? locMap.get(m.location_id) : null,
        })),
        count: count ?? 0,
      };
    },
  });

  const table = useReportTable<any>({
    rows: data?.rows ?? [],
    searchText: (r) => [r.item?.name, r.item?.sku, r.note, r.warehouse?.name, r.location?.code, REF_LABELS[r.ref_type] ?? r.ref_type],
    getDate: (r) => r.created_at,
    sorts: [
      { value: "date", label: "Date", get: (r) => r.created_at },
      { value: "item", label: "Item", get: (r) => r.item?.name },
      { value: "warehouse", label: "Warehouse", get: (r) => r.warehouse?.name },
      { value: "type", label: "Type", get: (r) => REF_LABELS[r.ref_type] ?? r.ref_type },
      { value: "qty", label: "Quantity", get: (r) => Number(r.quantity) },
      { value: "value", label: "Value", get: (r) => Math.abs(Number(r.quantity) * Number(r.unit_cost || 0)) },
    ],
    defaultSort: "date",
  });
  const rows = table.pageRows;
  const exportCsv = () =>
    downloadCsv("inventory-ledger", ["Date", "Item", "SKU", "Warehouse", "Bin", "Type", "Reference", "In", "Out", "Value"],
      table.filtered.map((m: any) => {
        const q = Number(m.quantity);
        return [m.created_at, m.item?.name, m.item?.sku, m.warehouse?.name, m.location?.code, REF_LABELS[m.ref_type] ?? m.ref_type, m.note, q > 0 ? q : "", q < 0 ? -q : "", Math.abs(q * Number(m.unit_cost || 0)).toFixed(2)];
      }));

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Boxes className="h-5 w-5" /> Inventory Ledger
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Complete stock movement history across all items and warehouses.
        </p>
      </div>

      <InventoryStockTools />

      <Card className="overflow-hidden border shadow-sm p-0">
        <ReportToolbar table={table} placeholder="Search item, SKU, type or note…" onExport={exportCsv} />

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20">
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Item</TableHead>
                <TableHead className="text-xs">Warehouse</TableHead>
                <TableHead className="text-xs">Bin / Location</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Reference</TableHead>
                <TableHead className="text-right text-xs w-24">In</TableHead>
                <TableHead className="text-right text-xs w-24">Out</TableHead>
                <TableHead className="text-right text-xs w-28">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-12">
                    No stock movements yet. Post an invoice, bill, adjustment, or production order to generate
                    movements.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((m: any) => {
                const qty = Number(m.quantity);
                const isIn = qty > 0;
                const loc = m.location;
                const locCoords = loc ? [loc.aisle, loc.rack, loc.level, loc.bin].filter(Boolean).join("-") : null;
                return (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm">
                      {new Date(m.created_at).toLocaleString(undefined, {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{m.item?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground font-mono">{m.item?.sku ?? ""}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{m.warehouse?.name ?? "—"}</div>
                      {m.warehouse?.code && (
                        <div className="text-xs font-mono text-muted-foreground">{m.warehouse.code}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {loc ? (
                        <div className="flex items-center gap-1.5">
                          <QrCode className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="font-mono text-xs font-semibold">{loc.code}</span>
                          {locCoords && locCoords !== loc.code && (
                            <span className="text-xs text-muted-foreground">{locCoords}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={isIn ? "secondary" : "outline"} className="text-xs">
                        {REF_LABELS[m.ref_type] ?? m.ref_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm font-mono text-xs text-muted-foreground">{m.note ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-success">
                      {isIn ? Math.abs(qty) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-destructive">
                      {!isIn ? Math.abs(qty) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {money(Math.abs(qty * Number(m.unit_cost || 0)))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <ReportPagination table={table} label="movements" />
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/inventory/ledger")({
  component: InventoryLedgerPage,
});
