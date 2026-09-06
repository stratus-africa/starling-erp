/**
 * MaterialAvailabilityPanel
 *
 * Reusable panel that calls check_material_availability() and displays
 * per-component Required / On Hand / Reserved / Available / Shortage.
 *
 * Props:
 *   orderId          – production_orders.id
 *   orderQty         – shown in the header summary
 *   productName      – shown in the header summary
 *   allowShortage    – from inventory_config allow_production_shortage
 *   compact          – when true, renders a condensed single-card view
 *                      (used inside the runs page row expansion)
 *   onReserve        – optional callback — triggers create_production_reservations
 *   onRelease        – optional callback — triggers release_production_reservations
 *   reservedAlready  – when true, "Reserve Materials" button is suppressed
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Lock,
  Package,
  RefreshCw,
  Unlock,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AvailabilityRow = {
  item_id: string;
  item_name: string;
  sku: string | null;
  uom: string | null;
  required_qty: number;
  on_hand: number;
  reserved: number;
  available: number;
  shortage: number;
  warehouse_id: string | null;
  warehouse_name: string | null;
  is_subassembly: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const n = (v: number | null | undefined, dp = 4) =>
  Number(v ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: dp > 2 ? 2 : dp,
    maximumFractionDigits: dp,
  });

function AvailabilityBar({ available, required }: { available: number; required: number }) {
  if (required <= 0) return null;
  const pct = Math.min(100, Math.max(0, (available / required) * 100));
  const color =
    pct <= 0 ? "[&>div]:bg-destructive" :
    pct < 100 ? "[&>div]:bg-warning" :
    "[&>div]:bg-success";
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <Progress value={pct} className={`h-1.5 flex-1 ${color}`} />
      <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">
        {Math.round(pct)}%
      </span>
    </div>
  );
}

// ─── Status banner ────────────────────────────────────────────────────────────

function StatusBanner({
  rows,
  allowShortage,
  loading,
}: {
  rows: AvailabilityRow[];
  allowShortage: boolean;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking material availability…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Package className="h-4 w-4" />
        No BOM components found. Assign a BOM to this production order first.
      </div>
    );
  }

  const shortageRows = rows.filter((r) => Number(r.shortage) > 0);
  const hasShortage = shortageRows.length > 0;

  if (!hasShortage) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-success/40 bg-success/5 px-4 py-3">
        <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
        <div>
          <p className="text-sm font-semibold text-success">READY TO PRODUCE</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            All {rows.length} component{rows.length !== 1 ? "s" : ""} have sufficient available inventory.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
      <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-destructive">MATERIAL SHORTAGE</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {shortageRows.length} component{shortageRows.length !== 1 ? "s are" : " is"} short:&nbsp;
          {shortageRows.slice(0, 3).map((r) => r.item_name).join(", ")}
          {shortageRows.length > 3 ? ` and ${shortageRows.length - 3} more` : ""}.
        </p>
        {allowShortage && (
          <p className="text-xs text-warning mt-1 font-medium">
            ⚠ Allow Production Shortage is enabled — release is still permitted.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface MaterialAvailabilityPanelProps {
  orderId: string;
  orderQty?: number;
  productName?: string;
  allowShortage?: boolean;
  compact?: boolean;
  reservedAlready?: boolean;
  canWrite?: boolean;
  onReserveSuccess?: (rows: AvailabilityRow[]) => void;
  onReleaseSuccess?: () => void;
}

export function MaterialAvailabilityPanel({
  orderId,
  orderQty,
  productName,
  allowShortage = false,
  compact = false,
  reservedAlready = false,
  canWrite = false,
  onReserveSuccess,
  onReleaseSuccess,
}: MaterialAvailabilityPanelProps) {
  const qc = useQueryClient();

  // ── Fetch availability (read-only, never consumes stock) ──────────────────
  const { data: rows = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["material_availability", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await (db as any).rpc("check_material_availability", {
        _order_id: orderId,
      });
      if (error) throw error;
      return (data ?? []) as AvailabilityRow[];
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const hasShortage = rows.some((r) => Number(r.shortage) > 0);
  const canRelease = !hasShortage || allowShortage;

  // ── Reserve materials mutation ────────────────────────────────────────────
  const reserveMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await (db as any).rpc("create_production_reservations", {
        _order_id: orderId,
      });
      if (error) throw error;
      return (data ?? []) as AvailabilityRow[];
    },
    onSuccess: (updated) => {
      toast.success("Materials reserved. Production order released.");
      qc.invalidateQueries({ queryKey: ["material_availability", orderId] });
      qc.invalidateQueries({ queryKey: ["production_orders"] });
      onReserveSuccess?.(updated);
    },
    onError: (e: any) => toast.error(e.message ?? "Reservation failed"),
  });

  // ── Release reservations mutation ─────────────────────────────────────────
  const releaseMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await (db as any).rpc("release_production_reservations", {
        _order_id: orderId,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      toast.success(`${count} reservation${count !== 1 ? "s" : ""} released.`);
      qc.invalidateQueries({ queryKey: ["material_availability", orderId] });
      qc.invalidateQueries({ queryKey: ["production_orders"] });
      onReleaseSuccess?.();
    },
    onError: (e: any) => toast.error(e.message ?? "Release failed"),
  });

  const pending = reserveMutation.isPending || releaseMutation.isPending;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={`flex flex-col gap-3 ${compact ? "" : ""}`}>
      {/* Status banner */}
      <StatusBanner rows={rows} allowShortage={allowShortage} loading={isLoading} />

      {/* Table header row */}
      {!isLoading && rows.length > 0 && (
        <Card className="overflow-hidden border shadow-sm p-0">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-2 bg-muted/30">
            <div className="flex items-center gap-2">
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-semibold">Material Requirements</span>
              {orderQty != null && productName && (
                <span className="text-xs text-muted-foreground">
                  — {n(orderQty, 2)} × {productName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {rows.length} component{rows.length !== 1 ? "s" : ""}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20">
                  <TableHead className="text-xs">Component</TableHead>
                  <TableHead className="text-xs">Warehouse</TableHead>
                  <TableHead className="text-right text-xs">Required</TableHead>
                  <TableHead className="text-right text-xs">On Hand</TableHead>
                  <TableHead className="text-right text-xs">Reserved</TableHead>
                  <TableHead className="text-right text-xs">Available</TableHead>
                  <TableHead className="text-xs min-w-[120px]">Coverage</TableHead>
                  <TableHead className="text-right text-xs">Shortage</TableHead>
                  <TableHead className="text-xs w-14">UoM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const short = Number(row.shortage) > 0;
                  return (
                    <TableRow
                      key={row.item_id}
                      className={short ? "bg-destructive/3" : ""}
                    >
                      {/* Component */}
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {short && (
                            <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                          )}
                          <div>
                            <div className="text-sm font-medium">{row.item_name}</div>
                            {row.sku && (
                              <div className="text-xs text-muted-foreground font-mono">
                                {row.sku}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Warehouse */}
                      <TableCell className="text-xs text-muted-foreground">
                        {row.warehouse_name ?? "—"}
                      </TableCell>

                      {/* Required */}
                      <TableCell className="text-right font-mono tabular-nums text-sm font-semibold">
                        {n(row.required_qty)}
                      </TableCell>

                      {/* On hand */}
                      <TableCell className="text-right font-mono tabular-nums text-sm">
                        <span className={Number(row.on_hand) <= 0 ? "text-destructive" : ""}>
                          {n(row.on_hand)}
                        </span>
                      </TableCell>

                      {/* Reserved */}
                      <TableCell className="text-right font-mono tabular-nums text-sm text-muted-foreground">
                        {n(row.reserved)}
                      </TableCell>

                      {/* Available */}
                      <TableCell className="text-right font-mono tabular-nums text-sm">
                        <span
                          className={
                            Number(row.available) < Number(row.required_qty)
                              ? "text-destructive font-semibold"
                              : "text-success font-semibold"
                          }
                        >
                          {n(row.available)}
                        </span>
                      </TableCell>

                      {/* Coverage bar */}
                      <TableCell>
                        <AvailabilityBar
                          available={Number(row.available)}
                          required={Number(row.required_qty)}
                        />
                      </TableCell>

                      {/* Shortage */}
                      <TableCell className="text-right font-mono tabular-nums text-sm">
                        {short ? (
                          <span className="font-bold text-destructive">
                            {n(row.shortage)}
                          </span>
                        ) : (
                          <span className="text-success">0</span>
                        )}
                      </TableCell>

                      {/* UoM */}
                      <TableCell className="text-xs text-muted-foreground">
                        {row.uom ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Shortage summary footer */}
          {hasShortage && (
            <div className="border-t px-4 py-2 bg-destructive/5 flex items-center gap-2 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>
                {rows.filter((r) => Number(r.shortage) > 0).length} component
                {rows.filter((r) => Number(r.shortage) > 0).length !== 1 ? "s" : ""} short.
                {!allowShortage
                  ? " Production cannot be released until materials are available or the Allow Production Shortage setting is enabled."
                  : " Production can be released because Allow Production Shortage is enabled."}
              </span>
            </div>
          )}
        </Card>
      )}

      {/* Action buttons */}
      {canWrite && !isLoading && rows.length > 0 && (
        <div className="flex items-center gap-2">
          {!reservedAlready && (
            <Button
              onClick={() => reserveMutation.mutate()}
              disabled={pending || (!canRelease)}
              className="gap-1.5"
              variant={canRelease ? "default" : "outline"}
            >
              {reserveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              {canRelease
                ? "Reserve Materials & Release"
                : "Cannot Release — Shortage"}
            </Button>
          )}
          {reservedAlready && (
            <Button
              variant="outline"
              onClick={() => releaseMutation.mutate()}
              disabled={pending}
              className="gap-1.5"
            >
              {releaseMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Unlock className="h-4 w-4" />
              )}
              Release Reservations
            </Button>
          )}
          {!canRelease && (
            <Badge
              variant="outline"
              className="text-xs border-destructive/40 text-destructive bg-destructive/5"
            >
              <AlertTriangle className="h-3 w-3 mr-1" />
              Blocked by shortage
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
