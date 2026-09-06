/**
 * Production Order Detail Page
 *
 * Shows header information for the production order, the full
 * material availability panel, and the status workflow actions:
 *
 *   Planned ──► Released (In Progress)  via "Reserve & Release"
 *   In Progress ──► Completed            via "Complete & Post"
 *   Any open ──► Cancelled               via "Cancel Order"
 *
 * The availability panel calls check_material_availability() (read-only)
 * on every render and after each action.  Inventory is NEVER consumed
 * until the order is posted (Completed).
 */

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Factory,
  Loader2,
  XCircle,
} from "lucide-react";
import { MaterialAvailabilityPanel } from "@/components/material-availability-panel";

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_authenticated/manufacturing/orders/$id")({
  component: ProductionOrderDetailPage,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (v: string | null) =>
  !v
    ? "—"
    : new Date(v).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

const STATUS_COLORS: Record<string, string> = {
  Planned:     "bg-muted text-muted-foreground",
  "In Progress": "bg-info/15 text-info",
  Completed:   "bg-success/15 text-success",
  Cancelled:   "bg-destructive/15 text-destructive",
};

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value ?? <span className="text-muted-foreground">—</span>}</span>
    </div>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

function ProductionOrderDetailPage() {
  const { id } = Route.useParams();
  const { tenant, can } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const canWrite = can(["manufacturing.create", "manufacturing.update"]);

  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [completeConfirm, setCompleteConfirm] = useState(false);

  // ── Fetch production order ─────────────────────────────────────────────
  const { data: order, isLoading } = useQuery({
    queryKey: ["production_orders", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db
        .from("production_orders")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  // ── BOM + product ─────────────────────────────────────────────────────
  const { data: bom } = useQuery({
    queryKey: ["bom_headers", order?.bom_id],
    enabled: !!order?.bom_id,
    queryFn: async () => {
      const { data, error } = await db
        .from("bom_headers")
        .select("id, code, product_id, version, yield_qty, approval_status")
        .eq("id", order!.bom_id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: product } = useQuery({
    queryKey: ["items", bom?.product_id],
    enabled: !!bom?.product_id,
    queryFn: async () => {
      const { data, error } = await db
        .from("items")
        .select("id, name, sku, uom")
        .eq("id", bom!.product_id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  // ── allow_production_shortage config ──────────────────────────────────
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
  const allowShortage =
    configRows.find((r) => r.key === "allow_production_shortage")?.value === "true";

  // ── Check if reservations already exist ───────────────────────────────
  const { data: existingReservations = [] } = useQuery({
    queryKey: ["stock_reservations", "production_order", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db
        .from("stock_reservations")
        .select("id, status")
        .eq("ref_id", id)
        .eq("ref_type", "production_order")
        .is("deleted_at", null)
        .eq("status", "Active");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const hasReservations = existingReservations.length > 0;

  // ── Complete & Post mutation ───────────────────────────────────────────
  const completeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("post_production_order", { _order_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Production order completed and inventory updated.");
      qc.invalidateQueries({ queryKey: ["production_orders"] });
      qc.invalidateQueries({ queryKey: ["stock_reservations", "production_order", id] });
      qc.invalidateQueries({ queryKey: ["material_availability", id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Completion failed"),
  });

  // ── Cancel mutation ───────────────────────────────────────────────────
  const cancelMutation = useMutation({
    mutationFn: async () => {
      // Release any open reservations first
      await (db as any).rpc("release_production_reservations", { _order_id: id });
      // Mark as Cancelled
      const { error } = await db
        .from("production_orders")
        .update({ status: "Cancelled", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Production order cancelled and reservations released.");
      qc.invalidateQueries({ queryKey: ["production_orders"] });
      qc.invalidateQueries({ queryKey: ["stock_reservations", "production_order", id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Cancellation failed"),
  });

  // ─── Loading ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <p className="text-sm text-muted-foreground">Production order not found.</p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/manufacturing/orders">Back to Orders</Link>
        </Button>
      </div>
    );
  }

  const isOpen = !["Completed", "Cancelled"].includes(order.status ?? "");
  const isInProgress = order.status === "In Progress";
  const isCompleted = order.status === "Completed";
  const isCancelled = order.status === "Cancelled";

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 p-4 md:p-6 max-w-5xl mx-auto">

      {/* ── Breadcrumb + header ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="sm" className="gap-1 -ml-2" asChild>
          <Link to="/manufacturing/orders">
            <ArrowLeft className="h-4 w-4" /> Orders
          </Link>
        </Button>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
        <Factory className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold font-mono">{order.number}</span>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status ?? "Planned"] ?? STATUS_COLORS.Planned}`}
        >
          {order.status ?? "Planned"}
        </span>

        {/* Action buttons — right side */}
        <div className="ml-auto flex items-center gap-2">
          {canWrite && isInProgress && (
            <Button
              size="sm"
              onClick={() => setCompleteConfirm(true)}
              disabled={completeMutation.isPending}
              className="gap-1.5"
            >
              {completeMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Complete &amp; Post
            </Button>
          )}
          {canWrite && isOpen && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
              onClick={() => setCancelConfirm(true)}
              disabled={cancelMutation.isPending}
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancel Order
            </Button>
          )}
        </div>
      </div>

      {/* ── Order header card ───────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Factory className="h-4 w-4 text-muted-foreground" />
            Production Order Details
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <FieldRow label="MO Number" value={<span className="font-mono">{order.number}</span>} />
            <FieldRow label="Date" value={fmtDate(order.date)} />
            <FieldRow
              label="Product"
              value={
                product ? (
                  <span>
                    {product.name}
                    {product.sku && (
                      <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                        {product.sku}
                      </span>
                    )}
                  </span>
                ) : "—"
              }
            />
            <FieldRow
              label="Quantity"
              value={
                <span className="font-mono">
                  {Number(order.quantity).toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 4,
                  })}{" "}
                  {product?.uom ?? order.quantity_uom ?? ""}
                </span>
              }
            />
            <FieldRow
              label="BOM"
              value={
                bom ? (
                  <Link
                    to="/manufacturing/bom/$id"
                    params={{ id: bom.id }}
                    className="hover:underline text-primary"
                  >
                    {bom.code}
                    {bom.version && (
                      <span className="ml-1 font-mono text-xs text-muted-foreground">
                        {bom.version}
                      </span>
                    )}
                  </Link>
                ) : "—"
              }
            />
          </div>

          {order.notes && (
            <>
              <Separator className="my-3" />
              <p className="text-sm text-muted-foreground">{order.notes}</p>
            </>
          )}

          {/* Posted / completed info */}
          {isCompleted && order.posted_at && (
            <div className="mt-3 flex items-center gap-1.5 text-xs text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Completed &amp; posted on {fmtDate(order.posted_at)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Completed banner ────────────────────────────────────────────── */}
      {isCompleted && (
        <div className="flex items-center gap-3 rounded-lg border border-success/40 bg-success/5 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
          <div>
            <p className="text-sm font-semibold text-success">Production Complete</p>
            <p className="text-xs text-muted-foreground">
              Inventory has been consumed and finished goods received into stock.
              All material reservations have been automatically released.
            </p>
          </div>
        </div>
      )}

      {/* ── Cancelled banner ────────────────────────────────────────────── */}
      {isCancelled && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
          <XCircle className="h-5 w-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-semibold text-destructive">Order Cancelled</p>
            <p className="text-xs text-muted-foreground">
              All material reservations have been released. No inventory was consumed.
            </p>
          </div>
        </div>
      )}

      {/* ── Reservation status for in-progress orders ───────────────────── */}
      {isInProgress && hasReservations && (
        <div className="flex items-center gap-2 rounded-md border border-info/30 bg-info/5 px-3 py-2 text-xs text-info">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>
            Materials reserved ({existingReservations.length} reservation
            {existingReservations.length !== 1 ? "s" : ""} active). Inventory
            will be consumed when the order is completed.
          </span>
        </div>
      )}

      {/* ── Material Availability Panel ─────────────────────────────────── */}
      {!isCompleted && !isCancelled && order.bom_id && (
        <div>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            Material Availability
          </h2>
          <MaterialAvailabilityPanel
            orderId={id}
            orderQty={order.quantity}
            productName={product?.name}
            allowShortage={allowShortage}
            canWrite={canWrite}
            reservedAlready={hasReservations}
            onReserveSuccess={() => {
              qc.invalidateQueries({ queryKey: ["production_orders", id] });
              qc.invalidateQueries({
                queryKey: ["stock_reservations", "production_order", id],
              });
            }}
            onReleaseSuccess={() => {
              qc.invalidateQueries({
                queryKey: ["stock_reservations", "production_order", id],
              });
            }}
          />
        </div>
      )}

      {!order.bom_id && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          No BOM assigned to this production order. Assign a BOM to check material availability.
        </div>
      )}

      {/* ── Confirm complete dialog ──────────────────────────────────────── */}
      <AlertDialog open={completeConfirm} onOpenChange={setCompleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete &amp; Post Production Order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will consume all component materials from inventory and receive{" "}
              <strong>
                {Number(order.quantity).toLocaleString()} {product?.uom ?? "units"}
              </strong>{" "}
              of <strong>{product?.name ?? "finished goods"}</strong> into stock.
              Journal entries will be created. This action cannot be undone.
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

      {/* ── Confirm cancel dialog ────────────────────────────────────────── */}
      <AlertDialog open={cancelConfirm} onOpenChange={setCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Production Order?</AlertDialogTitle>
            <AlertDialogDescription>
              All active material reservations for this order will be released.
              No inventory will be consumed. This action cannot be undone.
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
    </div>
  );
}
