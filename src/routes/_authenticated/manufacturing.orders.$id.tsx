/**
 * Production Order Detail Page
 *
 * Full 11-stage lifecycle with partial production support:
 *   Draft → Planned → Confirmed → Material Reserved → Released
 *   → In Progress ↔ Paused → Quality Check → Completed → Closed
 *   Any open → Cancelled
 *
 * Key capabilities:
 *   - Record Production Run: partial output, scrap, lot number, notes
 *   - Production Entries history table (full audit trail)
 *   - qty_produced / qty_remaining progress bar
 *   - Priority badge (Critical / High / Normal / Low)
 *   - Planned & actual date fields
 *   - Pause / Resume
 *   - All existing status transitions preserved
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { RecordEditor } from "@/components/record-editor";
import { productionOrderFields } from "@/lib/module-field-definitions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Factory,
  FlaskConical,
  Loader2,
  Lock,
  Package,
  Pause,
  Play,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { MaterialAvailabilityPanel } from "@/components/material-availability-panel";

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_authenticated/manufacturing/orders/$id")({
  component: ProductionOrderDetailPage,
});

// ─── Constants ────────────────────────────────────────────────────────────────

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

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground",
  Planned: "bg-muted text-muted-foreground",
  Confirmed: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  "Material Reserved": "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  Released: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  "In Progress": "bg-info/15 text-info",
  Paused: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  "Quality Check": "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  Completed: "bg-success/15 text-success",
  Closed: "bg-muted text-muted-foreground",
  Cancelled: "bg-destructive/15 text-destructive",
};

const PRIORITY_LABEL: Record<number, string> = {
  1: "Critical",
  2: "High",
  3: "Normal",
  4: "Low",
};
const PRIORITY_COLOR: Record<number, string> = {
  1: "bg-destructive/15 text-destructive",
  2: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  3: "bg-muted text-muted-foreground",
  4: "bg-muted/50 text-muted-foreground",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (v?: string | null) =>
  !v
    ? "—"
    : new Date(v).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

const fmtDateTime = (v?: string | null) =>
  !v
    ? "—"
    : new Date(v).toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

const fmtQty = (v?: number | null, dp = 4) =>
  v == null
    ? "—"
    : Number(v).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: dp,
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
  // For display, treat Paused as In Progress position
  const displayStatus = status === "Paused" ? "In Progress" : status;
  const currentIdx = WORKFLOW_STEPS.indexOf(displayStatus as WorkflowStep);

  return (
    <div className="flex items-center overflow-x-auto py-2 px-1 gap-0">
      {WORKFLOW_STEPS.map((step, idx) => {
        const done = !isCancelled && currentIdx > idx;
        const current = !isCancelled && currentIdx === idx;
        return (
          <div key={step} className="flex items-center shrink-0">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`
                w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors
                ${done ? "bg-success border-success text-success-foreground" : ""}
                ${current ? "bg-primary border-primary text-primary-foreground" : ""}
                ${!done && !current ? "bg-muted border-muted-foreground/30 text-muted-foreground" : ""}
              `}
              >
                {done ? "✓" : idx + 1}
              </div>
              <span
                className={`text-[10px] leading-tight text-center w-16 whitespace-nowrap
                ${current ? "font-semibold text-primary" : "text-muted-foreground"}
                ${done ? "text-success" : ""}
              `}
              >
                {step}
              </span>
            </div>
            {idx < WORKFLOW_STEPS.length - 1 && (
              <div
                className={`h-0.5 w-6 mx-0.5 mb-5 shrink-0 rounded
                ${done ? "bg-success" : "bg-muted-foreground/20"}`}
              />
            )}
          </div>
        );
      })}
      {status === "Paused" && (
        <div className="ml-3 flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs font-semibold text-yellow-700 dark:text-yellow-400 shrink-0">
          <Pause className="h-3 w-3" /> Paused
        </div>
      )}
      {isCancelled && (
        <div className="ml-3 flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive shrink-0">
          <XCircle className="h-3 w-3" /> Cancelled
        </div>
      )}
    </div>
  );
}

// ─── Production progress bar ──────────────────────────────────────────────────

function ProductionProgress({
  planned,
  produced,
  remaining,
  uom,
}: {
  planned: number;
  produced: number;
  remaining: number;
  uom?: string;
}) {
  const pct = planned > 0 ? Math.min(100, (produced / planned) * 100) : 0;
  const color = pct >= 100 ? "[&>div]:bg-success" : pct > 0 ? "[&>div]:bg-info" : "[&>div]:bg-muted-foreground/30";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Progress</span>
        <span className="font-semibold tabular-nums">
          {fmtQty(produced)} / {fmtQty(planned)} {uom ?? ""}{" "}
          <span className="text-muted-foreground">({Math.round(pct)}%)</span>
        </span>
      </div>
      <Progress value={pct} className={`h-2.5 ${color}`} />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Produced: <strong className="text-foreground">{fmtQty(produced)}</strong>
        </span>
        <span>
          Remaining:{" "}
          <strong className={remaining > 0 ? "text-amber-600 dark:text-amber-400" : "text-success"}>
            {fmtQty(remaining)}
          </strong>
        </span>
      </div>
    </div>
  );
}

// ─── Production entries table ─────────────────────────────────────────────────

function ProductionEntriesTable({ orderId }: { orderId: string }) {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["production_entries", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await db
        .from("production_entries")
        .select(
          `
          id, entry_number, entry_date, qty_produced, qty_scrap,
          lot_number, unit_cost, total_cost, status, notes,
          voided_at, void_reason,
          operator:operator_id (full_name, email),
          warehouse:warehouse_id (name, code)
        `,
        )
        .eq("production_order_id", orderId)
        .order("entry_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 10_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
        No production runs recorded yet. Use "Record Run" to log output.
      </div>
    );
  }

  const totalProduced = entries
    .filter((e) => e.status !== "Voided")
    .reduce((s: number, e: any) => s + Number(e.qty_produced), 0);
  const totalScrap = entries
    .filter((e) => e.status !== "Voided")
    .reduce((s: number, e: any) => s + Number(e.qty_scrap), 0);
  const totalCost = entries
    .filter((e) => e.status !== "Voided")
    .reduce((s: number, e: any) => s + Number(e.total_cost), 0);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/20">
            <TableHead className="text-xs w-12">#</TableHead>
            <TableHead className="text-xs">Date</TableHead>
            <TableHead className="text-xs">Operator</TableHead>
            <TableHead className="text-xs">Warehouse</TableHead>
            <TableHead className="text-right text-xs">Produced</TableHead>
            <TableHead className="text-right text-xs">Scrap</TableHead>
            <TableHead className="text-xs">Lot</TableHead>
            <TableHead className="text-right text-xs">Unit Cost</TableHead>
            <TableHead className="text-right text-xs">Total Cost</TableHead>
            <TableHead className="text-xs">Notes</TableHead>
            <TableHead className="text-xs w-20">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((e: any) => (
            <TableRow key={e.id} className={e.status === "Voided" ? "opacity-50 line-through" : ""}>
              <TableCell className="font-mono text-xs text-muted-foreground">{e.entry_number}</TableCell>
              <TableCell className="text-xs">{fmtDate(e.entry_date)}</TableCell>
              <TableCell className="text-xs">{e.operator?.full_name ?? e.operator?.email ?? "—"}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{e.warehouse?.name ?? "—"}</TableCell>
              <TableCell className="text-right font-mono tabular-nums text-sm font-semibold">
                {fmtQty(e.qty_produced)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-sm">
                {Number(e.qty_scrap) > 0 ? (
                  <span className="text-destructive">{fmtQty(e.qty_scrap)}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {e.lot_number ?? <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-xs text-muted-foreground">
                {Number(e.unit_cost).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-xs">
                {Number(e.total_cost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">
                {e.status === "Voided" ? (
                  <span className="text-destructive">Voided: {e.void_reason}</span>
                ) : (
                  (e.notes ?? "—")
                )}
              </TableCell>
              <TableCell>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${e.status === "Voided" ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}
                >
                  {e.status}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        {entries.some((e: any) => e.status !== "Voided") && (
          <tfoot>
            <TableRow className="bg-muted/10 font-semibold border-t-2">
              <TableCell colSpan={4} className="text-xs text-muted-foreground pl-4">
                Totals
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-sm">{fmtQty(totalProduced)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums text-sm text-destructive">
                {totalScrap > 0 ? fmtQty(totalScrap) : "—"}
              </TableCell>
              <TableCell colSpan={2} />
              <TableCell className="text-right font-mono tabular-nums text-xs">
                {totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          </tfoot>
        )}
      </Table>
    </div>
  );
}

// ─── Record Run dialog ────────────────────────────────────────────────────────

interface RecordRunDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: any;
  product?: any;
  onSuccess: () => void;
}

function RecordRunDialog({ open, onOpenChange, order, product, onSuccess }: RecordRunDialogProps) {
  const [qty, setQty] = useState("");
  const [scrap, setScrap] = useState("0");
  const [lotNo, setLotNo] = useState("");
  const [notes, setNotes] = useState("");

  const remaining = Number(order?.qty_remaining ?? order?.quantity ?? 0);

  const runMutation = useMutation({
    mutationFn: async () => {
      const qtyNum = parseFloat(qty);
      const scrapNum = parseFloat(scrap) || 0;
      if (isNaN(qtyNum) || qtyNum <= 0) throw new Error("Quantity must be greater than zero");

      const { data, error } = await (db as any).rpc("record_production_run", {
        _order_id: order.id,
        _qty_produced: qtyNum,
        _qty_scrap: scrapNum,
        _lot_number: lotNo.trim() || null,
        _notes: notes.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Production run recorded.");
      setQty("");
      setScrap("0");
      setLotNo("");
      setNotes("");
      onOpenChange(false);
      onSuccess();
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to record run"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Record Production Run
          </DialogTitle>
          <DialogDescription>
            Log output for <strong>{product?.name ?? "this order"}</strong>. Remaining:{" "}
            <strong className="text-amber-600 dark:text-amber-400">
              {fmtQty(remaining)} {product?.uom ?? ""}
            </strong>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Qty produced */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="run-qty">
                Qty Produced <span className="text-destructive">*</span>
              </Label>
              <Input
                id="run-qty"
                type="number"
                step="any"
                min="0.0001"
                placeholder={`max ${fmtQty(remaining)}`}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="font-mono"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="run-scrap">Scrap Qty</Label>
              <Input
                id="run-scrap"
                type="number"
                step="any"
                min="0"
                placeholder="0"
                value={scrap}
                onChange={(e) => setScrap(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>

          {/* Lot number */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="run-lot">
              Lot Number
              <span className="ml-1.5 text-xs text-muted-foreground">(optional — if finished item is lot-tracked)</span>
            </Label>
            <Input
              id="run-lot"
              placeholder="e.g. LOT-2026-001"
              value={lotNo}
              onChange={(e) => setLotNo(e.target.value)}
              className="font-mono"
            />
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="run-notes">Notes</Label>
            <Textarea
              id="run-notes"
              rows={2}
              placeholder="Shift notes, operator observations…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Overproduction warning */}
          {qty && parseFloat(qty) > remaining && remaining > 0 && !order?.allow_overproduction && (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                This exceeds the remaining quantity. Ensure <em>Allow Overproduction</em> is enabled on the order or the
                server will reject the run.
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={runMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending || !qty || parseFloat(qty) <= 0}
            className="gap-1.5"
          >
            {runMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Record Run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pause dialog ─────────────────────────────────────────────────────────────

function PauseDialog({
  open,
  onOpenChange,
  orderId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await (db as any).rpc("pause_production_order", {
        _order_id: orderId,
        _reason: reason.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Production paused.");
      setReason("");
      onOpenChange(false);
      onSuccess();
    },
    onError: (e: any) => toast.error(e.message ?? "Pause failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pause className="h-5 w-5" />
            Pause Production?
          </DialogTitle>
          <DialogDescription>Provide an optional reason. Reservations remain active.</DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label htmlFor="pause-reason">Reason (optional)</Label>
          <Textarea
            id="pause-reason"
            className="mt-1.5"
            rows={2}
            placeholder="Machine breakdown, shift end…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-1.5">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
            Pause
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ProductionOrderDetailPage() {
  const { id } = Route.useParams();
  const { tenant, can } = useAuth();
  const qc = useQueryClient();
  const canWrite = can(["manufacturing.create", "manufacturing.update"]);

  // Dialog state
  const [showRunDialog, setShowRunDialog] = useState(false);
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [postConfirm, setPostConfirm] = useState(false);
  const [qcConfirm, setQcConfirm] = useState(false);
  const [qcNotes, setQcNotes] = useState("");

  // ── Data fetching ─────────────────────────────────────────────────────
  const { data: order, isLoading } = useQuery({
    queryKey: ["production_orders", id],
    queryFn: async () => {
      const { data, error } = await db.from("production_orders").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

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

  const { data: warehouse } = useQuery({
    queryKey: ["warehouses", order?.warehouse_id],
    enabled: !!order?.warehouse_id,
    queryFn: async () => {
      const { data, error } = await db
        .from("warehouses")
        .select("id, name, code")
        .eq("id", order!.warehouse_id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: location } = useQuery({
    queryKey: ["warehouse_locations", order?.location_id],
    enabled: !!order?.location_id,
    queryFn: async () => {
      const { data, error } = await db
        .from("warehouse_locations")
        .select("id, code, name")
        .eq("id", order!.location_id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

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

  // ── Shared invalidation ───────────────────────────────────────────────
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["production_orders"] });
    qc.invalidateQueries({ queryKey: ["production_orders", id] });
    qc.invalidateQueries({ queryKey: ["stock_reservations", "production_order", id] });
    qc.invalidateQueries({ queryKey: ["material_availability", id] });
    qc.invalidateQueries({ queryKey: ["production_entries", id] });
  };

  // ── Mutations ─────────────────────────────────────────────────────────
  const confirmMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (db as any).rpc("confirm_production_order", { _order_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order confirmed.");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message ?? "Confirmation failed"),
  });

  const releaseToFloorMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (db as any).rpc("release_production_order", { _order_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Released to shop floor.");
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

  const resumeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (db as any).rpc("resume_production_order", { _order_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Production resumed.");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message ?? "Resume failed"),
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
      toast.success("Submitted to Quality Check.");
      setQcNotes("");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message ?? "QC transition failed"),
  });

  const postMutation = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("post_production_order", { _order_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Production completed and inventory updated.");
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
      toast.success("Order closed.");
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
      toast.success("Order cancelled. Reservations released.");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message ?? "Cancellation failed"),
  });

  const anyPending =
    confirmMutation.isPending ||
    releaseToFloorMutation.isPending ||
    startMutation.isPending ||
    resumeMutation.isPending ||
    qcMutation.isPending ||
    postMutation.isPending ||
    closeMutation.isPending ||
    cancelMutation.isPending;

  // ── Loading / not found ───────────────────────────────────────────────
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
          <Link to="/manufacturing/orders">Back</Link>
        </Button>
      </div>
    );
  }

  const status = order.status ?? "Draft";
  const isTerminal = ["Completed", "Closed", "Cancelled"].includes(status);
  const isActive = ["In Progress", "Paused"].includes(status);
  const canRecord = canWrite && isActive;
  const qty = Number(order.quantity ?? 0);
  const produced = Number(order.qty_produced ?? 0);
  const remaining = Number(order.qty_remaining ?? Math.max(0, qty - produced));
  const priority = Number(order.priority ?? 3);
  const showAvail = !isTerminal && !!order.bom_id;
  const showProgress = produced > 0 || isActive || ["Quality Check", "Completed"].includes(status);

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6 max-w-5xl mx-auto">
      {/* ── Breadcrumb + actions ───────────────────────────────────────── */}
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
        <Badge variant="outline" className={`text-xs ${PRIORITY_COLOR[priority]}`}>
          {PRIORITY_LABEL[priority] ?? "Normal"}
        </Badge>

        {canWrite && (
          <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
            <Button size="sm" variant="outline" onClick={() => setShowEditDialog(true)}>
              Edit
            </Button>
            {/* Record Run — primary action when In Progress or Paused */}
            {canRecord && (
              <Button size="sm" className="gap-1.5" onClick={() => setShowRunDialog(true)}>
                <Plus className="h-3.5 w-3.5" /> Record Run
              </Button>
            )}

            {/* Pause */}
            {status === "In Progress" && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setShowPauseDialog(true)}
                disabled={anyPending}
              >
                <Pause className="h-3.5 w-3.5" /> Pause
              </Button>
            )}

            {/* Resume */}
            {status === "Paused" && (
              <Button size="sm" className="gap-1.5" onClick={() => resumeMutation.mutate()} disabled={anyPending}>
                {resumeMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Resume
              </Button>
            )}

            {/* Confirm */}
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
                Confirm
              </Button>
            )}

            {/* Start (Released) */}
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

            {/* Submit to QC */}
            {isActive && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setQcConfirm(true)}
                disabled={anyPending}
              >
                <FlaskConical className="h-3.5 w-3.5" /> Submit to QC
              </Button>
            )}

            {/* Complete & Post */}
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

            {/* Close */}
            {status === "Completed" && (
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
                Close
              </Button>
            )}

            {/* Cancel */}
            {!isTerminal && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={() => setCancelConfirm(true)}
                disabled={anyPending}
              >
                <XCircle className="h-3.5 w-3.5" /> Cancel
              </Button>
            )}
          </div>
        )}
      </div>

      {canWrite && (
        <Dialog open={showEditDialog} onOpenChange={(open) => setShowEditDialog(open)}>
          <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Production Order</DialogTitle>
              <DialogDescription>Update the order header details and planning fields.</DialogDescription>
            </DialogHeader>
            <RecordEditor
              id={id}
              table="production_orders"
              fields={productionOrderFields}
              entityLabel="Production Order"
              listHref="/manufacturing/orders"
              titleKey="number"
              writeRoles={["manufacturing"]}
              permissionModule="manufacturing"
            />
          </DialogContent>
        </Dialog>
      )}

      {/* ── Workflow stepper ──────────────────────────────────────────── */}
      {!["Cancelled"].includes(status) && (
        <Card className="overflow-hidden">
          <CardContent className="px-4 py-3">
            <WorkflowStepper status={status} />
          </CardContent>
        </Card>
      )}

      {/* ── Progress bar (when production has started) ─────────────────── */}
      {showProgress && (
        <Card>
          <CardContent className="px-4 py-4">
            <ProductionProgress
              planned={qty}
              produced={produced}
              remaining={remaining}
              uom={product?.uom ?? order.quantity_uom}
            />
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
        <CardContent className="px-4 pb-4 flex flex-col gap-4">
          {/* Row 1: core identity */}
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
                  <span className="text-destructive text-xs">No BOM</span>
                )
              }
            />
            <FieldRow
              label="Priority"
              value={
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLOR[priority]}`}
                >
                  {PRIORITY_LABEL[priority] ?? "Normal"}
                </span>
              }
            />
          </div>

          {/* Row 2: quantities */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <FieldRow
              label="Qty Planned"
              value={
                <span className="font-mono font-semibold">
                  {fmtQty(qty)} {product?.uom ?? order.quantity_uom ?? ""}
                </span>
              }
            />
            <FieldRow
              label="Qty Produced"
              value={
                <span className={`font-mono font-semibold ${produced > 0 ? "text-success" : "text-muted-foreground"}`}>
                  {fmtQty(produced)}
                </span>
              }
            />
            <FieldRow
              label="Qty Remaining"
              value={
                <span
                  className={`font-mono font-semibold ${remaining > 0 ? "text-amber-600 dark:text-amber-400" : "text-success"}`}
                >
                  {fmtQty(remaining)}
                </span>
              }
            />
            <FieldRow label="Warehouse" value={warehouse?.name ?? "—"} />
            <FieldRow
              label="Location"
              value={location ? `${location.code}${location.name ? ` — ${location.name}` : ""}` : "—"}
            />
          </div>

          {/* Row 3: dates */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <FieldRow
              label="Planned Start"
              value={
                order.planned_start ? (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3 text-muted-foreground" />
                    {fmtDate(order.planned_start)}
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <FieldRow
              label="Planned End"
              value={
                order.planned_end ? (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3 text-muted-foreground" />
                    {fmtDate(order.planned_end)}
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <FieldRow label="Actual Start" value={fmtDateTime(order.actual_start)} />
            <FieldRow label="Actual End" value={fmtDateTime(order.actual_end)} />
          </div>

          {order.notes && (
            <>
              <Separator />
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
              <Separator />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {order.confirmed_at && <FieldRow label="Confirmed" value={fmtDateTime(order.confirmed_at)} />}
                {order.reserved_at && <FieldRow label="Reserved" value={fmtDateTime(order.reserved_at)} />}
                {order.released_at && <FieldRow label="Released" value={fmtDateTime(order.released_at)} />}
                {order.paused_at && <FieldRow label="Paused" value={fmtDateTime(order.paused_at)} />}
                {order.quality_check_at && (
                  <FieldRow label="QC Submitted" value={fmtDateTime(order.quality_check_at)} />
                )}
                {order.posted_at && <FieldRow label="Completed" value={fmtDateTime(order.posted_at)} />}
                {order.closed_at && <FieldRow label="Closed" value={fmtDateTime(order.closed_at)} />}
                {order.cancelled_at && <FieldRow label="Cancelled" value={fmtDateTime(order.cancelled_at)} />}
              </div>
            </>
          )}

          {/* Pause reason */}
          {order.pause_reason && (
            <>
              <Separator />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">Pause Reason</span>
                <p className="text-sm text-yellow-700 dark:text-yellow-400">{order.pause_reason}</p>
              </div>
            </>
          )}

          {/* QC notes */}
          {order.quality_notes && (
            <>
              <Separator />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">Quality Check Notes</span>
                <p className="text-sm">{order.quality_notes}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Reservation banner ────────────────────────────────────────────── */}
      {["Material Reserved", "Released", "In Progress", "Paused", "Quality Check"].includes(status) &&
        hasReservations && (
          <div className="flex items-center gap-2 rounded-md border border-violet-500/30 bg-violet-500/5 px-3 py-2 text-xs">
            <Package className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
            <span className="text-violet-700 dark:text-violet-300">
              <strong>{existingReservations.length}</strong> component reservation
              {existingReservations.length !== 1 ? "s" : ""} active — materials held for this order.
            </span>
          </div>
        )}

      {/* ── Terminal state banners ────────────────────────────────────────── */}
      {status === "Completed" && (
        <div className="flex items-center gap-3 rounded-lg border border-success/40 bg-success/5 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
          <div>
            <p className="text-sm font-semibold text-success">Production Complete</p>
            <p className="text-xs text-muted-foreground">
              {fmtQty(produced)} {product?.uom ?? ""} produced. All reservations fulfilled. Close the order when ready.
            </p>
          </div>
        </div>
      )}
      {status === "Closed" && (
        <div className="flex items-center gap-3 rounded-lg border border-muted bg-muted/20 px-4 py-3">
          <Lock className="h-5 w-5 text-muted-foreground shrink-0" />
          <p className="text-sm font-semibold text-muted-foreground">Order Closed</p>
        </div>
      )}
      {status === "Cancelled" && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
          <XCircle className="h-5 w-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-semibold text-destructive">Order Cancelled</p>
            <p className="text-xs text-muted-foreground">All reservations released and production entries voided.</p>
          </div>
        </div>
      )}

      {/* ── Production Entries ───────────────────────────────────────────── */}
      {(produced > 0 || isActive || ["Quality Check", "Completed", "Closed", "Cancelled"].includes(status)) && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              Production Runs
            </h2>
            {canRecord && (
              <Button size="sm" variant="outline" className="gap-1.5 h-7" onClick={() => setShowRunDialog(true)}>
                <Plus className="h-3 w-3" /> Record Run
              </Button>
            )}
          </div>
          <ProductionEntriesTable orderId={id} />
        </div>
      )}

      {/* ── Material Availability ─────────────────────────────────────────── */}
      {showAvail && (
        <div>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            Material Availability
            {["Material Reserved", "Released", "In Progress", "Paused", "Quality Check"].includes(status) && (
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
            onReserveSuccess={invalidateAll}
            onReleaseSuccess={invalidateAll}
            onReleaseToFloor={status === "Material Reserved" ? () => releaseToFloorMutation.mutate() : undefined}
            releaseToFloorPending={releaseToFloorMutation.isPending}
          />
        </div>
      )}

      {!order.bom_id && !isTerminal && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          No BOM assigned. Edit the order to assign a BOM before confirming.
        </div>
      )}

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}

      <RecordRunDialog
        open={showRunDialog}
        onOpenChange={setShowRunDialog}
        order={order}
        product={product}
        onSuccess={invalidateAll}
      />

      <PauseDialog open={showPauseDialog} onOpenChange={setShowPauseDialog} orderId={id} onSuccess={invalidateAll} />

      {/* QC dialog */}
      <AlertDialog open={qcConfirm} onOpenChange={setQcConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5" /> Submit to Quality Check?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Production will move to <strong>Quality Check</strong>. Inventory is not finalised yet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 py-2">
            <Label htmlFor="qc-notes">QC Notes (optional)</Label>
            <Textarea
              id="qc-notes"
              className="mt-1.5"
              rows={3}
              placeholder="Inspection notes, measurements, pass criteria…"
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

      {/* Complete & Post dialog */}
      <AlertDialog open={postConfirm} onOpenChange={setPostConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete &amp; Post Production Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Any residual quantity not yet produced via runs will be consumed and received now. Total planned:{" "}
              <strong>
                {fmtQty(qty)} {product?.uom ?? ""}
              </strong>
              , already produced: <strong>{fmtQty(produced)}</strong>, residual:{" "}
              <strong>{fmtQty(Math.max(0, qty - produced))}</strong>. Journal entries will be created. This cannot be
              undone.
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
            <AlertDialogTitle>Cancel Production Order?</AlertDialogTitle>
            <AlertDialogDescription>
              {hasReservations
                ? `${existingReservations.length} reservation${existingReservations.length !== 1 ? "s" : ""} will be released. `
                : ""}
              {produced > 0
                ? `${fmtQty(produced)} units already produced — those production entries will be voided and stock movements reversed. `
                : ""}
              This cannot be undone.
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
