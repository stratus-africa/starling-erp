/**
 * Production Order Detail Page
 *
 * Full 9-stage lifecycle:
 *   Draft → Planned → Confirmed → Material Reserved → Released
 *   → In Progress → Quality Check → Completed → Closed
 *
 * Status transitions (all server-side RPCs — tenant-safe, transactional):
 *   Planned       → Confirmed         via confirm_production_order
 *   Confirmed     → Material Reserved via create_production_reservations
 *   Material Res. → Released          via release_production_order
 *   Released      → In Progress       via start_production_order
 *   In Progress   → Quality Check     via complete_production_quality_check
 *   Quality Check → Completed         via post_production_order (consumes stock,
 *                                        releases reservations, posts journals)
 *   Completed     → Closed            via close_production_order
 *   Any open      → Cancelled         via cancel_production_order
 *                                        (atomically releases reservations)
 *
 * Inventory is NEVER consumed until the order is posted (Quality Check → Completed).
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  ClipboardCheck,
  Factory,
  FlaskConical,
  Loader2,
  Lock,
  Package,
  Play,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { MaterialAvailabilityPanel } from "@/components/material-availability-panel";

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_authenticated/manufacturing/orders/$id")({
  component: ProductionOrderDetailPage,
});

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground",
  Planned: "bg-muted text-muted-foreground",
  Confirmed: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  "Material Reserved": "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  Released: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  "In Progress": "bg-info/15 text-info",
  "Quality Check": "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  Completed: "bg-success/15 text-success",
  Closed: "bg-muted text-muted-foreground font-semibold",
  Cancelled: "bg-destructive/15 text-destructive",
};

// Ordered list for the progress stepper (terminal states excluded)
const WORKFLOW_STEPS = [
  "Draft",
  "Planned",
  "Confirmed",
  "Material Reserved",
  "Released",
  "In Progress",
  "Quality Check",
  "Completed",
  "Closed",
] as const;

type WorkflowStep = (typeof WORKFLOW_STEPS)[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (v: string | null | undefined) =>
  !v
    ? "—"
    : new Date(v).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

const fmtDateTime = (v: string | null | undefined) =>
  !v
    ? "—"
    : new Date(v).toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value ?? <span className="text-muted-foreground">—</span>}</span>
    </div>
  );
}

// ─── Workflow stepper ─────────────────────────────────────────────────────────

function WorkflowStepper({ status }: { status: string }) {
  const isCancelled = status === "Cancelled";
  const currentIdx = WORKFLOW_STEPS.indexOf(status as WorkflowStep);

  return (
    <div className="flex items-center gap-0 overflow-x-auto py-2 px-1">
      {WORKFLOW_STEPS.map((step, idx) => {
        const done = !isCancelled && currentIdx > idx;
        const current = !isCancelled && currentIdx === idx;
        const future = isCancelled || currentIdx < idx;

        return (
          <div key={step} className="flex items-center shrink-0">
            {/* Node */}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`
                  w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2
                  transition-colors
                  ${done ? "bg-success border-success text-success-foreground" : ""}
                  ${current ? "bg-primary border-primary text-primary-foreground" : ""}
                  ${future ? "bg-muted border-muted-foreground/30 text-muted-foreground" : ""}
                `}
              >
                {done ? "✓" : idx + 1}
              </div>
              <span
                className={`
                  text-[10px] leading-tight text-center w-16 whitespace-nowrap
                  ${current ? "font-semibold text-primary" : "text-muted-foreground"}
                  ${done ? "text-success" : ""}
                `}
              >
                {step}
              </span>
            </div>

            {/* Connector */}
            {idx < WORKFLOW_STEPS.length - 1 && (
              <div
                className={`
                  h-0.5 w-6 mx-0.5 mb-5 shrink-0 rounded
                  ${done ? "bg-success" : "bg-muted-foreground/20"}
                `}
              />
            )}
          </div>
        );
      })}

      {isCancelled && (
        <div className="ml-4 flex items-center gap-1.5 rounded-full bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive shrink-0">
          <XCircle className="h-3.5 w-3.5" />
          Cancelled
        </div>
      )}
    </div>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

function ProductionOrderDetailPage() {
  const { id } = Route.useParams();
  const { tenant, can } = useAuth();
  const qc = useQueryClient();
  const canWrite = can(["manufacturing.create", "manufacturing.update"]);

  // Dialog state
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [postConfirm, setPostConfirm] = useState(false);
  const [qcConfirm, setQcConfirm] = useState(false);
  const [qcNotes, setQcNotes] = useState("");

  // ── Fetch production order ─────────────────────────────────────────────
  const { data: order, isLoading } = useQuery({
    queryKey: ["production_orders", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db.from("production_orders").select("*").eq("id", id).maybeSingle();
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
  const allowShortage = configRows.find((r) => r.key === "allow_production_shortage")?.value === "true";

  // ── Active reservations ───────────────────────────────────────────────
  const { data: existingReservations = [] } = useQuery({
    queryKey: ["stock_reservations", "production_order", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db
        .from("stock_reservations")
        .select("id, item_id, quantity, status, warehouse_id")
        .eq("ref_id", id)
        .eq("ref_type", "production_order")
        .is("deleted_at", null)
        .eq("status", "Active");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const hasReservations = existingReservations.length > 0;

  // ─── Invalidation helper ──────────────────────────────────────────────
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["production_orders"] });
    qc.invalidateQueries({ queryKey: ["production_orders", id] });
    qc.invalidateQueries({ queryKey: ["stock_reservations", "production_order", id] });
    qc.invalidateQueries({ queryKey: ["material_availability", id] });
  };

  // ─── Mutations ────────────────────────────────────────────────────────

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (db as any).rpc("confirm_production_order", { _order_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order confirmed. Ready to reserve materials.");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message ?? "Confirmation failed"),
  });

  // create_production_reservations is driven from MaterialAvailabilityPanel;
  // we provide the success callback here to refresh order state.
  const afterReserve = () => {
    invalidateAll();
  };
  const afterRelease = () => {
    invalidateAll();
  };

  const releaseToFloorMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (db as any).rpc("release_production_order", { _order_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order released to shop floor.");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message ?? "Release failed"),
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (db as any).rpc("start_production_order", { _order_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Production started.");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message ?? "Start failed"),
  });

  const qcMutation = useMutation({
    mutationFn: async (notes: string) => {
      const { error } = await (db as any).rpc("complete_production_quality_check", {
        _order_id: id,
        _notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Production entered Quality Check. Ready to complete & post.");
      setQcNotes("");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message ?? "Quality check transition failed"),
  });

  const postMutation = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("post_production_order", { _order_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Production order completed. Inventory consumed, finished goods received.");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message ?? "Completion failed"),
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (db as any).rpc("close_production_order", { _order_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Production order closed.");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message ?? "Close failed"),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (db as any).rpc("cancel_production_order", { _order_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Production order cancelled. All reservations released.");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message ?? "Cancellation failed"),
  });

  const anyPending =
    confirmMutation.isPending ||
    releaseToFloorMutation.isPending ||
    startMutation.isPending ||
    qcMutation.isPending ||
    postMutation.isPending ||
    closeMutation.isPending ||
    cancelMutation.isPending;

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

  const status = order.status ?? "Draft";
  const isTerminal = ["Completed", "Closed", "Cancelled"].includes(status);
  const isCancelled = status === "Cancelled";
  const isCompleted = status === "Completed";
  const isClosed = status === "Closed";

  // Which statuses show the material availability panel
  const showAvailPanel = !isTerminal && order.bom_id;
  // Statuses where reservations are active / visible
  const showReservationBanner =
    ["Material Reserved", "Released", "In Progress", "Quality Check"].includes(status) && hasReservations;

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
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? STATUS_COLORS.Draft}`}
        >
          {status}
        </span>

        {/* Primary action button — right side */}
        {canWrite && (
          <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
            {/* Draft / Planned → Confirm */}
            {["Draft", "Planned"].includes(status) && (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => confirmMutation.mutate()}
                disabled={anyPending || !order.bom_id}
                title={!order.bom_id ? "Assign a BOM first" : undefined}
              >
                {confirmMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ClipboardCheck className="h-3.5 w-3.5" />
                )}
                Confirm Order
              </Button>
            )}

            {/* Released → Start Production */}
            {status === "Released" && (
              <Button size="sm" className="gap-1.5" onClick={() => startMutation.mutate()} disabled={anyPending}>
                {startMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Start Production
              </Button>
            )}

            {/* In Progress → Quality Check */}
            {status === "In Progress" && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setQcConfirm(true)}
                disabled={anyPending}
              >
                <FlaskConical className="h-3.5 w-3.5" />
                Submit to QC
              </Button>
            )}

            {/* Quality Check → Complete & Post */}
            {status === "Quality Check" && (
              <Button size="sm" className="gap-1.5" onClick={() => setPostConfirm(true)} disabled={anyPending}>
                {postMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Complete &amp; Post
              </Button>
            )}

            {/* Completed → Close */}
            {isCompleted && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => closeMutation.mutate()}
                disabled={anyPending}
              >
                {closeMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Lock className="h-3.5 w-3.5" />
                )}
                Close Order
              </Button>
            )}

            {/* Cancel — available on all open non-terminal states */}
            {!isTerminal && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={() => setCancelConfirm(true)}
                disabled={anyPending}
              >
                <XCircle className="h-3.5 w-3.5" />
                Cancel
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── Workflow stepper ──────────────────────────────────────────────── */}
      {!isCancelled && (
        <Card className="overflow-hidden">
          <CardContent className="px-4 py-3">
            <WorkflowStepper status={status} />
          </CardContent>
        </Card>
      )}

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
                      <span className="ml-1.5 font-mono text-xs text-muted-foreground">{product.sku}</span>
                    )}
                  </span>
                ) : (
                  "—"
                )
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
                  <Link to="/manufacturing/bom/$id" params={{ id: bom.id }} className="hover:underline text-primary">
                    {bom.code}
                    {bom.version && (
                      <span className="ml-1 font-mono text-xs text-muted-foreground">v{bom.version}</span>
                    )}
                  </Link>
                ) : (
                  <span className="text-destructive text-xs">No BOM assigned</span>
                )
              }
            />
          </div>

          {order.notes && (
            <>
              <Separator className="my-3" />
              <p className="text-sm text-muted-foreground">{order.notes}</p>
            </>
          )}

          {/* Lifecycle timestamps */}
          {(order.confirmed_at ||
            order.reserved_at ||
            order.released_at ||
            order.quality_check_at ||
            order.posted_at ||
            order.closed_at ||
            order.cancelled_at) && (
            <>
              <Separator className="my-3" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {order.confirmed_at && <FieldRow label="Confirmed" value={fmtDateTime(order.confirmed_at)} />}
                {order.reserved_at && <FieldRow label="Materials Reserved" value={fmtDateTime(order.reserved_at)} />}
                {order.released_at && <FieldRow label="Released" value={fmtDateTime(order.released_at)} />}
                {order.quality_check_at && (
                  <FieldRow label="QC Submitted" value={fmtDateTime(order.quality_check_at)} />
                )}
                {order.posted_at && <FieldRow label="Completed" value={fmtDateTime(order.posted_at)} />}
                {order.closed_at && <FieldRow label="Closed" value={fmtDateTime(order.closed_at)} />}
                {order.cancelled_at && <FieldRow label="Cancelled" value={fmtDateTime(order.cancelled_at)} />}
              </div>
            </>
          )}

          {/* QC notes */}
          {order.quality_notes && (
            <>
              <Separator className="my-3" />
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Quality Check Notes</span>
                <p className="text-sm">{order.quality_notes}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Active reservations banner ────────────────────────────────────── */}
      {showReservationBanner && (
        <div className="flex items-center gap-2 rounded-md border border-violet-500/30 bg-violet-500/5 px-3 py-2 text-xs">
          <Package className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
          <span className="text-violet-700 dark:text-violet-300">
            <strong>{existingReservations.length}</strong> component reservation
            {existingReservations.length !== 1 ? "s" : ""} active — inventory is held and will be consumed when the
            order is completed &amp; posted.
          </span>
        </div>
      )}

      {/* ── Terminal state banners ────────────────────────────────────────── */}
      {isCompleted && (
        <div className="flex items-center gap-3 rounded-lg border border-success/40 bg-success/5 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
          <div>
            <p className="text-sm font-semibold text-success">Production Complete</p>
            <p className="text-xs text-muted-foreground">
              All component materials consumed and finished goods received into stock. Material reservations fulfilled
              and released. Close the order when ready.
            </p>
          </div>
        </div>
      )}

      {isClosed && (
        <div className="flex items-center gap-3 rounded-lg border border-muted bg-muted/20 px-4 py-3">
          <Lock className="h-5 w-5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-semibold text-muted-foreground">Order Closed</p>
            <p className="text-xs text-muted-foreground">
              This production order is closed and locked for further changes.
            </p>
          </div>
        </div>
      )}

      {isCancelled && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
          <XCircle className="h-5 w-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-semibold text-destructive">Order Cancelled</p>
            <p className="text-xs text-muted-foreground">
              All material reservations were released. No inventory was consumed.
            </p>
          </div>
        </div>
      )}

      {/* ── Material Availability Panel ─────────────────────────────────── */}
      {showAvailPanel && (
        <div>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            Material Availability
            {["Material Reserved", "Released", "In Progress", "Quality Check"].includes(status) && (
              <span className="text-xs font-normal text-muted-foreground ml-1">— reservations active</span>
            )}
          </h2>
          <MaterialAvailabilityPanel
            orderId={id}
            orderQty={order.quantity}
            productName={product?.name}
            allowShortage={allowShortage}
            canWrite={canWrite}
            orderStatus={status}
            reservedAlready={hasReservations}
            onReserveSuccess={afterReserve}
            onReleaseSuccess={afterRelease}
            onReleaseToFloor={status === "Material Reserved" ? () => releaseToFloorMutation.mutate() : undefined}
            releaseToFloorPending={releaseToFloorMutation.isPending}
          />
        </div>
      )}

      {!order.bom_id && !isTerminal && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          No BOM assigned to this production order. Edit the order to assign a BOM before confirming.
        </div>
      )}

      {/* ── QC dialog ────────────────────────────────────────────────────── */}
      <AlertDialog open={qcConfirm} onOpenChange={setQcConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5" />
              Submit to Quality Check?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Production will move to <strong>Quality Check</strong> status. Add optional inspection notes before
              submitting. Inventory is not consumed yet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 py-2">
            <Label className="text-sm" htmlFor="qc-notes">
              QC Notes (optional)
            </Label>
            <Textarea
              id="qc-notes"
              className="mt-1.5"
              rows={3}
              placeholder="Record inspection observations, measurements, or pass criteria…"
              value={qcNotes}
              onChange={(e) => setQcNotes(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setQcConfirm(false);
                qcMutation.mutate(qcNotes);
              }}
            >
              Submit to QC
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Complete & Post dialog ────────────────────────────────────────── */}
      <AlertDialog open={postConfirm} onOpenChange={setPostConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete &amp; Post Production Order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will consume all component materials from inventory and receive{" "}
              <strong>
                {Number(order.quantity).toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 4,
                })}{" "}
                {product?.uom ?? "units"}
              </strong>{" "}
              of <strong>{product?.name ?? "finished goods"}</strong> into stock. Material reservations will be
              fulfilled and journal entries created. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setPostConfirm(false);
                postMutation.mutate();
              }}
            >
              Complete &amp; Post
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Cancel dialog ─────────────────────────────────────────────────── */}
      <AlertDialog open={cancelConfirm} onOpenChange={setCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Production Order?</AlertDialogTitle>
            <AlertDialogDescription>
              {hasReservations
                ? `All ${existingReservations.length} active material reservation${existingReservations.length !== 1 ? "s" : ""} will be released immediately. `
                : ""}
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
