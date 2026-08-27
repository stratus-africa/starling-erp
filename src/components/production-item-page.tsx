import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft,
  Save,
  Loader2,
  ImagePlus,
  Package,
  Info,
  TrendingUp,
  ShoppingCart,
  FileText,
  ReceiptText,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: any) =>
  !v ? "—" : new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

const money = (v: any, currency = "KES") =>
  v == null
    ? "—"
    : `${currency} ${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const qty = (v: any) =>
  v == null ? "0.00" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Stock metric row ─────────────────────────────────────────────────────────

function StockRow({ label, value, blue }: { label: string; value: number; blue?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono tabular-nums ${blue ? "text-blue-500" : ""}`}>: {qty(value)}</span>
    </div>
  );
}

// ─── Pending Qty Card ─────────────────────────────────────────────────────────

function PendingCard({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <span className="text-2xl font-semibold tabular-nums">{qty(value)}</span>
        <span className="text-xs text-muted-foreground">Qty</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ProductionItemPage({ id }: { id: string }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { tenant, hasRole } = useAuth();
  const canWrite = hasRole(["tenant_admin", "super_admin", "manufacturing"]);
  const isNew = id === "new";

  // ── Fetch item ──
  const { data: item, isLoading } = useQuery({
    queryKey: ["items", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  // ── Fetch stock movements for this item ──
  const { data: movements = [] } = useQuery({
    queryKey: ["stock_movements", "item", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*, warehouses(name)")
        .eq("item_id", id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // ── Stock by warehouse (for Locations tab) ──
  const stockByWarehouse = movements.reduce((acc: Record<string, { name: string; qty: number }>, m) => {
    const wid = m.warehouse_id ?? "__none";
    const wname = m.warehouses?.name ?? "No Warehouse";
    if (!acc[wid]) acc[wid] = { name: wname, qty: 0 };
    acc[wid].qty += Number(m.quantity ?? 0);
    return acc;
  }, {});

  // ── Fetch BOM lines for this item as finished product (Associated Items = components) ──
  const { data: bomLines = [] } = useQuery({
    queryKey: ["bom_lines", "for-item", id],
    enabled: !isNew,
    queryFn: async () => {
      // First get BOM headers where this item is the product
      const { data: headers, error: hErr } = await supabase
        .from("bom_headers")
        .select("id")
        .eq("product_id", id)
        .is("deleted_at", null)
        .limit(5);
      if (hErr || !headers?.length) return [];
      const bomIds = headers.map((h) => h.id);
      // Then get the component lines for those BOMs
      const { data, error } = await supabase
        .from("bom_lines")
        .select("*, items(id, name, sku, stock)")
        .in("bom_id", bomIds)
        .is("deleted_at", null)
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // ── Pending quantities ──
  // To be Shipped: sum of open package_lines qty for this item
  const { data: pendingShip = 0 } = useQuery({
    queryKey: ["package_lines", "pending-ship", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data } = await supabase
        .from("package_lines")
        .select("quantity, packages(status)")
        .eq("item_id", id)
        .is("deleted_at", null);
      return (data ?? [])
        .filter((l: any) => ["Draft", "Packed"].includes(l.packages?.status))
        .reduce((s: number, l: any) => s + Number(l.quantity ?? 0), 0);
    },
  });

  const { data: pendingReceive = 0 } = useQuery({
    queryKey: ["production_orders", "pending-receive", id],
    enabled: !isNew,
    queryFn: async () => {
      // Find BOM headers for this product
      const { data: headers } = await supabase
        .from("bom_headers")
        .select("id")
        .eq("product_id", id)
        .is("deleted_at", null);
      if (!headers?.length) return 0;
      const bomIds = headers.map((h) => h.id);
      // Find open production orders using those BOMs
      const { data } = await supabase
        .from("production_orders")
        .select("quantity, status")
        .in("bom_id", bomIds)
        .is("deleted_at", null)
        .in("status", ["Draft", "Confirmed", "In Progress"]);
      return (data ?? []).reduce((s: number, o: any) => s + Number(o.quantity ?? 0), 0);
    },
  });

  const { data: pendingInvoice = 0 } = useQuery({
    queryKey: ["sales_order_lines", "pending-invoice", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_order_lines")
        .select("quantity, sales_orders!document_id(status, converted_invoice_id)")
        .eq("item_id", id)
        .is("deleted_at", null);
      return (data ?? [])
        .filter((l: any) => {
          const s = l.sales_orders?.status;
          const invoiced = !!l.sales_orders?.converted_invoice_id;
          return !invoiced && ["Confirmed", "Processing", "Packed", "Shipped"].includes(s);
        })
        .reduce((s: number, l: any) => s + Number(l.quantity ?? 0), 0);
    },
  });

  const { data: pendingBill = 0 } = useQuery({
    queryKey: ["purchase_order_lines", "pending-bill", id],
    enabled: !isNew,
    queryFn: async () => {
      // purchase_order_lines not yet in typed schema — return 0 gracefully
      return 0;
    },
  });

  // ── Form state ──
  const [values, setValues] = useState<Record<string, any>>({
    name: "",
    sku: "",
    type: "Finished Good",
    uom: "pc",
    cost: "",
    price: "",
    description: "",
  });

  // Sync when item loads
  const [synced, setSynced] = useState(false);
  if (item && !synced) {
    setValues({
      name: item.name ?? "",
      sku: item.sku ?? "",
      type: item.type ?? "Finished Good",
      uom: item.uom ?? "pc",
      cost: item.cost ?? "",
      price: item.price ?? "",
      description: item.description ?? "",
    });
    setSynced(true);
  }

  const set = (k: string, v: any) => setValues((p) => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("No workspace");
      if (!values.name?.trim()) throw new Error("Item name is required");
      const payload = {
        name: values.name.trim(),
        sku: values.sku || null,
        type: values.type || "Finished Good",
        uom: values.uom || "pc",
        cost: values.cost === "" ? null : Number(values.cost),
        price: values.price === "" ? null : Number(values.price),
        description: values.description || null,
        tenant_id: tenant.id,
      };
      if (isNew) {
        const { data, error } = await supabase.from("items").insert(payload).select("id").single();
        if (error) throw error;
        return data.id;
      }
      const { error } = await supabase.from("items").update(payload).eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (newId) => {
      toast.success(isNew ? "Item created" : "Item saved");
      qc.invalidateQueries({ queryKey: ["items"] });
      if (isNew) nav({ to: "/manufacturing/items/$id" as any, params: { id: newId } });
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  if (!isNew && isLoading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading item…
      </div>
    );
  }

  const stockOnHand = Number(item?.stock ?? 0);
  const committed = movements
    .filter((m: any) => m.ref_type === "sales_order" && m.quantity < 0)
    .reduce((s: number, m: any) => s + Math.abs(m.quantity), 0);
  const available = Math.max(0, stockOnHand - committed);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => nav({ to: "/manufacturing/items" as any })}>
            <ArrowLeft className="mr-1 h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{isNew ? "New Production Item" : (item?.name ?? "Item")}</h1>
            {!isNew && item?.sku && <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>}
          </div>
          {!isNew && item?.type && (
            <Badge variant="secondary" className="shrink-0">
              {item.type}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <Button variant="outline" size="sm">
              Create Assemblies
            </Button>
          )}
          {canWrite && (
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-4 w-4" />
              )}
              Save
            </Button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="min-h-0 flex-1 overflow-auto">
        <Tabs defaultValue="overview" className="h-full flex flex-col">
          <div className="shrink-0 border-b px-6">
            <TabsList className="h-10 bg-transparent gap-0 p-0">
              {["overview", "locations", "transactions", "history"].map((t) => (
                <TabsTrigger
                  key={t}
                  value={t}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent capitalize px-4"
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* ── Overview ── */}
          <TabsContent value="overview" className="mt-0 flex-1 overflow-auto">
            <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_340px] min-h-full">
              {/* Left column */}
              <div className="flex flex-col gap-5 border-r p-6">
                {/* Primary Details */}
                <section>
                  <h2 className="mb-3 text-sm font-semibold">Primary Details</h2>
                  <div className="grid grid-cols-[160px_1fr] gap-y-3 text-sm">
                    <span className="text-muted-foreground">Item Name</span>
                    <div>
                      {canWrite ? (
                        <Input
                          className="h-7 text-sm"
                          value={values.name}
                          onChange={(e) => set("name", e.target.value)}
                          placeholder="Item name…"
                        />
                      ) : (
                        <span className="text-primary font-medium">{values.name || "—"}</span>
                      )}
                    </div>

                    <span className="text-muted-foreground">Item Type</span>
                    <div>
                      {canWrite ? (
                        <Select value={values.type} onValueChange={(v) => set("type", v)}>
                          <SelectTrigger className="h-7 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["Finished Good", "Raw Material", "Sub-assembly", "Service", "Consumable"].map((o) => (
                              <SelectItem key={o} value={o}>
                                {o}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span>{values.type || "—"}</span>
                      )}
                    </div>

                    <span className="text-muted-foreground">SKU</span>
                    <div>
                      {canWrite ? (
                        <Input
                          className="h-7 text-sm font-mono"
                          value={values.sku}
                          onChange={(e) => set("sku", e.target.value)}
                          placeholder="SKU…"
                        />
                      ) : (
                        <span className="font-mono">{values.sku || "—"}</span>
                      )}
                    </div>

                    <span className="text-muted-foreground">Unit</span>
                    <div>
                      {canWrite ? (
                        <Select value={values.uom} onValueChange={(v) => set("uom", v)}>
                          <SelectTrigger className="h-7 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["pc", "kg", "g", "lb", "m", "cm", "l", "ml", "box", "pack", "pcs"].map((o) => (
                              <SelectItem key={o} value={o}>
                                {o}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span>{values.uom || "—"}</span>
                      )}
                    </div>

                    <span className="text-muted-foreground">Inventory Account</span>
                    <span>Finished Goods</span>

                    <span className="text-muted-foreground">Inventory Valuat…</span>
                    <span>FIFO (First In First Out)</span>
                  </div>
                </section>

                <Separator />

                {/* Purchase Information */}
                <section>
                  <h2 className="mb-3 text-sm font-semibold">Purchase Information</h2>
                  <div className="grid grid-cols-[160px_1fr] gap-y-3 text-sm">
                    <span className="text-muted-foreground">Cost Price</span>
                    <div>
                      {canWrite ? (
                        <Input
                          type="number"
                          step="any"
                          className="h-7 text-sm"
                          value={values.cost}
                          onChange={(e) => set("cost", e.target.value)}
                          placeholder="0.00"
                        />
                      ) : (
                        <span className="font-mono">{money(values.cost)}</span>
                      )}
                    </div>
                    <span className="text-muted-foreground">Purchase Account</span>
                    <span>Cost of Goods Sold.</span>
                  </div>
                </section>

                <Separator />

                {/* Sales Information */}
                <section>
                  <h2 className="mb-3 text-sm font-semibold">Sales Information</h2>
                  <div className="grid grid-cols-[160px_1fr] gap-y-3 text-sm">
                    <span className="text-muted-foreground">Selling Price</span>
                    <div>
                      {canWrite ? (
                        <Input
                          type="number"
                          step="any"
                          className="h-7 text-sm"
                          value={values.price}
                          onChange={(e) => set("price", e.target.value)}
                          placeholder="0.00"
                        />
                      ) : (
                        <span className="font-mono">{money(values.price)}</span>
                      )}
                    </div>
                    <span className="text-muted-foreground">Sales Account</span>
                    <span>Sales</span>
                  </div>
                </section>

                <Separator />

                {/* Description / Notes */}
                <section>
                  <h2 className="mb-3 text-sm font-semibold">Reporting Tags</h2>
                  {canWrite ? (
                    <Textarea
                      rows={2}
                      className="text-sm"
                      placeholder="Add reporting tags or notes…"
                      value={values.description}
                      onChange={(e) => set("description", e.target.value)}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {values.description || "No reporting tag has been associated with this item."}
                    </p>
                  )}
                </section>

                {/* Associated Items */}
                {!isNew && bomLines.length > 0 && (
                  <>
                    <Separator />
                    <section>
                      <h2 className="mb-3 text-sm font-semibold">Associated Items</h2>
                      <div className="rounded-md border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              <th className="px-3 py-2 text-left">Item Details</th>
                              <th className="px-3 py-2 text-right">Quantity</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bomLines.map((line: any) => (
                              <tr key={line.id} className="border-b last:border-0">
                                <td className="px-3 py-2">
                                  <p className="font-medium text-primary">{line.items?.name ?? "—"}</p>
                                  <p className="text-xs text-muted-foreground font-mono">
                                    [{line.items?.sku ?? "no-sku"}]
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Accounting Stock: {qty(line.items?.stock)}&nbsp;&nbsp; Physical Stock:{" "}
                                    {qty(line.items?.stock)}
                                  </p>
                                </td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums">{qty(line.quantity)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </>
                )}
              </div>

              {/* Right panel */}
              <div className="flex flex-col gap-5 p-6">
                {/* Image upload placeholder */}
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 p-8 text-center">
                  <ImagePlus className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    Drag image(s) here or <span className="cursor-pointer text-primary underline">Browse images</span>
                  </p>
                  <p className="text-xs text-muted-foreground/60 flex items-start gap-1">
                    <Info className="h-3 w-3 mt-0.5 shrink-0" />
                    You can add up to 15 images, each not exceeding 5 MB in size and 7000 × 7000 pixels resolution.
                  </p>
                </div>

                {/* Opening stock */}
                <div className="flex items-center gap-2 text-sm text-primary">
                  <Package className="h-4 w-4" />
                  <span>Opening Stock</span>
                  <span className="text-muted-foreground">ⓘ</span>
                  <span className="font-mono tabular-nums text-foreground">: {qty(0)}</span>
                </div>

                {/* Accounting Stock */}
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-sm font-semibold">Accounting Stock</h3>
                    <span className="text-muted-foreground text-xs">ⓘ</span>
                  </div>
                  <StockRow label="Stock on Hand" value={stockOnHand} blue />
                  <StockRow label="Committed Stock" value={committed} />
                  <StockRow label="Available for Sale" value={available} />
                </Card>

                {/* Physical Stock */}
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-sm font-semibold">Physical Stock</h3>
                    <span className="text-muted-foreground text-xs">ⓘ</span>
                  </div>
                  <StockRow label="Stock on Hand" value={stockOnHand} />
                  <StockRow label="Committed Stock" value={committed} />
                  <StockRow label="Available for Sale" value={available} />
                </Card>

                {/* Pending qty grid */}
                <div className="grid grid-cols-2 gap-3">
                  <PendingCard icon={Package} label="To be Shipped" value={pendingShip} />
                  <PendingCard icon={TrendingUp} label="To be Received" value={pendingReceive} />
                  <PendingCard icon={FileText} label="To be Invoiced" value={pendingInvoice} />
                  <PendingCard icon={ReceiptText} label="To be Billed" value={pendingBill} />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Locations ── */}
          <TabsContent value="locations" className="mt-0 flex-1 overflow-auto p-6">
            <Card className="overflow-hidden p-0">
              <CardHeader className="border-b px-4 py-3">
                <CardTitle className="text-sm">Stock by Location</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20">
                      <TableHead className="text-xs uppercase tracking-wider">Warehouse</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-right">Stock on Hand</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-right">Committed</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-right">Available</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(stockByWarehouse).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                          No location data available.
                        </TableCell>
                      </TableRow>
                    )}
                    {Object.entries(stockByWarehouse).map(([wid, w]: any) => (
                      <TableRow key={wid}>
                        <TableCell className="font-medium">{w.name}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-blue-500">{qty(w.qty)}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">0.00</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{qty(w.qty)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Transactions ── */}
          <TabsContent value="transactions" className="mt-0 flex-1 overflow-auto p-6">
            <Card className="overflow-hidden p-0">
              <CardHeader className="border-b px-4 py-3">
                <CardTitle className="text-sm">Stock Movements</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20">
                      <TableHead className="text-xs uppercase tracking-wider">Date</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">Type</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">Reference</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">Warehouse</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-right">Qty</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-right">Unit Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                          No transactions recorded yet.
                        </TableCell>
                      </TableRow>
                    )}
                    {movements.map((m: any) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {fmt(m.created_at)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs capitalize">
                            {(m.ref_type ?? "movement").replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {m.note ?? m.ref_id?.slice(0, 10) ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">{m.warehouses?.name ?? "—"}</TableCell>
                        <TableCell
                          className={`text-right font-mono tabular-nums text-sm ${m.quantity >= 0 ? "text-emerald-600" : "text-destructive"}`}
                        >
                          {m.quantity >= 0 ? "+" : ""}
                          {qty(m.quantity)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-sm">
                          {money(m.unit_cost)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── History ── */}
          <TabsContent value="history" className="mt-0 flex-1 overflow-auto p-6">
            <Card className="overflow-hidden p-0">
              <CardHeader className="border-b px-4 py-3">
                <CardTitle className="text-sm">Activity History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {movements.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">No activity recorded yet.</p>
                ) : (
                  <div className="divide-y">
                    {movements.slice(0, 50).map((m: any) => (
                      <div key={m.id} className="flex items-start gap-3 px-4 py-3">
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                          <Package className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="text-xs capitalize">
                              {(m.ref_type ?? "movement").replace(/_/g, " ")}
                            </Badge>
                            <span
                              className={`font-mono text-sm tabular-nums font-medium ${m.quantity >= 0 ? "text-emerald-600" : "text-destructive"}`}
                            >
                              {m.quantity >= 0 ? "+" : ""}
                              {qty(m.quantity)} {item?.uom ?? ""}
                            </span>
                            <span className="text-xs text-muted-foreground">{fmt(m.created_at)}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {m.note ?? "No note"}
                            {m.warehouses?.name ? ` · ${m.warehouses.name}` : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
