import { useState } from "react";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { CheckCircle2, RefreshCw, ShieldCheck, AlertTriangle, Loader2, Lock, Settings, XCircle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const qty = (v: any) =>
  v == null
    ? "0"
    : Number(v).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

export function InventoryStockTools() {
  const { can } = useAuth();
  const qc = useQueryClient();

  // ── Stock projection integrity ────────────────────────────────────────────

  const [recalculating, setRecalculating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [projectionResults, setProjectionResults] = useState<any[]>([]);

  const recalculate = async () => {
    setRecalculating(true);
    try {
      const { data, error } = await db.rpc("recalculate_item_stock_projection", {
        _item_id: null,
      });
      if (error) throw error;
      toast.success(`Stock projection recalculated for ${data ?? 0} item(s).`);
      await checkIntegrity();
    } catch (e: any) {
      toast.error(e?.message ?? "Unable to recalculate stock.");
    } finally {
      setRecalculating(false);
    }
  };

  const checkIntegrity = async () => {
    setChecking(true);
    try {
      const { data, error } = await db.rpc("check_inventory_stock_integrity", {
        _item_id: null,
      });
      if (error) throw error;
      setProjectionResults((data ?? []) as any[]);
      const invalid = (data ?? []).filter((r: any) => !r.is_valid).length;
      if (invalid === 0) toast.success("Stock integrity check passed.");
      else toast.warning(`${invalid} item(s) have a stock projection mismatch.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Unable to check stock integrity.");
    } finally {
      setChecking(false);
    }
  };

  const invalidCount = projectionResults.filter((r: any) => !r.is_valid).length;

  // ── Reservation integrity ─────────────────────────────────────────────────

  const [checkingRes, setCheckingRes] = useState(false);
  const [reservationResults, setReservationResults] = useState<any[]>([]);

  const checkReservations = async () => {
    setCheckingRes(true);
    try {
      const { data, error } = await db.rpc("check_reservation_integrity");
      if (error) throw error;
      setReservationResults((data ?? []) as any[]);
      const overReserved = (data ?? []).filter((r: any) => r.is_overreserved).length;
      const orphans = (data ?? []).filter((r: any) => r.orphan_count > 0).length;
      if (overReserved === 0 && orphans === 0) {
        toast.success("Reservation integrity check passed.");
      } else {
        const parts: string[] = [];
        if (overReserved > 0) parts.push(`${overReserved} item(s) over-reserved`);
        if (orphans > 0) parts.push(`${orphans} item(s) with orphan reservations`);
        toast.warning(parts.join("; "));
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Unable to check reservation integrity.");
    } finally {
      setCheckingRes(false);
    }
  };

  const overReservedCount = reservationResults.filter((r: any) => r.is_overreserved).length;
  const orphanCount = reservationResults.filter((r: any) => r.orphan_count > 0).length;
  const reservationIssues = overReservedCount + orphanCount;

  // ── allow_negative_stock config ───────────────────────────────────────────

  const { data: configRows = [] } = useQuery({
    queryKey: ["inventory_config"],
    enabled: can("inventory.update"),
    queryFn: async () => {
      const { data, error } = await db.from("inventory_config").select("key, value").eq("key", "allow_negative_stock");
      if (error) throw error;
      return (data ?? []) as { key: string; value: string }[];
    },
  });

  const allowNegative = configRows.find((r) => r.key === "allow_negative_stock")?.value === "true";

  const toggleNegativeStock = useMutation({
    mutationFn: async (newValue: boolean) => {
      const { error } = await db.rpc("upsert_inventory_config", {
        _key: "allow_negative_stock",
        _value: newValue ? "true" : "false",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Inventory config updated.");
      qc.invalidateQueries({ queryKey: ["inventory_config"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  // ── Guard ─────────────────────────────────────────────────────────────────

  if (!can("inventory.read")) return null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* ── Card 1: Stock Projection Integrity ─────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Stock Integrity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Stock movements are the source of truth. The item stock value is only a controlled performance projection.
          </p>

          <div className="flex flex-wrap gap-2">
            {can("inventory.update") && (
              <Button variant="outline" onClick={recalculate} disabled={recalculating}>
                {recalculating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Recalculate Stock
              </Button>
            )}
            <Button variant="outline" onClick={checkIntegrity} disabled={checking}>
              {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Stock Integrity Check
            </Button>
          </div>

          {projectionResults.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              {invalidCount === 0 ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              )}
              <span>
                {invalidCount === 0
                  ? "All item stock projections match the ledger."
                  : `${invalidCount} mismatch(es) detected.`}
              </span>
              <Badge variant={invalidCount === 0 ? "secondary" : "destructive"}>
                {projectionResults.length} items checked
              </Badge>
            </div>
          )}

          {/* Show mismatched rows */}
          {projectionResults.filter((r: any) => !r.is_valid).length > 0 && (
            <div className="rounded-md border overflow-hidden mt-2">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20">
                    <TableHead className="text-xs">Item</TableHead>
                    <TableHead className="text-xs">SKU</TableHead>
                    <TableHead className="text-xs text-right">Ledger</TableHead>
                    <TableHead className="text-xs text-right">Projected</TableHead>
                    <TableHead className="text-xs text-right">Diff</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projectionResults
                    .filter((r: any) => !r.is_valid)
                    .map((r: any) => (
                      <TableRow key={r.item_id}>
                        <TableCell className="text-sm font-medium">{r.item_name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{r.sku ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-sm">
                          {qty(r.ledger_on_hand)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-sm">
                          {qty(r.projected_stock)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono tabular-nums text-sm font-semibold ${
                            Number(r.difference) !== 0 ? "text-destructive" : ""
                          }`}
                        >
                          {qty(r.difference)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Card 2: Reservation Integrity ──────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4" /> Reservation Integrity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Checks for over-reserved items (reserved &gt; on-hand) and orphan reservations whose source document has
            been cancelled or deleted.
          </p>

          <Button variant="outline" onClick={checkReservations} disabled={checkingRes}>
            {checkingRes ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
            Check Reservation Integrity
          </Button>

          {/* Summary badge */}
          {reservationResults.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              {reservationIssues === 0 ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              )}
              <span>
                {reservationIssues === 0 ? "All reservations are valid." : `${reservationIssues} issue(s) found.`}
              </span>
              <Badge variant={reservationIssues === 0 ? "secondary" : "destructive"}>
                {reservationResults.length} item(s) with active reservations
              </Badge>
            </div>
          )}

          {/* Detail table */}
          {reservationResults.length > 0 && (
            <div className="rounded-md border overflow-hidden mt-2">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20">
                    <TableHead className="text-xs">Item</TableHead>
                    <TableHead className="text-xs">SKU</TableHead>
                    <TableHead className="text-xs text-right">On Hand</TableHead>
                    <TableHead className="text-xs text-right">Reserved</TableHead>
                    <TableHead className="text-xs text-right">Available</TableHead>
                    <TableHead className="text-xs text-center">Status</TableHead>
                    <TableHead className="text-xs text-right">Orphans</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reservationResults.map((r: any, i: number) => (
                    <TableRow key={`${r.item_id}-${i}`}>
                      <TableCell className="text-sm font-medium">{r.item_name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.item_sku ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-sm">{qty(r.on_hand)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-sm text-amber-600">
                        {qty(r.reserved)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono tabular-nums text-sm font-semibold ${
                          r.is_overreserved ? "text-destructive" : ""
                        }`}
                      >
                        {qty(r.available)}
                      </TableCell>
                      <TableCell className="text-center">
                        {r.is_overreserved ? (
                          <Badge variant="destructive" className="text-xs gap-1">
                            <XCircle className="h-3 w-3" /> Over-reserved
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs gap-1 bg-success/15 text-success border-0">
                            <CheckCircle2 className="h-3 w-3" /> OK
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {r.orphan_count > 0 ? (
                          <span className="text-destructive font-medium">{r.orphan_count}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Card 3: Inventory Config ────────────────────────────────────── */}
      {can("inventory.update") && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" /> Inventory Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="allow-negative-stock" className="text-sm font-medium cursor-pointer">
                  Allow Negative Stock
                </Label>
                <p className="text-xs text-muted-foreground max-w-xs">
                  When enabled, reservations and stock movements are accepted even when available stock would go below
                  zero. Disable to enforce strict availability checks.
                </p>
              </div>
              <Switch
                id="allow-negative-stock"
                checked={allowNegative}
                onCheckedChange={(v) => toggleNegativeStock.mutate(v)}
                disabled={toggleNegativeStock.isPending}
              />
            </div>

            {allowNegative && (
              <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Negative stock is enabled. Reservations will be accepted even if available stock is insufficient.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
