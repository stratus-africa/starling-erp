import { db } from "@/lib/typed-db";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, MapPin } from "lucide-react";

type Row = {
  warehouse_id: string | null;
  location_id: string | null;
  location_code: string | null;
  aisle: string | null;
  rack: string | null;
  level: string | null;
  bin: string | null;
  zone_name: string | null;
  on_hand: number | null;
};

const qty = (v: any) =>
  Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function InventoryLocationStock({ itemId, compact = false }: { itemId?: string; compact?: boolean }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["inventory_location_stock", itemId],
    enabled: !!itemId,
    queryFn: async () => {
      const { data, error } = await db
        .from("inventory_location_stock")
        .select("warehouse_id, location_id, location_code, aisle, rack, level, bin, zone_name, on_hand")
        .eq("item_id", itemId);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses_lookup"],
    queryFn: async () => {
      const { data, error } = await db.from("warehouses").select("id, name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const whName = (id: string | null) => warehouses.find((w) => w.id === id)?.name ?? "—";

  const table = (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/20">
            <TableHead className="text-xs">Warehouse</TableHead>
            <TableHead className="text-xs">Zone</TableHead>
            <TableHead className="text-xs">Location</TableHead>
            <TableHead className="text-xs text-right">On Hand</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-sm text-muted-foreground text-center py-6">
                No stock recorded by location.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r, i) => (
              <TableRow key={`${r.location_id ?? "none"}-${i}`}>
                <TableCell className="text-sm">{whName(r.warehouse_id)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.zone_name ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">
                  {r.location_code ??
                    [r.aisle, r.rack, r.level, r.bin].filter(Boolean).join("-") ??
                    "—"}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-sm">{qty(r.on_hand)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading stock by location…
      </div>
    );
  }

  if (compact) return table;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4" /> Stock by Location
        </CardTitle>
      </CardHeader>
      <CardContent>{table}</CardContent>
    </Card>
  );
}
