import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardCheck, Loader2, Printer } from "lucide-react";
import { useReportTable, ReportToolbar, ReportPagination, downloadCsv } from "@/components/report-table-kit";

type AuditRow = {
  key: string;
  warehouseName: string;
  warehouseCode: string | null;
  zoneName: string | null;
  locationCode: string | null;
  coords: string | null;
  itemName: string;
  itemSku: string | null;
  uom: string | null;
  onHand: number;
  lastMovedAt: string | null;
};

const qty = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 4 });

function StockAuditPage() {
  const { tenant } = useAuth();
  const [warehouse, setWarehouse] = useState("all");
  const [hideZero, setHideZero] = useState(true);
  const [countDate, setCountDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [countFrequencyDays, setCountFrequencyDays] = useState(30);
  const [countValues, setCountValues] = useState<Record<string, number>>({});
  const [countStarted, setCountStarted] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["stock-audit", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const [{ data: stock, error }, { data: items }, { data: warehouses }, { data: moves }] = await Promise.all([
        supabase.from("inventory_location_stock").select("*").eq("tenant_id", tenant!.id),
        supabase.from("items").select("id,name,sku,uom").eq("tenant_id", tenant!.id),
        supabase.from("warehouses").select("id,name,code").eq("tenant_id", tenant!.id),
        supabase.from("stock_movements").select("item_id,warehouse_id,location_id,created_at").eq("tenant_id", tenant!.id).order("created_at", { ascending: false }).limit(5000),
      ]);
      const lastMove = new Map<string, string>();
      for (const m of (moves ?? []) as any[]) {
        const k = `${m.warehouse_id}:${m.location_id ?? "none"}:${m.item_id}`;
        if (!lastMove.has(k)) lastMove.set(k, m.created_at);
      }
      if (error) throw error;

      const itemMap = new Map((items ?? []).map((i: any) => [i.id, i]));
      const whMap = new Map((warehouses ?? []).map((w: any) => [w.id, w]));

      const rows: AuditRow[] = (stock ?? []).map((row: any) => {
        const item = itemMap.get(row.item_id);
        const wh = whMap.get(row.warehouse_id);
        const coords = [row.aisle, row.rack, row.level, row.bin].filter(Boolean).join("-");
        return {
          key: `${row.warehouse_id}:${row.location_id ?? "none"}:${row.item_id}`,
          warehouseName: wh?.name ?? "—",
          warehouseCode: wh?.code ?? null,
          zoneName: row.zone_name ?? null,
          locationCode: row.location_code ?? null,
          coords: coords || null,
          itemName: item?.name ?? "—",
          itemSku: item?.sku ?? null,
          uom: item?.uom ?? null,
          onHand: Number(row.on_hand ?? 0),
          lastMovedAt: lastMove.get(`${row.warehouse_id}:${row.location_id ?? "none"}:${row.item_id}`) ?? null,
        };
      });

      return { rows, warehouses: warehouses ?? [] };
    },
  });

  const baseRows = useMemo(
    () =>
      (data?.rows ?? [])
        .filter((row) => (warehouse === "all" ? true : row.warehouseName === warehouse))
        .filter((row) => (hideZero ? row.onHand !== 0 : true)),
    [data?.rows, warehouse, hideZero],
  );
  const table = useReportTable<AuditRow>({
    rows: baseRows,
    searchText: (r) => [r.itemName, r.itemSku, r.locationCode, r.zoneName, r.warehouseName, r.coords],
    getDate: (r) => r.lastMovedAt,
    sorts: [
      { value: "warehouse", label: "Warehouse", get: (r) => `${r.warehouseName} ${r.locationCode ?? ""} ${r.itemName}` },
      { value: "bin", label: "Bin", get: (r) => r.locationCode },
      { value: "item", label: "Item", get: (r) => r.itemName },
      { value: "qty", label: "System qty", get: (r) => r.onHand },
      { value: "moved", label: "Last movement", get: (r) => r.lastMovedAt },
    ],
    defaultSort: "warehouse",
    defaultDir: "asc",
  });
  const rows = table.filtered;
  const pageRows = table.pageRows;

  const nextCountDate = useMemo(() => {
    const date = new Date(countDate);
    if (Number.isNaN(date.getTime())) return countDate;
    date.setDate(date.getDate() + countFrequencyDays);
    return date.toISOString().slice(0, 10);
  }, [countDate, countFrequencyDays]);

  const outputCount = (row: AuditRow) => {
    const value = countValues[row.key];
    return Number.isFinite(value) ? value : row.onHand;
  };

  const varianceFor = (row: AuditRow) => outputCount(row) - row.onHand;

  const totalUnits = rows.reduce((sum, row) => sum + row.onHand, 0);
  const totalCounted = rows.reduce((sum, row) => sum + outputCount(row), 0);
  const totalVariance = totalCounted - totalUnits;
  const varianceLines = rows.filter((row) => varianceFor(row) !== 0).length;

  const runRealCount = () => {
    const seededValues = Object.fromEntries(rows.map((row) => [row.key, Number(row.onHand ?? 0)]));
    setCountValues(seededValues);
    setCountStarted(true);
    setCountDate(new Date().toISOString().slice(0, 10));
  };

  const exportCsv = () =>
    downloadCsv("stock-audit", ["Warehouse", "Warehouse Code", "Zone", "Bin", "Bin Coordinates", "Item", "SKU", "Unit", "Last Movement", "System Qty", "Counted Qty", "Variance", "Next Count Date"],
      rows.map((row) => [row.warehouseName, row.warehouseCode, row.zoneName, row.locationCode ?? "Unassigned", row.coords, row.itemName, row.itemSku, row.uom, row.lastMovedAt?.slice(0, 10), row.onHand, outputCount(row), varianceFor(row), nextCountDate]));

  return (
    <div className="flex w-full flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ClipboardCheck className="h-5 w-5" /> Stock Audit Report
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Every warehouse, bin, item and quantity the system holds — print it and tick off your physical count.
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" className="h-8" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Print count sheet
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">System qty</p>
          <p className="mt-2 font-mono text-xl font-bold tabular-nums">{qty(totalUnits)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Counted qty</p>
          <p className="mt-2 font-mono text-xl font-bold tabular-nums">{qty(totalCounted)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Variance</p>
          <p className={`mt-2 font-mono text-xl font-bold tabular-nums ${totalVariance === 0 ? "text-emerald-600" : "text-amber-600"}`}>
            {qty(totalVariance)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Next count due</p>
          <p className="mt-2 font-mono text-xl font-bold tabular-nums">{nextCountDate}</p>
        </Card>
      </div>

      <Card className="overflow-hidden border p-0 shadow-sm">
        <ReportToolbar table={table} placeholder="Search item, SKU, bin or zone…" onExport={exportCsv}>
          <Select value={warehouse} onValueChange={setWarehouse}>
            <SelectTrigger className="h-8 w-56 bg-background text-sm">
              <SelectValue placeholder="All warehouses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All warehouses</SelectItem>
              {(data?.warehouses ?? []).map((wh: any) => (
                <SelectItem key={wh.id} value={wh.name}>
                  {wh.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={hideZero ? "secondary" : "outline"}
            size="sm"
            className="h-8"
            onClick={() => setHideZero((value) => !value)}
          >
            {hideZero ? "Hiding empty bins" : "Showing empty bins"}
          </Button>
          <Button variant="default" size="sm" className="h-8" onClick={runRealCount}>
            Run real count
          </Button>
        </ReportToolbar>
        <div className="flex flex-wrap items-center justify-end gap-2 border-b px-3 py-2 text-xs text-muted-foreground print:hidden">
            <label className="flex items-center gap-1.5">
              <span>Count date</span>
              <Input type="date" value={countDate} onChange={(event) => setCountDate(event.target.value)} className="h-8 w-36" />
            </label>
            <Select value={String(countFrequencyDays)} onValueChange={(value) => setCountFrequencyDays(Number(value))}>
              <SelectTrigger className="h-8 w-28 bg-background text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="45">45 days</SelectItem>
              </SelectContent>
            </Select>
        </div>

        <div className="flex items-center justify-between border-b bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground print:hidden">
          <span>{rows.length} line{rows.length === 1 ? "" : "s"}</span>
          <span>{varianceLines} variance line{varianceLines === 1 ? "" : "s"}</span>
          <span>Next count scheduled {nextCountDate}</span>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20">
                <TableHead className="text-xs">Warehouse</TableHead>
                <TableHead className="text-xs">Zone</TableHead>
                <TableHead className="text-xs">Bin</TableHead>
                <TableHead className="text-xs">Item</TableHead>
                <TableHead className="text-xs">Unit</TableHead>
                <TableHead className="w-28 text-right text-xs">System Qty</TableHead>
                <TableHead className="w-28 text-right text-xs">Counted</TableHead>
                <TableHead className="w-28 text-right text-xs">Variance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                    No stock found for this filter.
                  </TableCell>
                </TableRow>
              )}
              {pageRows.map((row) => {
                const counted = outputCount(row);
                const diff = varianceFor(row);
                return (
                  <TableRow key={row.key}>
                    <TableCell>
                      <div className="text-sm">{row.warehouseName}</div>
                      {row.warehouseCode && (
                        <div className="font-mono text-xs text-muted-foreground">{row.warehouseCode}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.zoneName ?? "—"}</TableCell>
                    <TableCell>
                      {row.locationCode ? (
                        <div className="flex flex-col">
                          <span className="font-mono text-xs font-semibold">{row.locationCode}</span>
                          {row.coords && row.coords !== row.locationCode && (
                            <span className="text-xs text-muted-foreground">{row.coords}</span>
                          )}
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          Unassigned
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{row.itemName}</div>
                      {row.itemSku && <div className="font-mono text-xs text-muted-foreground">{row.itemSku}</div>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.uom ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{qty(row.onHand)}</TableCell>
                    <TableCell className="border-l bg-muted/10 text-right align-middle">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={counted}
                        onChange={(event) => {
                          const nextValue = Number(event.target.value);
                          setCountValues((current) => ({ ...current, [row.key]: Number.isFinite(nextValue) ? nextValue : 0 }));
                          setCountStarted(true);
                        }}
                        className="h-8 w-24 rounded-md border bg-background text-right font-mono tabular-nums"
                      />
                    </TableCell>
                    <TableCell className={`border-l text-right font-mono tabular-nums ${diff === 0 ? "text-emerald-600" : "text-amber-600"}`}>
                      {qty(diff)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <ReportPagination table={table} label="lines" />
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/inventory_/stock-audit")({
  component: StockAuditPage,
  head: () => ({
    meta: [
      { title: "Stock Audit Report | AURORA ERP" },
      { name: "description", content: "Warehouse, bin, item and quantity listing for physical stock counts." },
      { property: "og:title", content: "Stock Audit Report | AURORA ERP" },
      { property: "og:description", content: "Warehouse, bin, item and quantity listing for physical stock counts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
