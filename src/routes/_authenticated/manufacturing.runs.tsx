/**
 * Production Runs — shop floor view
 *
 * Lists all open production orders (all non-terminal statuses).
 * Each row expands to show the MaterialAvailabilityPanel.
 *
 * Per-row inline actions mirror the full 11-stage workflow:
 *   Draft / Planned         → Confirm
 *   Confirmed               → Reserve Materials (via panel)
 *   Material Reserved       → Release to Floor
 *   Released                → Start Production
 *   In Progress             → Record Run | Pause | Submit QC
 *   Paused                  → Record Run | Resume | Submit QC
 *   Quality Check           → Complete & Post
 *   Completed               → (link to detail for Close)
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Factory,
  FlaskConical,
  Loader2,
  Package,
  Pause,
  Play,
  Plus,
  Send,
  XCircle,
} from "lucide-react";
import { MaterialAvailabilityPanel } from "@/components/material-availability-panel";

export const Route = createFileRoute("/_authenticated/manufacturing/runs")({
  component: ProductionRunsPage,
});

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground",
  Planned: "bg-muted text-muted-foreground",
  Confirmed: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  "Material Reserved": "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  Released: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  "In Progress": "bg-info/15 text-info",
  "Partially Completed": "bg-warning/15 text-warning",
  Paused: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  "Quality Check": "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  Completed: "bg-success/15 text-success",
  Closed: "bg-muted text-muted-foreground",
  Cancelled: "bg-destructive/15 text-destructive",
};

const ACTIVE_STATUSES = [
  "Draft",
  "Planned",
  "Confirmed",
  "Material Reserved",
  "Released",
  "In Progress",
  "Partially Completed",
  "Paused",
  "Quality Check",
];

const PRIORITY_COLOR: Record<number, string> = {
  1: "text-destructive font-bold",
  2: "text-orange-600 dark:text-orange-400 font-medium",
  3: "text-muted-foreground",
  4: "text-muted-foreground/60",
};
const PRIORITY_LABEL: Record<number, string> = {
  1: "●",
  2: "●",
  3: "●",
  4: "●",
};

// ─── Inline Record Run dialog ─────────────────────────────────────────────────

function InlineRunDialog({
  open,
  onOpenChange,
  order,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: any;
  onSuccess: () => void;
}) {
  const [qty, setQty] = useState("");
  const [scrap, setScrap] = useState("0");
  const [waste, setWaste] = useState("0");
  const [rework, setRework] = useState("0");
  const [lot, setLot] = useState("");
  const [notes, setNotes] = useState("");
  const remaining = Number(order?.qty_remaining ?? order?.quantity ?? 0);

  const mutation = useMutation({
    mutationFn: async () => {
      const qtyNum = parseFloat(qty);
      if (isNaN(qtyNum) || qtyNum <= 0) throw new Error("Quantity must be greater than zero");
      const { data, error } = await (db as any).rpc("record_production_run", {
        _order_id: order.id,
        _qty_produced: qtyNum,
        _qty_scrap: parseFloat(scrap) || 0,
        _qty_waste: parseFloat(waste) || 0,
        _qty_rework: parseFloat(rework) || 0,
        _lot_number: lot.trim() || null,
        _notes: notes.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(`Run recorded for ${order.number}.`);
      setQty("");
      setScrap("0");
      setWaste("0");
      setRework("0");
      setLot("");
      setNotes("");
      onOpenChange(false);
      onSuccess();
    },
    onError: (e: any) => toast.error(e.message ?? "Run failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" /> Record Run — {order.number}
          </DialogTitle>
          <DialogDescription>
            Remaining: <strong>{Number(remaining).toLocaleString(undefined, { maximumFractionDigits: 4 })}</strong>
            {order.product?.uom ? ` ${order.product.uom}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor={`rq-${order.id}`}>
                Qty Produced <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`rq-${order.id}`}
                type="number"
                step="any"
                min="0.0001"
                className="mt-1 font-mono"
                placeholder="0"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor={`rs-${order.id}`}>Scrap</Label>
              <Input
                id={`rs-${order.id}`}
                type="number"
                step="any"
                min="0"
                className="mt-1 font-mono"
                placeholder="0"
                value={scrap}
                onChange={(e) => setScrap(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor={`rw-${order.id}`}>Waste</Label><Input id={`rw-${order.id}`} type="number" step="any" min="0" className="mt-1 font-mono" value={waste} onChange={(e) => setWaste(e.target.value)} /></div>
            <div><Label htmlFor={`rr-${order.id}`}>Rework</Label><Input id={`rr-${order.id}`} type="number" step="any" min="0" className="mt-1 font-mono" value={rework} onChange={(e) => setRework(e.target.value)} /></div>
          </div>
          <div>
            <Label htmlFor={`rl-${order.id}`}>Lot Number</Label>
            <Input
              id={`rl-${order.id}`}
              className="mt-1 font-mono"
              placeholder="optional"
              value={lot}
              onChange={(e) => setLot(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={`rn-${order.id}`}>Notes</Label>
            <Textarea
              id={`rn-${order.id}`}
              className="mt-1"
              rows={2}
              placeholder="Shift notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !qty || parseFloat(qty) <= 0}
            className="gap-1.5"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Row component ─────────────────────────────────────────────────────────────

function RunRow({ order, allowShortage, canWrite }: { order: any; allowShortage: boolean; canWrite: boolean }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [postConfirm, setPostConfirm] = useState(false);
  const [showRunDialog, setShowRunDialog] = useState(false);

  const status = order.status ?? "Draft";
  const planned = Number(order.quantity ?? 0);
  const produced = Number(order.qty_produced ?? 0);
  const remaining = Number(order.qty_remaining ?? Math.max(0, planned - produced));
  const pct = planned > 0 ? Math.min(100, (produced / planned) * 100) : 0;
  const priority = Number(order.priority ?? 3);

  // Availability check
  const { data: availRows = [] } = useQuery({
    queryKey: ["material_availability", order.id],
    enabled: !!order.id,
    queryFn: async () => {
      const { data, error } = await (db as any).rpc("check_material_availability", { _order_id: order.id });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 15_000,
  });

  const hasShortage = availRows.some((r: any) => Number(r.shortage) > 0);
  const canComplete = !hasShortage || allowShortage;

  // Active reservations
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

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["production_orders"] });
    qc.invalidateQueries({ queryKey: ["production_orders", "active"] });
    qc.invalidateQueries({ queryKey: ["material_availability", order.id] });
    qc.invalidateQueries({ queryKey: ["stock_reservations", "production_order", order.id] });
    qc.invalidateQueries({ queryKey: ["production_entries", order.id] });
  };

  // Mutations
  const confirmMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (db as any).rpc("confirm_production_order", { _order_id: order.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`MO ${order.number} confirmed.`);
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  const releaseFloorMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (db as any).rpc("release_production_order", { _order_id: order.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`MO ${order.number} released.`);
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  const startMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (db as any).rpc("start_production_order", { _order_id: order.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`MO ${order.number} started.`);
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  const resumeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (db as any).rpc("resume_production_order", { _order_id: order.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`MO ${order.number} resumed.`);
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  const pauseMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (db as any).rpc("pause_production_order", { _order_id: order.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`MO ${order.number} paused.`);
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  const qcMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (db as any).rpc("complete_production_quality_check", {
        _order_id: order.id,
        _notes: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`MO ${order.number} → QC.`);
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  const postMutation = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("post_production_order", { _order_id: order.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`MO ${order.number} completed.`);
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (db as any).rpc("cancel_production_order", { _order_id: order.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`MO ${order.number} cancelled.`);
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const anyPending =
    confirmMutation.isPending ||
    releaseFloorMutation.isPending ||
    startMutation.isPending ||
    resumeMutation.isPending ||
    pauseMutation.isPending ||
    qcMutation.isPending ||
    postMutation.isPending ||
    cancelMutation.isPending;

  const isActive = ["In Progress", "Partially Completed", "Paused"].includes(status);

  return (
    <>
      <TableRow className="hover:bg-muted/30">
        {/* Expand */}
        <TableCell className="w-8 pr-0">
          <button
            type="button"
            className="flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </TableCell>

        {/* MO # */}
        <TableCell className="font-mono text-xs">
          <Link to="/manufacturing/orders/$id" params={{ id: order.id }} className="hover:underline text-primary">
            {order.number}
          </Link>
        </TableCell>

        {/* Date */}
        <TableCell className="text-xs text-muted-foreground">
          {order.date ? new Date(order.date).toLocaleDateString(undefined, { day: "2-digit", month: "short" }) : "—"}
        </TableCell>

        {/* Product */}
        <TableCell className="font-medium text-sm">
          <div className="flex items-center gap-1.5">
            {priority <= 2 && (
              <span className={`text-[10px] ${PRIORITY_COLOR[priority]}`} title={priority === 1 ? "Critical" : "High"}>
                {PRIORITY_LABEL[priority]}
              </span>
            )}
            {order.product?.name ?? "—"}
          </div>
        </TableCell>

        {/* Progress */}
        <TableCell className="min-w-[140px]">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="tabular-nums font-mono font-semibold">
                {Number(produced).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                <span className="text-muted-foreground">
                  {" "}
                  / {Number(planned).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </span>
              </span>
              <span className="text-muted-foreground">{Math.round(pct)}%</span>
            </div>
            <Progress
              value={pct}
              className={`h-1.5 ${pct >= 100 ? "[&>div]:bg-success" : pct > 0 ? "[&>div]:bg-info" : "[&>div]:bg-muted-foreground/20"}`}
            />
          </div>
        </TableCell>

        {/* BOM */}
        <TableCell className="font-mono text-xs text-muted-foreground">{order.bom?.code ?? "—"}</TableCell>

        {/* Availability badge */}
        <TableCell>
          {order.bom_id && availRows.length > 0 ? (
            hasShortage ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 text-destructive px-2 py-0.5 text-xs font-medium">
                <AlertTriangle className="h-3 w-3" />
                Shortage
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 text-success px-2 py-0.5 text-xs font-medium">
                <CheckCircle2 className="h-3 w-3" />
                Ready
              </span>
            )
          ) : null}
        </TableCell>

        {/* Status */}
        <TableCell>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? STATUS_COLORS.Planned}`}
            >
              {status}
            </span>
            {hasReservations && (
              <span className="inline-flex items-center rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 text-[10px] font-medium">
                <Package className="h-2.5 w-2.5 mr-0.5" />
                {reservations.length}
              </span>
            )}
          </div>
        </TableCell>

        {/* Actions */}
        <TableCell className="text-right">
          {canWrite && (
            <div className="flex items-center justify-end gap-1">
              {/* Record Run */}
              {isActive && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 h-7 text-xs"
                  onClick={() => setShowRunDialog(true)}
                  disabled={anyPending}
                >
                  <Plus className="h-3 w-3" /> Run
                </Button>
              )}

              {/* Confirm */}
              {["Draft", "Planned"].includes(status) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 h-7 text-xs"
                  onClick={() => confirmMutation.mutate()}
                  disabled={anyPending || !order.bom_id}
                  title={!order.bom_id ? "No BOM" : "Confirm"}
                >
                  {confirmMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ClipboardCheck className="h-3 w-3" />
                  )}
                  Confirm
                </Button>
              )}

              {/* Release to floor */}
              {status === "Material Reserved" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 h-7 text-xs"
                  onClick={() => releaseFloorMutation.mutate()}
                  disabled={anyPending}
                >
                  {releaseFloorMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Send className="h-3 w-3" />
                  )}
                  Release
                </Button>
              )}

              {/* Start */}
              {status === "Released" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 h-7 text-xs"
                  onClick={() => startMutation.mutate()}
                  disabled={anyPending}
                >
                  {startMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                  Start
                </Button>
              )}

              {/* Resume */}
              {status === "Paused" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 h-7 text-xs"
                  onClick={() => resumeMutation.mutate()}
                  disabled={anyPending}
                >
                  {resumeMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                  Resume
                </Button>
              )}

              {/* Pause */}
              {["In Progress", "Partially Completed"].includes(status) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-yellow-600"
                  onClick={() => pauseMutation.mutate()}
                  disabled={anyPending}
                  title="Pause"
                >
                  {pauseMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Pause className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}

              {/* Submit QC */}
              {isActive && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-orange-600"
                  onClick={() => qcMutation.mutate()}
                  disabled={anyPending}
                  title="Submit to QC"
                >
                  {qcMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FlaskConical className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}

              {/* Complete & Post */}
              {status === "Quality Check" && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 h-7 text-xs"
                          onClick={() => setPostConfirm(true)}
                          disabled={anyPending || !canComplete}
                        >
                          {postMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" />
                          )}
                          Complete
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!canComplete && (
                      <TooltipContent side="top" className="text-xs max-w-52">
                        Material shortage. Enable "Allow Production Shortage" in Inventory Settings.
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              )}

              {/* Cancel */}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => setCancelConfirm(true)}
                disabled={anyPending}
                title="Cancel"
              >
                <XCircle className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </TableCell>
      </TableRow>

      {/* Expanded panel */}
      {expanded && (
        <TableRow>
          <TableCell colSpan={9} className="bg-muted/20 px-6 py-4 border-t">
            <MaterialAvailabilityPanel
              orderId={order.id}
              orderQty={order.quantity}
              productName={order.product?.name}
              allowShortage={allowShortage}
              canWrite={canWrite}
              orderStatus={status}
              reservedAlready={hasReservations}
              onReserveSuccess={invalidateAll}
              onReleaseSuccess={invalidateAll}
              onReleaseToFloor={status === "Material Reserved" ? () => releaseFloorMutation.mutate() : undefined}
              releaseToFloorPending={releaseFloorMutation.isPending}
            />
          </TableCell>
        </TableRow>
      )}

      {/* Inline Record Run dialog */}
      <InlineRunDialog open={showRunDialog} onOpenChange={setShowRunDialog} order={order} onSuccess={invalidateAll} />

      {/* Complete & Post dialog */}
      <AlertDialog open={postConfirm} onOpenChange={setPostConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete &amp; Post {order.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Any residual qty not yet produced will be consumed now. Already produced:{" "}
              <strong>
                {Number(produced).toLocaleString()} {order.product?.uom ?? ""}
              </strong>
              , residual:{" "}
              <strong>
                {Math.max(0, planned - produced).toLocaleString()} {order.product?.uom ?? ""}
              </strong>
              . Journal entries will be created. Cannot be undone.
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

      {/* Cancel dialog */}
      <AlertDialog open={cancelConfirm} onOpenChange={setCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {order.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              {hasReservations ? `${reservations.length} reservation(s) will be released. ` : ""}
              {produced > 0
                ? `${Number(produced).toLocaleString()} units already produced — entries will be voided and stock reversed. `
                : ""}
              Cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
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

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["production_orders", "active"],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data: rawOrders, error } = await db
        .from("production_orders")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .in("status", ACTIVE_STATUSES)
        .order("priority", { ascending: true })
        .order("planned_start", { ascending: true, nullsFirst: false })
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

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Factory className="h-5 w-5" /> Production Runs
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All open manufacturing orders. Sorted by priority then planned start.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {allowShortage && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/5 px-2.5 py-1 text-xs text-warning font-medium">
              <AlertTriangle className="h-3.5 w-3.5" /> Allow Production Shortage ON
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {orders.length} active order{orders.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20">
              <TableHead className="w-8" />
              <TableHead className="text-xs">MO #</TableHead>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Product</TableHead>
              <TableHead className="text-xs min-w-[140px]">Progress</TableHead>
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
