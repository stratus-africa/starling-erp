/**
 * Production Runs — shop floor view
 *
 * Lists all Planned / In Progress production orders.
 * Each row expands to show the full MaterialAvailabilityPanel.
 *
 * Workflow per row:
 *   Planned    → Reserve & Release  (calls create_production_reservations)
 *   In Progress → Complete & Post   (calls post_production_order)
 *   Either     → Cancel             (calls release_production_reservations + sets Cancelled)
 *
 * The Complete button respects allow_production_shortage:
 *   If a shortage exists and allow_production_shortage = false,
 *   the button is disabled with a tooltip explaining why.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Factory, Loader2, Lock, XCircle } from "lucide-react";
import { MaterialAvailabilityPanel } from "@/components/material-availability-panel";

export const Route = createFileRoute("/_authenticated/manufacturing/runs")({
  component: ProductionRunsPage,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  Planned: "bg-muted text-muted-foreground",
  "In Progress": "bg-info/15 text-info",
  Completed: "bg-success/15 text-success",
  Cancelled: "bg-destructive/15 text-destructive",
};

// ─── Row expansion component ──────────────────────────────────────────────────

function RunRow({ order, allowShortage, canWrite }: { order: any; allowShortage: boolean; canWrite: boolean }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [completeConfirm, setCompleteConfirm] = useState(false);

  // ── Live shortage check ───────────────────────────────────────────────
  const { data: availRows = [] } = useQuery({
    queryKey: ["material_availability", order.id],
    enabled: !!order.id,
    queryFn: async () => {
      const { data, error } = await (db as any).rpc("check_material_availability", {
        _order_id: order.id,
      });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 15_000,
  });

  const hasShortage = availRows.some((r: any) => Number(r.shortage) > 0);
  const canComplete = !hasShortage || allowShortage;

  // ── Active reservations ───────────────────────────────────────────────
  const { data: reservations = [] } = useQuery({
    queryKey: ["stock_reservations", "production_order", order.id],
    queryFn: async () => {
      const { data, error } = await db
        .from("stock_reservations")
        .select("id")
        .eq("ref_id", order.id)
        .eq("ref_type", "production_order")
        .is("deleted_at", null)
        .eq("status", "Active");
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 15_000,
  });
  const hasReservations = reservations.length > 0;

  // ── Complete mutation ─────────────────────────────────────────────────
  const completeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("post_production_order", { _order_id: order.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`MO ${order.number} completed.`);
      qc.invalidateQueries({ queryKey: ["production_orders"] });
      qc.invalidateQueries({ queryKey: ["material_availability", order.id] });
      qc.invalidateQueries({ queryKey: ["stock_reservations", "production_order", order.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Completion failed"),
  });

  // ── Cancel mutation ───────────────────────────────────────────────────
  const cancelMutation = useMutation({
    mutationFn: async () => {
      await (db as any).rpc("release_production_reservations", { _order_id: order.id });
      const { error } = await db
        .from("production_orders")
        .update({ status: "Cancelled", updated_at: new Date().toISOString() })
        .eq("id", order.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`MO ${order.number} cancelled.`);
      qc.invalidateQueries({ queryKey: ["production_orders"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Cancellation failed"),
  });

  const anyPending = completeMutation.isPending || cancelMutation.isPending;
  const isInProgress = order.status === "In Progress";

  return (
    <>
      {/* Main row */}
      <TableRow className="hover:bg-muted/30">
        {/* Expand toggle */}
        <TableCell className="w-8 pr-0">
          <button
            type="button"
            className="flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </TableCell>

        <TableCell className="font-mono text-xs">
          <Link to="/manufacturing/orders/$id" params={{ id: order.id }} className="hover:underline text-primary">
            {order.number}
          </Link>
        </TableCell>

        <TableCell className="text-sm">
          {order.date
            ? new Date(order.date).toLocaleDateString(undefined, {
                day: "2-digit",
                month: "short",
              })
            : "—"}
        </TableCell>

        <TableCell className="font-medium text-sm">{order.product?.name ?? "—"}</TableCell>

        <TableCell className="text-right font-mono tabular-nums">
          {Number(order.quantity).toLocaleString(undefined, { maximumFractionDigits: 4 })}
        </TableCell>

        <TableCell className="font-mono text-xs text-muted-foreground">{order.bom?.code ?? "—"}</TableCell>

        {/* Availability badge */}
        <TableCell>
          {order.bom_id ? (
            hasShortage ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 text-destructive px-2 py-0.5 text-xs font-medium">
                <AlertTriangle className="h-3 w-3" /> Shortage
              </span>
            ) : availRows.length > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 text-success px-2 py-0.5 text-xs font-medium">
                <CheckCircle2 className="h-3 w-3" /> Ready
              </span>
            ) : null
          ) : null}
        </TableCell>

        {/* Status */}
        <TableCell>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status ?? "Planned"]}`}
          >
            {order.status}
          </span>
          {hasReservations && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-info/10 text-info px-1.5 py-0.5 text-[10px] font-medium">
              <Lock className="h-2.5 w-2.5 mr-0.5" />
              Reserved
            </span>
          )}
        </TableCell>

        {/* Actions */}
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1.5">
            {canWrite && isInProgress && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setCompleteConfirm(true)}
                        disabled={anyPending || !canComplete}
                        className="gap-1"
                      >
                        {completeMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        Complete
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!canComplete && (
                    <TooltipContent side="top" className="text-xs max-w-52">
                      Material shortage detected. Enable "Allow Production Shortage" in Inventory Settings, or replenish
                      stock first.
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            )}

            {canWrite && order.status !== "Completed" && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => setCancelConfirm(true)}
                disabled={anyPending}
                title="Cancel order"
              >
                <XCircle className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>

      {/* Expanded availability panel */}
      {expanded && (
        <TableRow>
          <TableCell colSpan={9} className="bg-muted/20 px-6 py-4 border-t">
            <MaterialAvailabilityPanel
              orderId={order.id}
              orderQty={order.quantity}
              productName={order.product?.name}
              allowShortage={allowShortage}
              canWrite={canWrite}
              reservedAlready={hasReservations}
              onReserveSuccess={() => {
                qc.invalidateQueries({ queryKey: ["production_orders"] });
                qc.invalidateQueries({
                  queryKey: ["stock_reservations", "production_order", order.id],
                });
              }}
              onReleaseSuccess={() => {
                qc.invalidateQueries({
                  queryKey: ["stock_reservations", "production_order", order.id],
                });
              }}
            />
          </TableCell>
        </TableRow>
      )}

      {/* Complete confirm dialog */}
      <AlertDialog open={completeConfirm} onOpenChange={setCompleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete &amp; Post Production Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Components will be consumed from inventory and{" "}
              <strong>
                {Number(order.quantity).toLocaleString()} {order.product?.uom ?? "units"}
              </strong>{" "}
              of <strong>{order.product?.name ?? "finished goods"}</strong> will be received into stock. Journal entries
              will be created automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setCompleteConfirm(false);
                completeMutation.mutate();
              }}
            >
              Complete &amp; Post
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel confirm dialog */}
      <AlertDialog open={cancelConfirm} onOpenChange={setCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Production Order?</AlertDialogTitle>
            <AlertDialogDescription>
              All material reservations for <strong>{order.number}</strong> will be released. No inventory will be
              consumed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Order</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setCancelConfirm(false);
                cancelMutation.mutate();
              }}
            >
              Cancel Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ProductionRunsPage() {
  const { tenant, can } = useAuth();
  const canWrite = can(["manufacturing.create", "manufacturing.update"]);

  // ── allow_production_shortage config ────────────────────────────────
  const { data: configRows = [] } = useQuery({
    queryKey: ["inventory_config", "allow_production_shortage"],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("inventory_config")
        .select("key, value")
        .eq("key", "allow_production_shortage");
      if (error) throw error;
      return (data ?? []) as { key: string; value: string }[];
    },
  });
  const allowShortage = configRows.find((r) => r.key === "allow_production_shortage")?.value === "true";

  // ── Active production orders ─────────────────────────────────────────
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["production_orders", "active"],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data: rawOrders, error } = await db
        .from("production_orders")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .in("status", ["Planned", "In Progress"])
        .order("created_at", { ascending: false });
      if (error) throw error;

      const bomIds = [...new Set((rawOrders ?? []).map((o: any) => o.bom_id).filter(Boolean))];
      const { data: boms } = bomIds.length
        ? await db.from("bom_headers").select("id,code,product_id").in("id", bomIds)
        : { data: [] as any[] };

      const productIds = [...new Set((boms ?? []).map((b: any) => b.product_id).filter(Boolean))];
      const { data: items } = productIds.length
        ? await db.from("items").select("id,name,sku,uom").in("id", productIds)
        : { data: [] as any[] };

      const bomMap = new Map((boms ?? []).map((b: any) => [b.id, b]));
      const productMap = new Map((items ?? []).map((i: any) => [i.id, i]));

      return (rawOrders ?? []).map((o: any) => ({
        ...o,
        bom: bomMap.get(o.bom_id),
        product: productMap.get((bomMap.get(o.bom_id) as any)?.product_id),
      }));
    },
  });

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Factory className="h-5 w-5" /> Production Runs
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Active manufacturing orders. Expand a row to check material availability.
          </p>
        </div>
        {allowShortage && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/5 px-2.5 py-1 text-xs text-warning font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            Allow Production Shortage is ON
          </span>
        )}
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20">
              <TableHead className="w-8" />
              <TableHead className="text-xs">MO #</TableHead>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Product</TableHead>
              <TableHead className="text-right text-xs">Qty</TableHead>
              <TableHead className="text-xs">BOM</TableHead>
              <TableHead className="text-xs">Availability</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-right text-xs">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-12">
                  No active production orders. Create one from the{" "}
                  <Link to="/manufacturing/orders" className="text-primary hover:underline">
                    Production Orders
                  </Link>{" "}
                  page.
                </TableCell>
              </TableRow>
            )}
            {orders.map((order: any) => (
              <RunRow key={order.id} order={order} allowShortage={allowShortage} canWrite={canWrite} />
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
