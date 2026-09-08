import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Factory, Loader2, Plus, RefreshCw, Warehouse } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/manufacturing/planning")({
  component: ProductionPlanningPage,
});

type PlanningRow = {
  item_id: string;
  item_name: string;
  sku: string | null;
  uom: string | null;
  warehouse_id: string;
  warehouse_name: string;
  current_stock: number;
  reserved: number;
  available: number;
  open_sales_orders: number;
  open_manufacturing: number;
  minimum_stock: number;
  maximum_stock: number;
  projected_available: number;
  suggested_production: number;
  active_bom_id: string | null;
  active_bom_version: string | null;
};

function qty(value: number) {
  return Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function MtsDialog({
  row,
  open,
  onOpenChange,
  onCreated,
}: {
  row: PlanningRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [quantity, setQuantity] = useState("");
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");
  const create = useMutation({
    mutationFn: async () => {
      if (!row?.active_bom_id) throw new Error("An active BOM is required");
      const value = Number(quantity);
      if (!Number.isFinite(value) || value <= 0) throw new Error("Enter a quantity greater than zero");
      const { data, error } = await (db as any).rpc("create_mts_manufacturing_order", {
        _item_id: row.item_id,
        _quantity: value,
        _warehouse_id: row.warehouse_id,
        _bom_id: row.active_bom_id,
        _planned_start: plannedStart || null,
        _planned_end: plannedEnd || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => {
      toast.success("MTS Manufacturing Order created.");
      setQuantity("");
      setPlannedStart("");
      setPlannedEnd("");
      onCreated();
      onOpenChange(false);
      window.location.assign(`/manufacturing/orders/${id}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Factory className="h-5 w-5" /> Create MTS Manufacturing Order</DialogTitle>
          <DialogDescription>Build finished goods into normal inventory. No Sales Order is required.</DialogDescription>
        </DialogHeader>
        {row && (
          <div className="space-y-4 py-2">
            <div className="rounded-md border bg-muted/20 p-3 text-sm">
              <div className="font-medium">{row.item_name}</div>
              <div className="text-xs text-muted-foreground">{row.warehouse_name} · BOM {row.active_bom_version ?? "Active"}</div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="mts-quantity">Quantity ({row.uom ?? "stock UOM"})</Label><Input id="mts-quantity" type="number" min="0.0001" step="any" value={quantity} placeholder={String(row.suggested_production || "0")} onChange={(event) => setQuantity(event.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="mts-start">Planned Start</Label><Input id="mts-start" type="date" value={plannedStart} onChange={(event) => setPlannedStart(event.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="mts-end">Planned Completion</Label><Input id="mts-end" type="date" value={plannedEnd} onChange={(event) => setPlannedEnd(event.target.value)} /></div>
            </div>
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => create.mutate()} disabled={create.isPending || !row?.active_bom_id}>{create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Create Manufacturing Order</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductionPlanningPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [warehouseId, setWarehouseId] = useState("all");
  const [selectedRow, setSelectedRow] = useState<PlanningRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses", "planning"],
    queryFn: async () => {
      const { data, error } = await db.from("warehouses").select("id,name,code").is("deleted_at", null).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: rows = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["mts_production_planning", warehouseId],
    queryFn: async () => {
      const { data, error } = await (db as any).rpc("get_mts_production_planning", { _warehouse_id: warehouseId === "all" ? null : warehouseId });
      if (error) throw error;
      return (data ?? []) as PlanningRow[];
    },
  });

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">Production Planning</h1><p className="text-sm text-muted-foreground">Plan MTS replenishment from stock, demand, reservations, and open manufacturing.</p></div>
        <div className="flex items-center gap-2"><Select value={warehouseId} onValueChange={setWarehouseId}><SelectTrigger className="w-[210px]"><Warehouse className="mr-2 h-4 w-4" /><SelectValue placeholder="All warehouses" /></SelectTrigger><SelectContent><SelectItem value="all">All warehouses</SelectItem>{warehouses.map((warehouse) => <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</SelectItem>)}</SelectContent></Select><Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh planning"><RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /></Button></div>
      </div>
      <Card><CardHeader><CardTitle className="text-sm">MTS Recommendations</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Warehouse</TableHead><TableHead className="text-right">Current</TableHead><TableHead className="text-right">Reserved</TableHead><TableHead className="text-right">Available</TableHead><TableHead className="text-right">Open Sales Orders</TableHead><TableHead className="text-right">Open Manufacturing</TableHead><TableHead className="text-right">Minimum</TableHead><TableHead className="text-right">Maximum</TableHead><TableHead className="text-right">Projected Available</TableHead><TableHead className="text-right">Suggested Production</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{isLoading ? <TableRow><TableCell colSpan={13} className="p-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow> : rows.length === 0 ? <TableRow><TableCell colSpan={13} className="p-10 text-center text-sm text-muted-foreground">No active inventory items or warehouses found.</TableCell></TableRow> : rows.map((row) => <TableRow key={`${row.item_id}-${row.warehouse_id}`}><TableCell><div className="font-medium">{row.item_name}</div><div className="font-mono text-xs text-muted-foreground">{row.sku ?? "No SKU"} · {row.uom ?? ""}</div></TableCell><TableCell>{row.warehouse_name}</TableCell><TableCell className="text-right font-mono">{qty(row.current_stock)}</TableCell><TableCell className="text-right font-mono">{qty(row.reserved)}</TableCell><TableCell className="text-right font-mono">{qty(row.available)}</TableCell><TableCell className="text-right font-mono">{qty(row.open_sales_orders)}</TableCell><TableCell className="text-right font-mono">{qty(row.open_manufacturing)}</TableCell><TableCell className="text-right font-mono">{qty(row.minimum_stock)}</TableCell><TableCell className="text-right font-mono">{qty(row.maximum_stock)}</TableCell><TableCell className="text-right font-mono">{qty(row.projected_available)}</TableCell><TableCell className="text-right font-mono font-semibold text-warning">{qty(row.suggested_production)}</TableCell><TableCell>{row.active_bom_id ? <Badge variant={row.suggested_production > 0 ? "default" : "secondary"}>{row.suggested_production > 0 ? "Recommend" : "Monitor"}</Badge> : <Badge variant="outline">No active BOM</Badge>}</TableCell><TableCell>{can("manufacturing.create") && row.active_bom_id ? <Button size="sm" onClick={() => { setSelectedRow(row); setDialogOpen(true); }}><Plus className="mr-1.5 h-4 w-4" />Create MTS</Button> : null}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>
      <MtsDialog row={selectedRow} open={dialogOpen} onOpenChange={setDialogOpen} onCreated={() => { qc.invalidateQueries({ queryKey: ["mts_production_planning", warehouseId] }); qc.invalidateQueries({ queryKey: ["production_orders"] }); }} />
    </div>
  );
}
