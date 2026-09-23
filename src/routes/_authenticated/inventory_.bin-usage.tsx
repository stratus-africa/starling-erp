import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink, Loader2, QrCode } from "lucide-react";
import { useReportTable, ReportToolbar, ReportPagination, downloadCsv } from "@/components/report-table-kit";

type UsageRow = {
  id: string;
  packageId: string;
  packageNumber: string | null;
  packageDate: string | null;
  posted: boolean;
  orderId: string | null;
  orderNumber: string | null;
  customerName: string | null;
  warehouseName: string | null;
  binCode: string | null;
  binName: string | null;
  coords: string | null;
  itemName: string;
  itemSku: string | null;
  quantity: number;
};

const qty = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 4 });

function BinUsageLogPage() {
  const { tenant } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["bin-usage-log", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data: lines, error } = await supabase
        .from("package_lines")
        .select("id,document_id,item_id,quantity,location_id,created_at")
        .eq("tenant_id", tenant!.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;

      const packageIds = [...new Set((lines ?? []).map((line: any) => line.document_id).filter(Boolean))];
      const itemIds = [...new Set((lines ?? []).map((line: any) => line.item_id).filter(Boolean))];
      const locationIds = [...new Set((lines ?? []).map((line: any) => line.location_id).filter(Boolean))];

      const [{ data: packages }, { data: items }, { data: locations }] = await Promise.all([
        packageIds.length
          ? supabase
              .from("packages")
              .select("id,number,date,posted_at,sales_order_id,customer_id,warehouse_id")
              .in("id", packageIds)
          : Promise.resolve({ data: [] as any[] }),
        itemIds.length
          ? supabase.from("items").select("id,name,sku").in("id", itemIds)
          : Promise.resolve({ data: [] as any[] }),
        locationIds.length
          ? supabase
              .from("warehouse_locations")
              .select("id,code,name,aisle,rack,level,bin")
              .in("id", locationIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const orderIds = [...new Set((packages ?? []).map((p: any) => p.sales_order_id).filter(Boolean))];
      const customerIds = [...new Set((packages ?? []).map((p: any) => p.customer_id).filter(Boolean))];
      const warehouseIds = [...new Set((packages ?? []).map((p: any) => p.warehouse_id).filter(Boolean))];

      const [{ data: orders }, { data: customers }, { data: warehouses }] = await Promise.all([
        orderIds.length
          ? supabase.from("sales_orders").select("id,number").in("id", orderIds)
          : Promise.resolve({ data: [] as any[] }),
        customerIds.length
          ? supabase.from("customers").select("id,name").in("id", customerIds)
          : Promise.resolve({ data: [] as any[] }),
        warehouseIds.length
          ? supabase.from("warehouses").select("id,name").in("id", warehouseIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const packageMap = new Map((packages ?? []).map((p: any) => [p.id, p]));
      const itemMap = new Map((items ?? []).map((i: any) => [i.id, i]));
      const locationMap = new Map((locations ?? []).map((l: any) => [l.id, l]));
      const orderMap = new Map((orders ?? []).map((o: any) => [o.id, o]));
      const customerMap = new Map((customers ?? []).map((c: any) => [c.id, c]));
      const warehouseMap = new Map((warehouses ?? []).map((w: any) => [w.id, w]));

      const rows: UsageRow[] = (lines ?? []).map((line: any) => {
        const pkg = packageMap.get(line.document_id);
        const location = line.location_id ? locationMap.get(line.location_id) : null;
        const coords = location ? [location.aisle, location.rack, location.level, location.bin].filter(Boolean).join("-") : "";
        return {
          id: line.id,
          packageId: line.document_id,
          packageNumber: pkg?.number ?? null,
          packageDate: pkg?.date ?? line.created_at,
          posted: !!pkg?.posted_at,
          orderId: pkg?.sales_order_id ?? null,
          orderNumber: pkg?.sales_order_id ? (orderMap.get(pkg.sales_order_id)?.number ?? null) : null,
          customerName: pkg?.customer_id ? (customerMap.get(pkg.customer_id)?.name ?? null) : null,
          warehouseName: pkg?.warehouse_id ? (warehouseMap.get(pkg.warehouse_id)?.name ?? null) : null,
          binCode: location?.code ?? null,
          binName: location?.name ?? null,
          coords: coords || null,
          itemName: itemMap.get(line.item_id)?.name ?? "—",
          itemSku: itemMap.get(line.item_id)?.sku ?? null,
          quantity: Number(line.quantity ?? 0),
        };
      });

      return rows;
    },
  });

  const table = useReportTable<UsageRow>({
    rows: data ?? [],
    searchText: (r) => [r.packageNumber, r.orderNumber, r.customerName, r.binCode, r.binName, r.itemName, r.itemSku, r.warehouseName],
    getDate: (r) => r.packageDate,
    sorts: [
      { value: "date", label: "Date", get: (r) => r.packageDate },
      { value: "package", label: "Package", get: (r) => r.packageNumber },
      { value: "customer", label: "Customer", get: (r) => r.customerName },
      { value: "bin", label: "Bin", get: (r) => r.binCode },
      { value: "item", label: "Item", get: (r) => r.itemName },
      { value: "qty", label: "Quantity", get: (r) => r.quantity },
    ],
    defaultSort: "date",
  });
  const rows = table.pageRows;

  const exportCsv = () =>
    downloadCsv("bin-usage-log", ["Date", "Package", "Sales Order", "Customer", "Warehouse", "Bin", "Bin Name", "Item", "SKU", "Quantity", "Status"],
      table.filtered.map((row) => [row.packageDate, row.packageNumber, row.orderNumber, row.customerName, row.warehouseName, row.binCode ?? "Not recorded", row.binName, row.itemName, row.itemSku, row.quantity, row.posted ? "Confirmed" : "Draft"]));

  return (
    <div className="flex w-full flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <QrCode className="h-5 w-5" /> Bin Usage Log
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Every packed line with the bin it was picked from, its package, order and customer.
          </p>
        </div>
      </div>

      <Card className="overflow-hidden border p-0 shadow-sm">
        <ReportToolbar table={table} placeholder="Search package, order, bin, item…" onExport={exportCsv} />

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20">
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Package</TableHead>
                <TableHead className="text-xs">Sales Order</TableHead>
                <TableHead className="text-xs">Customer</TableHead>
                <TableHead className="text-xs">Warehouse</TableHead>
                <TableHead className="text-xs">Picked from bin</TableHead>
                <TableHead className="text-xs">Item</TableHead>
                <TableHead className="w-24 text-right text-xs">Qty</TableHead>
                <TableHead className="text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                    No packed lines yet. Pack a package from a sales order to start the log.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-sm">
                    {row.packageDate
                      ? new Date(row.packageDate).toLocaleDateString(undefined, {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/sales/packages/$id"
                      params={{ id: row.packageId }}
                      search={{ order: undefined }}
                      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      {row.packageNumber ?? "Draft package"}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </TableCell>
                  <TableCell>
                    {row.orderId ? (
                      <Link
                        to="/sales/orders/$id"
                        params={{ id: row.orderId }}
                        className="text-sm text-primary hover:underline"
                      >
                        {row.orderNumber ?? "View order"}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{row.customerName ?? "—"}</TableCell>
                  <TableCell className="text-sm">{row.warehouseName ?? "—"}</TableCell>
                  <TableCell>
                    {row.binCode ? (
                      <div className="flex flex-col">
                        <span className="font-mono text-xs font-semibold">{row.binCode}</span>
                        <span className="text-xs text-muted-foreground">
                          {row.binName ?? row.coords ?? ""}
                        </span>
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        Not recorded
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{row.itemName}</div>
                    {row.itemSku && <div className="font-mono text-xs text-muted-foreground">{row.itemSku}</div>}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{qty(row.quantity)}</TableCell>
                  <TableCell>
                    <Badge variant={row.posted ? "secondary" : "outline"} className="text-xs">
                      {row.posted ? "Confirmed" : "Draft"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ReportPagination table={table} label="packed lines" />
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/inventory_/bin-usage")({
  component: BinUsageLogPage,
  head: () => ({
    meta: [
      { title: "Bin Usage Log | AURORA ERP" },
      { name: "description", content: "See which warehouse bin each packed line was picked from." },
      { property: "og:title", content: "Bin Usage Log | AURORA ERP" },
      { property: "og:description", content: "See which warehouse bin each packed line was picked from." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
