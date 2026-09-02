import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { useFkOptions } from "@/hooks/use-module-data";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { buildUomEngine, roundQty, type UomMaster, type UomConversionRow } from "@/lib/uom";

const money = (n: number) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const Route = createFileRoute("/_authenticated/manufacturing/bom/$id")({
  component: BomEditorRoute,
});

function BomEditorRoute() {
  const { id } = Route.useParams();
  return <BomEditor id={id} />;
}

interface BomLine {
  id?: string;
  line_no: number;
  item_id: string;
  quantity: number;
  uom: string; // UOM the quantity is specified in
  unit_cost: number;
  line_total: number;
  // derived — shown in table but not persisted directly
  stock_uom?: string; // item's stock UOM
  uom_factor?: number; // pre-computed conversion factor to stock UOM
}

function BomEditor({ id }: { id: string }) {
  const isNew = id === "new";
  const { tenant, can } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const canWrite = can(["manufacturing.create", "manufacturing.update"]);

  const [header, setHeader] = useState({
    code: "",
    product_id: "",
    version: "",
    yield_qty: 1,
    status: "Active",
    notes: "",
  });
  const [lines, setLines] = useState<BomLine[]>([]);

  const { data: doc, isLoading } = useQuery({
    queryKey: ["bom_headers", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await db.from("bom_headers").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: existingLines } = useQuery({
    queryKey: ["bom_lines", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await db
        .from("bom_lines")
        .select("*")
        .eq("bom_id", id)
        .is("deleted_at", null)
        .order("line_no");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  useEffect(() => {
    if (doc)
      setHeader({
        code: doc.code ?? "",
        product_id: doc.product_id ?? "",
        version: doc.version ?? "",
        yield_qty: doc.yield_qty ?? 1,
        status: doc.status ?? "Active",
        notes: doc.notes ?? "",
      });
  }, [doc]);

  useEffect(() => {
    if (existingLines)
      setLines(
        existingLines.map((l) => ({
          id: l.id,
          line_no: l.line_no,
          item_id: l.item_id ?? "",
          quantity: Number(l.quantity) || 0,
          uom: l.uom ?? "",
          unit_cost: Number(l.unit_cost) || 0,
          line_total: Number(l.line_total) || 0,
          stock_uom: undefined,
          uom_factor: l.uom_factor ? Number(l.uom_factor) : undefined,
        })),
      );
  }, [existingLines]);

  const { data: items = [] } = useFkOptions("items", "name");

  // UOM master + global conversions for conversion preview
  const { data: uomMaster = [] } = useQuery({
    queryKey: ["units_of_measure", "master"],
    queryFn: async () => {
      const { data } = await db
        .from("units_of_measure")
        .select("*")
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name");
      return (data ?? []) as UomMaster[];
    },
    staleTime: 60_000,
  });

  const { data: allConversions = [] } = useQuery({
    queryKey: ["uom_conversions", "all"],
    queryFn: async () => {
      const { data } = await db.from("uom_conversions").select("*").is("deleted_at", null);
      return (data ?? []) as UomConversionRow[];
    },
    staleTime: 30_000,
  });

  const uomEngine = useMemo(() => buildUomEngine(uomMaster, allConversions), [uomMaster, allConversions]);

  const uomOptions =
    uomMaster.length > 0
      ? uomMaster.map((u) => u.code)
      : ["pc", "pcs", "kg", "g", "lb", "m", "cm", "l", "ml", "box", "ctn", "pack", "doz", "pair", "roll", "sheet"];

  const addLine = () => {
    setLines([...lines, { line_no: lines.length + 1, item_id: "", quantity: 1, uom: "", unit_cost: 0, line_total: 0 }]);
  };

  const updateLine = (idx: number, field: keyof BomLine, value: any) => {
    setLines(
      lines.map((l, i) => {
        if (i !== idx) return l;
        const updated = { ...l, [field]: value };
        if (field === "item_id") {
          const item = items.find((it: any) => it.id === value);
          if (item) {
            updated.unit_cost = Number((item as any).cost) || 0;
            updated.stock_uom = (item as any).uom ?? "pc";
            // Default UOM to item's stock UOM if not set
            if (!updated.uom) updated.uom = updated.stock_uom ?? "";
          }
        }
        // Recompute uom_factor when UOM or item changes
        if ((field === "uom" || field === "item_id") && updated.uom && updated.stock_uom) {
          const result = uomEngine.convert(1, updated.uom, updated.stock_uom);
          updated.uom_factor = result?.factor ?? 1;
        }
        updated.line_total = Math.round(Number(updated.quantity) * Number(updated.unit_cost) * 100) / 100;
        return updated;
      }),
    );
  };

  const removeLine = async (idx: number) => {
    const line = lines[idx];
    if (line.id) {
      await db.from("bom_lines").update({ deleted_at: new Date().toISOString() }).eq("id", line.id);
      qc.invalidateQueries({ queryKey: ["bom_lines"] });
    }
    setLines(lines.filter((_, i) => i !== idx).map((l, i) => ({ ...l, line_no: i + 1 })));
  };

  const totalCost = lines.reduce((sum, l) => sum + (l.line_total || 0), 0);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("No tenant");
      if (!header.code.trim()) throw new Error("BOM code is required");
      if (!header.product_id) throw new Error("Product is required");

      let bomId = id;
      const payload = {
        code: header.code,
        product_id: header.product_id,
        version: header.version,
        yield_qty: Number(header.yield_qty) || 1,
        status: header.status,
        notes: header.notes,
      };

      if (isNew) {
        const { data, error } = await db
          .from("bom_headers")
          .insert({ ...payload, tenant_id: tenant.id })
          .select()
          .single();
        if (error) throw error;
        bomId = data.id;
      } else {
        const { error } = await db.from("bom_headers").update(payload).eq("id", id);
        if (error) throw error;
      }

      for (const line of lines) {
        if (!line.item_id) continue;
        const linePayload = {
          tenant_id: tenant.id,
          bom_id: bomId,
          line_no: line.line_no,
          item_id: line.item_id,
          quantity: Number(line.quantity),
          uom: line.uom || null,
          uom_factor: line.uom_factor != null ? Number(line.uom_factor) : null,
          unit_cost: Number(line.unit_cost),
          line_total: Number(line.line_total),
        };
        if (line.id) {
          const { error } = await db.from("bom_lines").update(linePayload).eq("id", line.id);
          if (error) throw error;
        } else {
          const { error } = await db.from("bom_lines").insert(linePayload);
          if (error) throw error;
        }
      }

      return bomId;
    },
    onSuccess: (bomId) => {
      toast.success("BOM saved");
      qc.invalidateQueries({ queryKey: ["bom_headers"] });
      qc.invalidateQueries({ queryKey: ["bom_lines"] });
      if (isNew) nav({ to: "/manufacturing/bom/$id", params: { id: bomId } });
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  if (isLoading)
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/manufacturing/bom">
            <ArrowLeft className="h-4 w-4 mr-1" /> BOMs
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{isNew ? "New BOM" : `BOM ${header.code}`}</h1>
        {doc?.status && <Badge variant="secondary">{doc.status}</Badge>}
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="grid gap-1.5">
            <Label>BOM Code *</Label>
            <Input
              value={header.code}
              onChange={(e) => setHeader({ ...header, code: e.target.value })}
              disabled={!canWrite}
              placeholder="BOM-001"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Product *</Label>
            <Select
              value={header.product_id || undefined}
              onValueChange={(v) => setHeader({ ...header, product_id: v })}
              disabled={!canWrite}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select product…" />
              </SelectTrigger>
              <SelectContent>
                {items.map((it: any) => (
                  <SelectItem key={it.id} value={it.id}>
                    {it.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Version</Label>
            <Input
              value={header.version}
              onChange={(e) => setHeader({ ...header, version: e.target.value })}
              disabled={!canWrite}
              placeholder="v1"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Yield Qty</Label>
            <Input
              type="number"
              step="any"
              value={header.yield_qty}
              onChange={(e) => setHeader({ ...header, yield_qty: Number(e.target.value) })}
              disabled={!canWrite}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Status</Label>
            <Select
              value={header.status}
              onValueChange={(v) => setHeader({ ...header, status: v })}
              disabled={!canWrite}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Active", "Draft", "Archived"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5 col-span-2 md:col-span-3">
            <Label>Notes</Label>
            <Input
              value={header.notes}
              onChange={(e) => setHeader({ ...header, notes: e.target.value })}
              disabled={!canWrite}
            />
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3 bg-muted/30">
          <h2 className="text-sm font-semibold">Components</h2>
          {canWrite && (
            <Button size="sm" variant="outline" onClick={addLine}>
              <Plus className="h-4 w-4 mr-1" /> Add Component
            </Button>
          )}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20">
                <TableHead className="w-12 text-xs">#</TableHead>
                <TableHead className="text-xs">Component</TableHead>
                <TableHead className="text-right text-xs w-24">Qty</TableHead>
                <TableHead className="text-xs w-24">UoM</TableHead>
                <TableHead className="text-right text-xs w-28">Stock Qty</TableHead>
                <TableHead className="text-right text-xs w-32">Unit Cost</TableHead>
                <TableHead className="text-right text-xs w-32">Line Total</TableHead>
                {canWrite && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canWrite ? 8 : 7} className="text-center text-sm text-muted-foreground py-8">
                    No components yet. Click "Add Component" to define the recipe.
                  </TableCell>
                </TableRow>
              )}
              {lines.map((line, idx) => {
                const itemMeta = items.find((it: any) => it.id === line.item_id) as any;
                const stockUom = line.stock_uom ?? itemMeta?.uom ?? "pc";
                const lineUom = line.uom || stockUom;
                const isDifferentUom = lineUom && stockUom && lineUom !== stockUom;
                const uomError = isDifferentUom
                  ? uomEngine.hasPath(lineUom, stockUom, line.item_id || null)
                    ? null
                    : "No path"
                  : null;
                let stockQtyDisplay: string | null = null;
                if (isDifferentUom && line.quantity > 0 && !uomError) {
                  const res = uomEngine.convert(line.quantity, lineUom, stockUom, line.item_id || null);
                  stockQtyDisplay = res ? `${roundQty(res.qty)} ${stockUom}` : null;
                }

                return (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{line.line_no}</TableCell>
                    <TableCell>
                      <Select
                        value={line.item_id || undefined}
                        onValueChange={(v) => updateLine(idx, "item_id", v)}
                        disabled={!canWrite}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Select item…" />
                        </SelectTrigger>
                        <SelectContent>
                          {items.map((it: any) => (
                            <SelectItem key={it.id} value={it.id}>
                              {it.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        className="h-8 text-right"
                        value={line.quantity}
                        onChange={(e) => updateLine(idx, "quantity", Number(e.target.value))}
                        disabled={!canWrite}
                      />
                    </TableCell>
                    <TableCell>
                      <Select value={lineUom} onValueChange={(v) => updateLine(idx, "uom", v)} disabled={!canWrite}>
                        <SelectTrigger className={`h-8 text-xs ${uomError ? "border-destructive" : ""}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {uomOptions.map((o) => (
                            <SelectItem key={o} value={o}>
                              {o}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {uomError && <p className="text-[10px] text-destructive mt-0.5">{uomError}</p>}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-xs text-muted-foreground">
                      {stockQtyDisplay ? (
                        <span title="Converted to stock UoM">{stockQtyDisplay}</span>
                      ) : (
                        <span className="text-foreground">
                          {line.quantity} {stockUom}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        step="any"
                        className="h-8 text-right"
                        value={line.unit_cost}
                        onChange={(e) => updateLine(idx, "unit_cost", Number(e.target.value))}
                        disabled={!canWrite}
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{money(line.line_total)}</TableCell>
                    {canWrite && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeLine(idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-end gap-4 border-t px-4 py-3 bg-muted/30">
          <span className="text-sm text-muted-foreground">Total Component Cost</span>
          <span className="text-lg font-semibold font-mono tabular-nums">{money(totalCost)}</span>
        </div>
      </Card>

      {canWrite && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" asChild>
            <Link to="/manufacturing/bom">Cancel</Link>
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isNew ? "Create BOM" : "Save Changes"}
          </Button>
        </div>
      )}
    </div>
  );
}
