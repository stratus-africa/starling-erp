/**
 * LotSerialPanel
 *
 * Reusable traceability panel shown on Item360Page under the "Traceability" tab.
 * Shows two sub-tabs: Lots/Batches and Serial Numbers.
 *
 * Features:
 *  - Full CRUD for lot/batch records
 *  - Full CRUD for serial number records
 *  - Per-lot on-hand derived from inventory_lot_stock view (FEFO sorted)
 *  - Expiry warnings (red = expired, amber = ≤30 days)
 *  - Status management (Active / Quarantine / Released / Expired / Consumed / Recalled)
 *  - Traceability chain dialog via get_lot_traceability / get_serial_traceability RPCs
 *  - Bulk serial import (newline-separated)
 */

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronRight,
  Edit2, ExternalLink, FileSearch, Fingerprint, FlaskConical,
  Loader2, Plus, Search, Shield, Trash2, Upload,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type LotRow = {
  id: string;
  item_id: string;
  lot_number: string;
  supplier_lot_ref: string | null;
  status: string;
  manufactured_date: string | null;
  expiry_date: string | null;
  received_date: string | null;
  initial_qty: number;
  warehouse_id: string | null;
  location_id: string | null;
  certificate_ref: string | null;
  source_ref_type: string | null;
  source_ref_id: string | null;
  notes: string | null;
  tenant_id: string;
};

type SerialRow = {
  id: string;
  item_id: string;
  serial_number: string;
  lot_id: string | null;
  status: string;
  warehouse_id: string | null;
  location_id: string | null;
  customer_id: string | null;
  warranty_months: number | null;
  warranty_start: string | null;
  warranty_end: string | null;
  manufactured_date: string | null;
  received_date: string | null;
  received_from_ref_type: string | null;
  received_from_ref_id: string | null;
  issued_to_ref_type: string | null;
  issued_to_ref_id: string | null;
  production_order_id: string | null;
  notes: string | null;
  tenant_id: string;
};

type LotStockRow = {
  lot_id: string | null;
  lot_number: string | null;
  on_hand: number | null;
  warehouse_name: string | null;
  warehouse_id: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const LOT_STATUSES = ["Active", "Quarantine", "Released", "Expired", "Consumed", "Recalled"] as const;
const SERIAL_STATUSES = ["In Stock", "Reserved", "Sold", "Consumed", "Transferred", "Returned", "Scrapped"] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (v: string | null) =>
  !v ? "—" : new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

const fmtDateTime = (v: string | null) =>
  !v ? "—" : new Date(v).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const qty = (v: any) =>
  Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function expiryDaysLeft(expiry: string | null): number | null {
  if (!expiry) return null;
  return Math.ceil((new Date(expiry).getTime() - Date.now()) / 86_400_000);
}

function ExpiryBadge({ expiry }: { expiry: string | null }) {
  if (!expiry) return <span className="text-muted-foreground text-xs">—</span>;
  const days = expiryDaysLeft(expiry);
  if (days === null) return null;
  if (days < 0)
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive"><AlertTriangle className="h-3 w-3" /> Expired {fmtDate(expiry)}</span>;
  if (days <= 30)
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-warning"><AlertTriangle className="h-3 w-3" /> {fmtDate(expiry)} ({days}d)</span>;
  return <span className="text-xs text-muted-foreground">{fmtDate(expiry)}</span>;
}

function LotStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    Active:     "bg-success/15 text-success",
    Released:   "bg-success/15 text-success",
    Quarantine: "bg-warning/15 text-warning",
    Expired:    "bg-destructive/15 text-destructive",
    Recalled:   "bg-destructive/15 text-destructive",
    Consumed:   "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

function SerialStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    "In Stock":   "bg-success/15 text-success",
    Reserved:     "bg-info/15 text-info",
    Sold:         "bg-muted text-muted-foreground",
    Consumed:     "bg-muted text-muted-foreground",
    Transferred:  "bg-info/15 text-info",
    Returned:     "bg-warning/15 text-warning",
    Scrapped:     "bg-destructive/15 text-destructive",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

// ─── Lot dialog ───────────────────────────────────────────────────────────────

function LotDialog({
  open, onClose, itemId, tenantId, lot,
}: {
  open: boolean; onClose: () => void; itemId: string; tenantId: string; lot?: LotRow | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!lot;

  const [form, setForm] = useState({
    lot_number:       lot?.lot_number ?? "",
    supplier_lot_ref: lot?.supplier_lot_ref ?? "",
    status:           lot?.status ?? "Active",
    manufactured_date: lot?.manufactured_date ?? "",
    expiry_date:      lot?.expiry_date ?? "",
    received_date:    lot?.received_date ?? "",
    initial_qty:      lot?.initial_qty != null ? String(lot.initial_qty) : "",
    certificate_ref:  lot?.certificate_ref ?? "",
    notes:            lot?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setError(null);
    if (!form.lot_number.trim()) { setError("Lot number is required"); return; }
    setSaving(true);
    try {
      const payload = {
        lot_number:       form.lot_number.trim().toUpperCase(),
        supplier_lot_ref: form.supplier_lot_ref || null,
        status:           form.status,
        manufactured_date: form.manufactured_date || null,
        expiry_date:      form.expiry_date || null,
        received_date:    form.received_date || null,
        initial_qty:      form.initial_qty ? parseFloat(form.initial_qty) : 0,
        certificate_ref:  form.certificate_ref || null,
        notes:            form.notes || null,
        item_id:          itemId,
        tenant_id:        tenantId,
        deleted_at:       null,
      };
      if (isEdit) {
        const { error: e } = await db.from("item_lots").update(payload).eq("id", lot!.id);
        if (e) throw e;
        toast.success("Lot updated.");
      } else {
        const { error: e } = await db.from("item_lots").insert(payload);
        if (e) throw e;
        toast.success("Lot created.");
      }
      qc.invalidateQueries({ queryKey: ["item_lots", itemId] });
      qc.invalidateQueries({ queryKey: ["inventory_lot_stock", itemId] });
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{isEdit ? "Edit Lot / Batch" : "New Lot / Batch"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Lot Number <span className="text-destructive">*</span></Label>
              <Input value={form.lot_number} onChange={e => set("lot_number", e.target.value.toUpperCase())}
                placeholder="LOT-2024-001" className="font-mono" />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LOT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Supplier Lot Reference</Label>
            <Input value={form.supplier_lot_ref} onChange={e => set("supplier_lot_ref", e.target.value)}
              placeholder="Supplier's own lot/batch number" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Manufactured</Label>
              <Input type="date" value={form.manufactured_date} onChange={e => set("manufactured_date", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Received</Label>
              <Input type="date" value={form.received_date} onChange={e => set("received_date", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Expiry Date</Label>
              <Input type="date" value={form.expiry_date} onChange={e => set("expiry_date", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Initial Quantity</Label>
              <Input type="number" min={0} value={form.initial_qty}
                onChange={e => set("initial_qty", e.target.value)} className="text-right font-mono" />
            </div>
            <div className="space-y-1">
              <Label>Certificate / CoA Ref</Label>
              <Input value={form.certificate_ref} onChange={e => set("certificate_ref", e.target.value)}
                placeholder="e.g. COA-2024-1234" className="font-mono" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Save Changes" : "Create Lot"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Serial dialog ────────────────────────────────────────────────────────────

function SerialDialog({
  open, onClose, itemId, tenantId, lots, serial,
}: {
  open: boolean; onClose: () => void; itemId: string; tenantId: string; lots: LotRow[]; serial?: SerialRow | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!serial;
  const [form, setForm] = useState({
    serial_number:    serial?.serial_number ?? "",
    lot_id:           serial?.lot_id ?? "",
    status:           serial?.status ?? "In Stock",
    manufactured_date: serial?.manufactured_date ?? "",
    received_date:    serial?.received_date ?? "",
    warranty_months:  serial?.warranty_months != null ? String(serial.warranty_months) : "",
    warranty_start:   serial?.warranty_start ?? "",
    notes:            serial?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setError(null);
    if (!form.serial_number.trim()) { setError("Serial number is required"); return; }
    setSaving(true);
    try {
      const payload = {
        serial_number:    form.serial_number.trim().toUpperCase(),
        lot_id:           form.lot_id || null,
        status:           form.status,
        manufactured_date: form.manufactured_date || null,
        received_date:    form.received_date || null,
        warranty_months:  form.warranty_months ? parseInt(form.warranty_months, 10) : null,
        warranty_start:   form.warranty_start || null,
        notes:            form.notes || null,
        item_id:          itemId,
        tenant_id:        tenantId,
        deleted_at:       null,
      };
      if (isEdit) {
        const { error: e } = await db.from("item_serials").update(payload).eq("id", serial!.id);
        if (e) throw e;
        toast.success("Serial updated.");
      } else {
        const { error: e } = await db.from("item_serials").insert(payload);
        if (e) throw e;
        toast.success("Serial created.");
      }
      qc.invalidateQueries({ queryKey: ["item_serials", itemId] });
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Save failed — serial number may already exist for this item");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? "Edit Serial Number" : "New Serial Number"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Serial Number <span className="text-destructive">*</span></Label>
              <Input value={form.serial_number} onChange={e => set("serial_number", e.target.value.toUpperCase())}
                placeholder="SN-00001" className="font-mono" />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SERIAL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {lots.length > 0 && (
            <div className="space-y-1">
              <Label>Lot / Batch (optional)</Label>
              <Select value={form.lot_id || "none"} onValueChange={v => set("lot_id", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="No lot" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No lot —</SelectItem>
                  {lots.filter(l => !l.deleted_at).map(l => (
                    <SelectItem key={l.id} value={l.id}>
                      <span className="font-mono">{l.lot_number}</span>
                      {l.expiry_date && <span className="text-muted-foreground ml-2">exp {fmtDate(l.expiry_date)}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Manufactured</Label>
              <Input type="date" value={form.manufactured_date} onChange={e => set("manufactured_date", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Received</Label>
              <Input type="date" value={form.received_date} onChange={e => set("received_date", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Warranty (months)</Label>
              <Input type="number" min={0} value={form.warranty_months}
                onChange={e => set("warranty_months", e.target.value)} className="text-right font-mono" />
            </div>
            <div className="space-y-1">
              <Label>Warranty Start</Label>
              <Input type="date" value={form.warranty_start} onChange={e => set("warranty_start", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Save Changes" : "Create Serial"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk serial import dialog ────────────────────────────────────────────────

function BulkSerialDialog({
  open, onClose, itemId, tenantId, lots,
}: {
  open: boolean; onClose: () => void; itemId: string; tenantId: string; lots: LotRow[];
}) {
  const qc = useQueryClient();
  const [raw, setRaw] = useState("");
  const [lotId, setLotId] = useState("");
  const [status, setStatus] = useState("In Stock");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const lines = raw.split(/[\n,;]+/).map(l => l.trim().toUpperCase()).filter(Boolean);
    if (!lines.length) { setError("Enter at least one serial number"); return; }
    setSaving(true);
    try {
      const rows = lines.map(sn => ({
        serial_number: sn,
        item_id:       itemId,
        tenant_id:     tenantId,
        lot_id:        lotId || null,
        status,
      }));
      const { error: e } = await db.from("item_serials").insert(rows);
      if (e) throw e;
      toast.success(`${lines.length} serial number(s) imported.`);
      qc.invalidateQueries({ queryKey: ["item_serials", itemId] });
      setRaw("");
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Import failed — check for duplicate serial numbers");
    } finally {
      setSaving(false);
    }
  };

  const lineCount = raw.split(/[\n,;]+/).map(l => l.trim()).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Upload className="h-4 w-4" /> Bulk Import Serials</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-1">
            <Label>Serial Numbers <span className="text-xs text-muted-foreground">(one per line, or comma/semicolon separated)</span></Label>
            <Textarea value={raw} onChange={e => setRaw(e.target.value)}
              rows={8} className="font-mono text-xs" placeholder={"SN-00001\nSN-00002\nSN-00003"} />
            <p className="text-xs text-muted-foreground">{lineCount} serial{lineCount !== 1 ? "s" : ""} detected</p>
          </div>
          {lots.length > 0 && (
            <div className="space-y-1">
              <Label>Assign to Lot (optional)</Label>
              <Select value={lotId || "none"} onValueChange={v => setLotId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="No lot" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No lot —</SelectItem>
                  {lots.filter(l => !l.deleted_at).map(l => (
                    <SelectItem key={l.id} value={l.id}>
                      <span className="font-mono">{l.lot_number}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Initial Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SERIAL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !lineCount}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Import {lineCount > 0 ? `${lineCount} ` : ""}Serial{lineCount !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Traceability chain dialog ────────────────────────────────────────────────

function TraceDialog({
  open, onClose, type, id: targetId,
}: {
  open: boolean; onClose: () => void; type: "lot" | "serial"; id: string;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["traceability", type, targetId],
    enabled: open && !!targetId,
    queryFn: async () => {
      const rpc = type === "lot" ? "get_lot_traceability" : "get_serial_traceability";
      const param = type === "lot" ? { _lot_id: targetId } : { _serial_id: targetId };
      const { data, error } = await (db as any).rpc(rpc, param);
      if (error) throw error;
      return data as any;
    },
  });

  const movements: any[] = data?.movements ?? [];
  const stock: any[] = data?.stock ?? [];
  const serials: any[] = data?.serials ?? [];
  const lotInfo = data?.lot ?? data?.serial;

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSearch className="h-4 w-4" />
            {type === "lot" ? "Lot Traceability" : "Serial Traceability"}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive py-4">{(error as any).message}</p>
        )}

        {data && !isLoading && (
          <div className="space-y-5">
            {/* Stock by warehouse */}
            {stock.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Current Stock</p>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="text-xs">Warehouse</TableHead>
                        <TableHead className="text-xs">Location</TableHead>
                        <TableHead className="text-xs text-right">On Hand</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stock.map((s: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm">{s.warehouse_name ?? "—"}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{s.location_code ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-sm font-semibold">{qty(s.on_hand)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Serials in lot */}
            {serials.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Serial Numbers in Lot ({serials.length})
                </p>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="text-xs">Serial</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Location</TableHead>
                        <TableHead className="text-xs">Warranty Exp</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {serials.map((s: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs font-semibold">{s.serial_number}</TableCell>
                          <TableCell><SerialStatusBadge status={s.status} /></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{s.warehouse ?? "—"} {s.location ? `/ ${s.location}` : ""}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{fmtDate(s.warranty_end)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Movement chain */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Movement History ({movements.length})
              </p>
              {movements.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No movements recorded yet.</p>
              ) : (
                <div className="space-y-1">
                  {movements.map((m: any, i: number) => {
                    const isIn = Number(m.quantity) > 0;
                    return (
                      <div key={i} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted/30">
                        <span className="text-xs text-muted-foreground w-28 shrink-0">{fmtDateTime(m.created_at)}</span>
                        <Badge variant={isIn ? "secondary" : "outline"} className="text-xs shrink-0">{m.ref_type}</Badge>
                        <span className="text-xs text-muted-foreground">{m.warehouse ?? "—"}{m.location ? ` / ${m.location}` : ""}</span>
                        <span className={`ml-auto font-mono tabular-nums text-sm font-semibold ${isIn ? "text-success" : "text-destructive"}`}>
                          {isIn ? "+" : ""}{qty(m.quantity)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export interface LotSerialPanelProps {
  itemId: string;
  trackBatches: boolean;
  trackSerials: boolean;
}

export function LotSerialPanel({ itemId, trackBatches, trackSerials }: LotSerialPanelProps) {
  const { tenant, can } = useAuth();
  const qc = useQueryClient();
  const canWrite = can(["inventory.create", "inventory.update"]);

  const [lotSearch, setLotSearch] = useState("");
  const [serialSearch, setSerialSearch] = useState("");
  const [lotStatusFilter, setLotStatusFilter] = useState("");
  const [serialStatusFilter, setSerialStatusFilter] = useState("");

  const [lotDialog, setLotDialog] = useState<{ open: boolean; lot?: LotRow | null }>({ open: false });
  const [serialDialog, setSerialDialog] = useState<{ open: boolean; serial?: SerialRow | null }>({ open: false });
  const [bulkDialog, setBulkDialog] = useState(false);
  const [traceDialog, setTraceDialog] = useState<{ open: boolean; type: "lot" | "serial"; id: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ table: string; id: string; label: string } | null>(null);

  // ── Data ──────────────────────────────────────────────────────────────────

  const { data: lots = [], isLoading: lotsLoading } = useQuery({
    queryKey: ["item_lots", itemId],
    enabled: trackBatches && !!itemId,
    queryFn: async () => {
      const { data, error } = await db
        .from("item_lots").select("*")
        .eq("item_id", itemId).is("deleted_at", null)
        .order("expiry_date", { ascending: true, nullsFirst: false })
        .order("lot_number");
      if (error) throw error;
      return (data ?? []) as LotRow[];
    },
  });

  const { data: lotStock = [] } = useQuery({
    queryKey: ["inventory_lot_stock", itemId],
    enabled: trackBatches && !!itemId,
    queryFn: async () => {
      const { data, error } = await db
        .from("inventory_lot_stock").select("lot_id,lot_number,on_hand,warehouse_name,warehouse_id")
        .eq("item_id", itemId);
      if (error) throw error;
      return (data ?? []) as LotStockRow[];
    },
  });

  const { data: serials = [], isLoading: serialsLoading } = useQuery({
    queryKey: ["item_serials", itemId],
    enabled: trackSerials && !!itemId,
    queryFn: async () => {
      const { data, error } = await db
        .from("item_serials").select("*")
        .eq("item_id", itemId).is("deleted_at", null)
        .order("serial_number");
      if (error) throw error;
      return (data ?? []) as SerialRow[];
    },
  });

  // Per-lot on-hand map
  const lotOnHand = new Map<string, number>();
  for (const row of lotStock) {
    if (row.lot_id) {
      lotOnHand.set(row.lot_id, (lotOnHand.get(row.lot_id) ?? 0) + Number(row.on_hand ?? 0));
    }
  }

  // ── Soft-delete ───────────────────────────────────────────────────────────

  const softDelete = useMutation({
    mutationFn: async ({ table, id }: { table: string; id: string }) => {
      const { error } = await db.from(table).update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { table }) => {
      toast.success("Record removed.");
      const key = table === "item_lots" ? ["item_lots", itemId] : ["item_serials", itemId];
      qc.invalidateQueries({ queryKey: key });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  // ── Filtered lists ────────────────────────────────────────────────────────

  const filteredLots = lots.filter(l => {
    const s = lotSearch.toLowerCase();
    const matchSearch = !s || l.lot_number.toLowerCase().includes(s) || (l.supplier_lot_ref ?? "").toLowerCase().includes(s);
    const matchStatus = !lotStatusFilter || l.status === lotStatusFilter;
    return matchSearch && matchStatus;
  });

  const filteredSerials = serials.filter(s => {
    const q = serialSearch.toLowerCase();
    const matchSearch = !q || s.serial_number.toLowerCase().includes(q) || (s.notes ?? "").toLowerCase().includes(q);
    const matchStatus = !serialStatusFilter || s.status === serialStatusFilter;
    return matchSearch && matchStatus;
  });

  // Lot map for serial tab
  const lotMap = new Map(lots.map(l => [l.id, l]));

  // ── Expiry summary ────────────────────────────────────────────────────────
  const expiredCount  = lots.filter(l => l.expiry_date && expiryDaysLeft(l.expiry_date)! < 0).length;
  const expiringCount = lots.filter(l => {
    const d = expiryDaysLeft(l.expiry_date);
    return d !== null && d >= 0 && d <= 30;
  }).length;

  // ── Render ────────────────────────────────────────────────────────────────

  const defaultTab = trackBatches ? "lots" : "serials";

  return (
    <div className="space-y-4">
      {/* Summary alerts */}
      {(expiredCount > 0 || expiringCount > 0) && (
        <div className="flex flex-wrap gap-2">
          {expiredCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              {expiredCount} expired lot{expiredCount !== 1 ? "s" : ""}
            </div>
          )}
          {expiringCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/5 px-3 py-1.5 text-xs text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
              {expiringCount} lot{expiringCount !== 1 ? "s" : ""} expiring within 30 days
            </div>
          )}
        </div>
      )}

      <Tabs defaultValue={defaultTab}>
        <TabsList className="bg-transparent border-b rounded-none h-auto p-0 justify-start gap-0 w-full">
          {trackBatches && (
            <TabsTrigger
              value="lots"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2 text-sm gap-2"
            >
              <FlaskConical className="h-3.5 w-3.5" />
              Lots / Batches
              <span className="ml-1 text-xs text-muted-foreground">({lots.length})</span>
            </TabsTrigger>
          )}
          {trackSerials && (
            <TabsTrigger
              value="serials"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2 text-sm gap-2"
            >
              <Fingerprint className="h-3.5 w-3.5" />
              Serial Numbers
              <span className="ml-1 text-xs text-muted-foreground">({serials.length})</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── Lots tab ──────────────────────────────────────────────────── */}
        {trackBatches && (
          <TabsContent value="lots" className="mt-4">
            {/* Toolbar */}
            <div className="flex items-center gap-2 mb-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search lots…" value={lotSearch} onChange={e => setLotSearch(e.target.value)}
                  className="h-8 pl-8 text-sm w-48" />
              </div>
              <Select value={lotStatusFilter || "all"} onValueChange={v => setLotStatusFilter(v === "all" ? "" : v)}>
                <SelectTrigger className="h-8 w-36 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {LOT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground ml-1">{filteredLots.length} lot{filteredLots.length !== 1 ? "s" : ""}</span>
              {canWrite && (
                <Button size="sm" variant="outline" className="ml-auto gap-1" onClick={() => setLotDialog({ open: true })}>
                  <Plus className="h-3.5 w-3.5" /> New Lot
                </Button>
              )}
            </div>

            {lotsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredLots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <FlaskConical className="h-7 w-7 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">{lots.length === 0 ? "No lot records yet." : "No lots match the filter."}</p>
                {canWrite && lots.length === 0 && (
                  <Button size="sm" onClick={() => setLotDialog({ open: true })}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Create First Lot
                  </Button>
                )}
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20">
                      <TableHead className="text-xs">Lot Number</TableHead>
                      <TableHead className="text-xs">Supplier Ref</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Mfg Date</TableHead>
                      <TableHead className="text-xs">Expiry</TableHead>
                      <TableHead className="text-xs text-right">On Hand</TableHead>
                      <TableHead className="text-xs">CoA Ref</TableHead>
                      {canWrite && <TableHead className="text-xs w-24" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLots.map(lot => {
                      const onHand = lotOnHand.get(lot.id) ?? 0;
                      return (
                        <TableRow key={lot.id} className="hover:bg-muted/30">
                          <TableCell className="font-mono text-xs font-semibold">{lot.lot_number}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{lot.supplier_lot_ref ?? "—"}</TableCell>
                          <TableCell><LotStatusBadge status={lot.status} /></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{fmtDate(lot.manufactured_date)}</TableCell>
                          <TableCell><ExpiryBadge expiry={lot.expiry_date} /></TableCell>
                          <TableCell className={`text-right font-mono tabular-nums text-sm font-semibold ${onHand < 0 ? "text-destructive" : onHand === 0 ? "text-muted-foreground" : ""}`}>
                            {qty(onHand)}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{lot.certificate_ref ?? "—"}</TableCell>
                          {canWrite && (
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => setTraceDialog({ open: true, type: "lot", id: lot.id })}
                                  title="View traceability chain">
                                  <FileSearch className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => setLotDialog({ open: true, lot })}>
                                  <Edit2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => setDeleteTarget({ table: "item_lots", id: lot.id, label: lot.lot_number })}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                          {!canWrite && (
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-7 w-7"
                                onClick={() => setTraceDialog({ open: true, type: "lot", id: lot.id })}>
                                <FileSearch className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        )}

        {/* ── Serials tab ───────────────────────────────────────────────── */}
        {trackSerials && (
          <TabsContent value="serials" className="mt-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search serials…" value={serialSearch} onChange={e => setSerialSearch(e.target.value)}
                  className="h-8 pl-8 text-sm w-48" />
              </div>
              <Select value={serialStatusFilter || "all"} onValueChange={v => setSerialStatusFilter(v === "all" ? "" : v)}>
                <SelectTrigger className="h-8 w-36 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {SERIAL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground ml-1">{filteredSerials.length} serial{filteredSerials.length !== 1 ? "s" : ""}</span>
              {canWrite && (
                <div className="ml-auto flex items-center gap-1">
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => setBulkDialog(true)}>
                    <Upload className="h-3.5 w-3.5" /> Bulk Import
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => setSerialDialog({ open: true })}>
                    <Plus className="h-3.5 w-3.5" /> New Serial
                  </Button>
                </div>
              )}
            </div>

            {serialsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredSerials.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Fingerprint className="h-7 w-7 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">{serials.length === 0 ? "No serial numbers yet." : "No serials match the filter."}</p>
                {canWrite && serials.length === 0 && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setBulkDialog(true)}>
                      <Upload className="mr-1.5 h-3.5 w-3.5" /> Bulk Import
                    </Button>
                    <Button size="sm" onClick={() => setSerialDialog({ open: true })}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" /> Create Serial
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20">
                      <TableHead className="text-xs">Serial Number</TableHead>
                      <TableHead className="text-xs">Lot</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Received</TableHead>
                      <TableHead className="text-xs">Warranty Exp</TableHead>
                      <TableHead className="text-xs">Source</TableHead>
                      {canWrite && <TableHead className="text-xs w-24" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSerials.map(s => {
                      const lot = s.lot_id ? lotMap.get(s.lot_id) : null;
                      const warrantyExpired = s.warranty_end && new Date(s.warranty_end) < new Date();
                      return (
                        <TableRow key={s.id} className="hover:bg-muted/30">
                          <TableCell className="font-mono text-xs font-semibold">{s.serial_number}</TableCell>
                          <TableCell>
                            {lot ? (
                              <span className="font-mono text-xs text-muted-foreground">{lot.lot_number}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell><SerialStatusBadge status={s.status} /></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{fmtDate(s.received_date)}</TableCell>
                          <TableCell>
                            {s.warranty_end ? (
                              <span className={`text-xs ${warrantyExpired ? "text-destructive" : "text-muted-foreground"}`}>
                                {warrantyExpired && <AlertTriangle className="inline h-3 w-3 mr-0.5" />}
                                {fmtDate(s.warranty_end)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">
                            {s.received_from_ref_type ?? s.issued_to_ref_type ?? "—"}
                          </TableCell>
                          {canWrite && (
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => setTraceDialog({ open: true, type: "serial", id: s.id })}
                                  title="View traceability chain">
                                  <FileSearch className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => setSerialDialog({ open: true, serial: s })}>
                                  <Edit2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => setDeleteTarget({ table: "item_serials", id: s.id, label: s.serial_number })}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                          {!canWrite && (
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-7 w-7"
                                onClick={() => setTraceDialog({ open: true, type: "serial", id: s.id })}>
                                <FileSearch className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}
      {lotDialog.open && (
        <LotDialog
          open
          onClose={() => setLotDialog({ open: false })}
          itemId={itemId}
          tenantId={tenant?.id ?? ""}
          lot={lotDialog.lot}
        />
      )}

      {serialDialog.open && (
        <SerialDialog
          open
          onClose={() => setSerialDialog({ open: false })}
          itemId={itemId}
          tenantId={tenant?.id ?? ""}
          lots={lots}
          serial={serialDialog.serial}
        />
      )}

      {bulkDialog && (
        <BulkSerialDialog
          open
          onClose={() => setBulkDialog(false)}
          itemId={itemId}
          tenantId={tenant?.id ?? ""}
          lots={lots}
        />
      )}

      {traceDialog?.open && (
        <TraceDialog
          open
          onClose={() => setTraceDialog(null)}
          type={traceDialog.type}
          id={traceDialog.id}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.table === "item_lots" ? "Lot" : "Serial"}?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.label}</strong> will be soft-deleted. Historical stock movements referencing this record are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && softDelete.mutate({ table: deleteTarget.table, id: deleteTarget.id })}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
