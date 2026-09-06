/**
 * BOM Editor — full-featured Bill of Materials editor.
 *
 * Features:
 *   - Header: code, product, version, yield, effective dates, revision notes,
 *             approval lifecycle with approve/activate actions
 *   - Lines: component, quantity, UoM, scrap%, unit cost, description
 *   - Immutability: locked when used_in_production = true
 *   - Validation panel: live server-side validate_bom() results
 *   - BOM Explosion preview: recursive multi-level component tree
 *   - Circular / duplicate / inactive-item warnings
 *   - Clone BOM to new version
 */

import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { useFkOptions } from "@/hooks/use-module-data";
import { toast } from "sonner";
import { buildUomEngine, roundQty, type UomMaster, type UomConversionRow } from "@/lib/uom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Copy,
  Info,
  Layers,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BomLine {
  id?: string;
  line_no: number;
  item_id: string;
  quantity: number;
  uom: string;
  scrap_pct: number;
  unit_cost: number;
  line_total: number;
  description: string;
  // derived
  stock_uom?: string;
  uom_factor?: number;
  item_status?: string;
  item_name?: string;
}

type ValidationIssue = { level: "error" | "warning"; message: string };

type ExplosionRow = {
  level: number;
  path: string;
  bom_id: string;
  line_no: number;
  item_id: string;
  item_name: string;
  sku: string | null;
  uom: string | null;
  qty_per: number;
  total_qty: number;
  effective_qty: number;
  scrap_pct: number;
  unit_cost: number;
  line_cost: number;
  is_subassembly: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const APPROVAL_STATUSES = ["Draft", "Pending Approval", "Approved", "Active", "Inactive", "Obsolete"] as const;

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground",
  "Pending Approval": "bg-warning/15 text-warning",
  Approved: "bg-info/15 text-info",
  Active: "bg-success/15 text-success",
  Inactive: "bg-muted text-muted-foreground",
  Obsolete: "bg-destructive/15 text-destructive",
};

const money = (n: number) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const qtyFmt = (n: number) =>
  (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_authenticated/manufacturing/bom/$id")({
  component: BomEditorRoute,
});

function BomEditorRoute() {
  const { id } = Route.useParams();
  return <BomEditor id={id} />;
}

// ─── Main component ───────────────────────────────────────────────────────────

function BomEditor({ id }: { id: string }) {
  const isNew = id === "new";
  const { tenant, can } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const canWrite = can(["manufacturing.create", "manufacturing.update"]);

  // ── Header state ──────────────────────────────────────────────────────────
  const [header, setHeader] = useState({
    code: "",
    product_id: "",
    version: "v1",
    yield_qty: 1,
    approval_status: "Draft",
    status: "Draft",
    effective_from: "",
    effective_to: "",
    revision_notes: "",
    notes: "",
  });
  const [lines, setLines] = useState<BomLine[]>([]);
  const [tab, setTab] = useState("components");

  // ── Fetch BOM header ──────────────────────────────────────────────────────
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
    if (doc) {
      setHeader({
        code: doc.code ?? "",
        product_id: doc.product_id ?? "",
        version: doc.version ?? "v1",
        yield_qty: doc.yield_qty ?? 1,
        approval_status: doc.approval_status ?? "Draft",
        status: doc.status ?? "Draft",
        effective_from: doc.effective_from ?? "",
        effective_to: doc.effective_to ?? "",
        revision_notes: doc.revision_notes ?? "",
        notes: doc.notes ?? "",
      });
    }
  }, [doc]);

  useEffect(() => {
    if (existingLines) {
      setLines(
        existingLines.map((l: any) => ({
          id: l.id,
          line_no: l.line_no,
          item_id: l.item_id ?? "",
          quantity: Number(l.quantity) || 0,
          uom: l.uom ?? "",
          scrap_pct: Number(l.scrap_pct) || 0,
          unit_cost: Number(l.unit_cost) || 0,
          line_total: Number(l.line_total) || 0,
          description: l.description ?? "",
          uom_factor: l.uom_factor ? Number(l.uom_factor) : undefined,
        })),
      );
    }
  }, [existingLines]);

  // ── FK data ───────────────────────────────────────────────────────────────
  const { data: items = [] } = useFkOptions("items", "name");

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

  // ── Derived state ─────────────────────────────────────────────────────────
  const isLocked = !isNew && doc?.used_in_production === true;
  const isEditable = canWrite && !isLocked;

  const productItem = (items as any[]).find((it: any) => it.id === header.product_id);
  const totalCost = lines.reduce((s, l) => s + (l.line_total || 0), 0);

  // client-side duplicate check
  const duplicateItemIds = useMemo(() => {
    const counts: Record<string, number> = {};
    lines.forEach((l) => {
      if (l.item_id) counts[l.item_id] = (counts[l.item_id] ?? 0) + 1;
    });
    return new Set(
      Object.entries(counts)
        .filter(([, n]) => n > 1)
        .map(([id]) => id),
    );
  }, [lines]);

  // ── Line mutations ────────────────────────────────────────────────────────
  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        line_no: prev.length + 1,
        item_id: "",
        quantity: 1,
        uom: "",
        scrap_pct: 0,
        unit_cost: 0,
        line_total: 0,
        description: "",
      },
    ]);
  };

  const updateLine = (idx: number, field: keyof BomLine, value: any) => {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const updated = { ...l, [field]: value };

        if (field === "item_id") {
          const item = (items as any[]).find((it: any) => it.id === value);
          if (item) {
            updated.unit_cost = Number(item.cost) || 0;
            updated.stock_uom = item.uom ?? "pc";
            updated.item_status = item.status;
            updated.item_name = item.name;
            if (!updated.uom) updated.uom = updated.stock_uom ?? "";
          }
        }

        if ((field === "uom" || field === "item_id") && updated.uom && updated.stock_uom) {
          const result = uomEngine.convert(1, updated.uom, updated.stock_uom);
          updated.uom_factor = result?.factor ?? 1;
        }

        const effectiveQty = Number(updated.quantity) * (1 + Number(updated.scrap_pct || 0) / 100);
        updated.line_total = Math.round(effectiveQty * Number(updated.unit_cost) * 100) / 100;
        return updated;
      }),
    );
  };

  const removeLine = async (idx: number) => {
    const line = lines[idx];
    if (line.id) {
      const { error } = await db.from("bom_lines").update({ deleted_at: new Date().toISOString() }).eq("id", line.id);
      if (error) {
        toast.error("Failed to remove line");
        return;
      }
      qc.invalidateQueries({ queryKey: ["bom_lines", id] });
    }
    setLines((prev) => prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, line_no: i + 1 })));
  };

  // ── Server-side validation ────────────────────────────────────────────────
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [validating, setValidating] = useState(false);

  const runValidation = useCallback(async () => {
    if (isNew) return;
    setValidating(true);
    try {
      const { data, error } = await (db as any).rpc("validate_bom", { _bom_id: id });
      if (error) throw error;
      setValidationIssues((data as ValidationIssue[]) ?? []);
    } catch {
      // ignore — validation is advisory
    } finally {
      setValidating(false);
    }
  }, [id, isNew]);

  useEffect(() => {
    runValidation();
  }, [runValidation]);

  const hasErrors = validationIssues.some((i) => i.level === "error");
  const hasWarnings = validationIssues.some((i) => i.level === "warning");

  // ── BOM explosion ─────────────────────────────────────────────────────────
  const [explosionQty, setExplosionQty] = useState(1);

  const {
    data: explosionRows = [],
    isLoading: exploding,
    refetch: refetchExplosion,
  } = useQuery({
    queryKey: ["explode_bom", id, explosionQty],
    enabled: !isNew && tab === "explosion",
    queryFn: async () => {
      const { data, error } = await (db as any).rpc("explode_bom", {
        _bom_id: id,
        _qty: explosionQty,
      });
      if (error) throw error;
      return (data ?? []) as ExplosionRow[];
    },
  });

  const explosionTotalCost = explosionRows
    .filter((r) => !r.is_subassembly)
    .reduce((s, r) => s + Number(r.line_cost), 0);

  // ── Save mutation ─────────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("No tenant");
      if (!header.code.trim()) throw new Error("BOM code is required");
      if (!header.product_id) throw new Error("Product is required");
      if (header.yield_qty <= 0) throw new Error("Yield quantity must be > 0");
      if (header.effective_from && header.effective_to && header.effective_from > header.effective_to)
        throw new Error("Effective From must be before Effective To");

      let bomId = id;
      const payload = {
        code: header.code.trim(),
        product_id: header.product_id,
        version: header.version || null,
        yield_qty: Number(header.yield_qty) || 1,
        approval_status: header.approval_status,
        status: header.approval_status, // keep status in sync
        effective_from: header.effective_from || null,
        effective_to: header.effective_to || null,
        revision_notes: header.revision_notes || null,
        notes: header.notes || null,
      };

      if (isNew) {
        const { data, error } = await db
          .from("bom_headers")
          .insert({ ...payload, tenant_id: tenant.id })
          .select()
          .single();
        if (error) throw error;
        bomId = (data as any).id;
      } else {
        if (isLocked) {
          // Only allow non-structural header fields when locked
          const { error } = await db
            .from("bom_headers")
            .update({
              notes: payload.notes,
              revision_notes: payload.revision_notes,
              effective_to: payload.effective_to,
            })
            .eq("id", id);
          if (error) throw error;
        } else {
          const { error } = await db.from("bom_headers").update(payload).eq("id", id);
          if (error) throw error;
        }
      }

      if (!isLocked) {
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
            scrap_pct: Number(line.scrap_pct) || 0,
            unit_cost: Number(line.unit_cost),
            line_total: Number(line.line_total),
            description: line.description || null,
          };
          if (line.id) {
            const { error } = await db.from("bom_lines").update(linePayload).eq("id", line.id);
            if (error) throw error;
          } else {
            const { error } = await db.from("bom_lines").insert(linePayload);
            if (error) throw error;
          }
        }
      }
      return bomId;
    },
    onSuccess: (bomId) => {
      toast.success(isNew ? "BOM created" : "BOM saved");
      qc.invalidateQueries({ queryKey: ["bom_headers"] });
      qc.invalidateQueries({ queryKey: ["bom_lines"] });
      if (isNew) nav({ to: "/manufacturing/bom/$id", params: { id: bomId as string } });
      else runValidation();
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  // ── Approval actions ──────────────────────────────────────────────────────
  const [approvingAction, setApprovingAction] = useState<"approve" | "activate" | null>(null);

  const runApprovalAction = async (action: "approve" | "activate") => {
    try {
      const { error } = await (db as any).rpc(action === "approve" ? "approve_bom" : "activate_bom", { _bom_id: id });
      if (error) throw error;
      toast.success(action === "approve" ? "BOM approved." : "BOM activated.");
      qc.invalidateQueries({ queryKey: ["bom_headers", id] });
    } catch (e: any) {
      toast.error(e.message ?? "Action failed");
    } finally {
      setApprovingAction(null);
    }
  };

  // ── Clone BOM ─────────────────────────────────────────────────────────────
  const [showCloneConfirm, setShowCloneConfirm] = useState(false);

  const cloneBom = useMutation({
    mutationFn: async () => {
      if (!tenant?.id || !doc) throw new Error("No BOM to clone");
      // Parse version and increment numeric suffix
      const vParts = (doc.version ?? "v1").match(/^(.*?)(\d+)$/);
      const newVersion = vParts ? `${vParts[1]}${parseInt(vParts[2], 10) + 1}` : `${doc.version ?? "v1"}.1`;

      const { data: newBom, error: hErr } = await db
        .from("bom_headers")
        .insert({
          tenant_id: tenant.id,
          code: doc.code + "-" + newVersion.replace(/\s+/g, ""),
          product_id: doc.product_id,
          version: newVersion,
          yield_qty: doc.yield_qty,
          status: "Draft",
          approval_status: "Draft",
          notes: doc.notes,
          revision_notes: `Cloned from ${doc.code} (${doc.version ?? "v1"})`,
        })
        .select()
        .single();
      if (hErr) throw hErr;

      const { data: srcLines, error: lErr } = await db
        .from("bom_lines")
        .select("*")
        .eq("bom_id", doc.id)
        .is("deleted_at", null);
      if (lErr) throw lErr;

      if ((srcLines ?? []).length > 0) {
        const clonedLines = (srcLines as any[]).map((l) => ({
          tenant_id: tenant.id,
          bom_id: (newBom as any).id,
          line_no: l.line_no,
          item_id: l.item_id,
          quantity: l.quantity,
          uom: l.uom,
          uom_factor: l.uom_factor,
          scrap_pct: l.scrap_pct ?? 0,
          unit_cost: l.unit_cost,
          line_total: l.line_total,
          description: l.description,
        }));
        const { error: clErr } = await db.from("bom_lines").insert(clonedLines);
        if (clErr) throw clErr;
      }
      return (newBom as any).id as string;
    },
    onSuccess: (newId) => {
      toast.success("BOM cloned to new version.");
      qc.invalidateQueries({ queryKey: ["bom_headers"] });
      nav({ to: "/manufacturing/bom/$id", params: { id: newId } });
    },
    onError: (e: any) => toast.error(e.message ?? "Clone failed"),
  });

  // ── Loading ───────────────────────────────────────────────────────────────
  if (!isNew && isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 max-w-6xl">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/manufacturing/bom">
              <ArrowLeft className="h-4 w-4 mr-1" /> BOMs
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">{isNew ? "New BOM" : `BOM · ${header.code}`}</h1>
          {!isNew && (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[header.approval_status] ?? STATUS_COLORS.Draft}`}
            >
              {header.approval_status}
            </span>
          )}
          {isLocked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 text-warning px-2.5 py-0.5 text-xs font-medium">
              <Lock className="h-3 w-3" /> Used in production
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Validation badge */}
          {!isNew && (
            <button
              type="button"
              onClick={() => {
                setTab("validation");
                runValidation();
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium border transition-colors ${
                hasErrors
                  ? "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20"
                  : hasWarnings
                    ? "bg-warning/10 text-warning border-warning/30 hover:bg-warning/20"
                    : "bg-success/10 text-success border-success/30 hover:bg-success/20"
              }`}
            >
              {hasErrors ? (
                <AlertTriangle className="h-3 w-3" />
              ) : hasWarnings ? (
                <AlertTriangle className="h-3 w-3" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              {hasErrors
                ? `${validationIssues.filter((i) => i.level === "error").length} error${validationIssues.filter((i) => i.level === "error").length !== 1 ? "s" : ""}`
                : hasWarnings
                  ? "Warnings"
                  : "Valid"}
            </button>
          )}

          {/* Approval actions */}
          {!isNew && canWrite && header.approval_status === "Draft" && (
            <Button variant="outline" size="sm" onClick={() => setApprovingAction("approve")} disabled={hasErrors}>
              <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Submit for Approval
            </Button>
          )}
          {!isNew && canWrite && header.approval_status === "Approved" && (
            <Button variant="outline" size="sm" onClick={() => setApprovingAction("activate")}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-success" /> Activate
            </Button>
          )}
          {!isNew && canWrite && (
            <Button variant="outline" size="sm" onClick={() => setShowCloneConfirm(true)}>
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Clone Version
            </Button>
          )}
          {canWrite && (
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
          )}
        </div>
      </div>

      {/* ── Locked banner ──────────────────────────────────────────────────── */}
      {isLocked && (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm text-warning">
          <Lock className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <span className="font-medium">Structural edits are locked.</span> This BOM has been used in a completed
            production order. Component quantities, UoMs, and scrap rates cannot be changed. To modify the recipe, use{" "}
            <strong>Clone Version</strong> to create a new draft.
          </div>
        </div>
      )}

      {/* ── Header fields ──────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="space-y-1">
              <Label>
                BOM Code <span className="text-destructive">*</span>
              </Label>
              <Input
                value={header.code}
                onChange={(e) => setHeader((h) => ({ ...h, code: e.target.value }))}
                disabled={!isEditable}
                placeholder="BOM-001"
                className="font-mono"
              />
            </div>
            <div className="space-y-1 lg:col-span-2">
              <Label>
                Product <span className="text-destructive">*</span>
              </Label>
              <Select
                value={header.product_id || undefined}
                onValueChange={(v) => setHeader((h) => ({ ...h, product_id: v }))}
                disabled={!isEditable}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select finished good…" />
                </SelectTrigger>
                <SelectContent>
                  {(items as any[]).map((it: any) => (
                    <SelectItem key={it.id} value={it.id}>
                      {it.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Version</Label>
              <Input
                value={header.version}
                onChange={(e) => setHeader((h) => ({ ...h, version: e.target.value }))}
                disabled={!isEditable}
                placeholder="v1"
                className="font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label>
                Yield Qty <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                step="any"
                min="0.001"
                value={header.yield_qty}
                onChange={(e) => setHeader((h) => ({ ...h, yield_qty: Number(e.target.value) }))}
                disabled={!isEditable}
                className="text-right font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label>Approval Status</Label>
              <Select
                value={header.approval_status}
                onValueChange={(v) => setHeader((h) => ({ ...h, approval_status: v }))}
                disabled={!isEditable}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPROVAL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label>Effective From</Label>
              <Input
                type="date"
                value={header.effective_from}
                onChange={(e) => setHeader((h) => ({ ...h, effective_from: e.target.value }))}
                disabled={!isEditable}
              />
            </div>
            <div className="space-y-1">
              <Label>Effective To</Label>
              <Input
                type="date"
                value={header.effective_to}
                onChange={(e) => setHeader((h) => ({ ...h, effective_to: e.target.value }))}
                disabled={!canWrite} // can always update effective_to
              />
            </div>
            <div className="space-y-1 lg:col-span-2">
              <Label>Revision Notes</Label>
              <Input
                value={header.revision_notes}
                onChange={(e) => setHeader((h) => ({ ...h, revision_notes: e.target.value }))}
                disabled={!canWrite}
                placeholder="What changed in this version…"
              />
            </div>
          </div>

          {/* KPI bar */}
          {!isNew && (
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Layers className="h-3.5 w-3.5" />
                <span className="font-medium text-foreground">{lines.length}</span> component
                {lines.length !== 1 ? "s" : ""}
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                Estimated material cost:
                <span className="font-mono font-semibold text-foreground">${money(totalCost)}</span>
                <span className="text-xs">
                  per {header.yield_qty} {productItem?.uom ?? "unit"}
                </span>
              </div>
              {doc?.approved_at && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-success" />
                  Approved {new Date(doc.approved_at).toLocaleDateString()}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-transparent border-b rounded-none h-auto p-0 justify-start gap-0 w-full">
          {[
            { value: "components", label: "Components" },
            { value: "explosion", label: "BOM Explosion" },
            { value: "validation", label: hasErrors ? "⚠ Validation" : hasWarnings ? "⚠ Validation" : "Validation" },
            { value: "notes", label: "Notes" },
          ].map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2.5 text-sm"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Components tab ──────────────────────────────────────────────── */}
        <TabsContent value="components" className="mt-4">
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-2.5 bg-muted/30">
              <h2 className="text-sm font-semibold">
                Components
                <span className="ml-2 text-muted-foreground font-normal text-xs">
                  ({lines.filter((l) => l.item_id).length} item{lines.filter((l) => l.item_id).length !== 1 ? "s" : ""}{" "}
                  · est. ${money(totalCost)})
                </span>
              </h2>
              {isEditable && (
                <Button size="sm" variant="outline" onClick={addLine} className="gap-1">
                  <Plus className="h-3.5 w-3.5" /> Add Component
                </Button>
              )}
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20">
                    <TableHead className="w-10 text-xs">#</TableHead>
                    <TableHead className="text-xs min-w-[200px]">Component</TableHead>
                    <TableHead className="text-right text-xs w-24">Qty</TableHead>
                    <TableHead className="text-xs w-24">UoM</TableHead>
                    <TableHead className="text-right text-xs w-20">Scrap %</TableHead>
                    <TableHead className="text-right text-xs w-28">Stock Qty</TableHead>
                    <TableHead className="text-right text-xs w-28">Unit Cost</TableHead>
                    <TableHead className="text-right text-xs w-28">Line Total</TableHead>
                    <TableHead className="text-xs min-w-[120px]">Description</TableHead>
                    {isEditable && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={isEditable ? 10 : 9}
                        className="text-center text-sm text-muted-foreground py-10"
                      >
                        {isLocked
                          ? "No components. Clone this BOM to add components."
                          : 'No components yet. Click "Add Component" to define the recipe.'}
                      </TableCell>
                    </TableRow>
                  )}
                  {lines.map((line, idx) => {
                    const itemMeta = (items as any[]).find((it: any) => it.id === line.item_id) as any;
                    const stockUom = line.stock_uom ?? itemMeta?.uom ?? "pc";
                    const lineUom = line.uom || stockUom;
                    const isDiffUom = lineUom && stockUom && lineUom !== stockUom;
                    const uomErr = isDiffUom
                      ? uomEngine.hasPath(lineUom, stockUom, line.item_id || null)
                        ? null
                        : "No conversion path"
                      : null;

                    let stockQtyDisplay: string | null = null;
                    if (isDiffUom && line.quantity > 0 && !uomErr) {
                      const res = uomEngine.convert(line.quantity, lineUom, stockUom, line.item_id || null);
                      if (res) stockQtyDisplay = `${roundQty(res.qty)} ${stockUom}`;
                    }

                    const isDuplicate = line.item_id && duplicateItemIds.has(line.item_id);
                    const isInactive = itemMeta?.status && !["Active"].includes(itemMeta.status);

                    return (
                      <TableRow key={idx} className={isDuplicate ? "bg-warning/5" : ""}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{line.line_no}</TableCell>

                        {/* Component selector */}
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Select
                              value={line.item_id || undefined}
                              onValueChange={(v) => updateLine(idx, "item_id", v)}
                              disabled={!isEditable}
                            >
                              <SelectTrigger className={`h-8 ${isInactive || isDuplicate ? "border-warning" : ""}`}>
                                <SelectValue placeholder="Select item…" />
                              </SelectTrigger>
                              <SelectContent>
                                {(items as any[]).map((it: any) => (
                                  <SelectItem key={it.id} value={it.id}>
                                    {it.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {isInactive && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    Item is {itemMeta?.status}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {isDuplicate && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    Duplicate component — consider consolidating
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </TableCell>

                        {/* Qty */}
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            className="h-8 text-right w-20"
                            value={line.quantity}
                            onChange={(e) => updateLine(idx, "quantity", Number(e.target.value))}
                            disabled={!isEditable}
                          />
                        </TableCell>

                        {/* UoM */}
                        <TableCell>
                          <Select
                            value={lineUom}
                            onValueChange={(v) => updateLine(idx, "uom", v)}
                            disabled={!isEditable}
                          >
                            <SelectTrigger className={`h-8 text-xs ${uomErr ? "border-destructive" : ""}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {uomOptions.map((u) => (
                                <SelectItem key={u} value={u}>
                                  {u}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {uomErr && <p className="text-[10px] text-destructive mt-0.5">{uomErr}</p>}
                        </TableCell>

                        {/* Scrap % */}
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="99"
                            className="h-8 text-right w-16 font-mono"
                            value={line.scrap_pct}
                            onChange={(e) => updateLine(idx, "scrap_pct", Number(e.target.value))}
                            disabled={!isEditable}
                          />
                        </TableCell>

                        {/* Stock qty (converted) */}
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {stockQtyDisplay ?? <span>{line.quantity > 0 ? `${line.quantity} ${stockUom}` : "—"}</span>}
                          {line.scrap_pct > 0 && (
                            <div className="text-[10px] text-warning">
                              +{((line.quantity * line.scrap_pct) / 100).toFixed(3)} scrap
                            </div>
                          )}
                        </TableCell>

                        {/* Unit cost */}
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            className="h-8 text-right w-24 font-mono"
                            value={line.unit_cost}
                            onChange={(e) => updateLine(idx, "unit_cost", Number(e.target.value))}
                            disabled={!isEditable}
                          />
                        </TableCell>

                        {/* Line total */}
                        <TableCell className="text-right font-mono tabular-nums text-sm">
                          ${money(line.line_total)}
                        </TableCell>

                        {/* Description */}
                        <TableCell>
                          <Input
                            className="h-8 text-xs"
                            value={line.description}
                            onChange={(e) => updateLine(idx, "description", e.target.value)}
                            disabled={!canWrite}
                            placeholder="Optional note…"
                          />
                        </TableCell>

                        {isEditable && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => removeLine(idx)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}

                  {/* Total row */}
                  {lines.length > 0 && (
                    <TableRow className="bg-muted/20 font-semibold">
                      <TableCell colSpan={isEditable ? 7 : 6} className="text-right text-xs">
                        Total material cost per {header.yield_qty} {productItem?.uom ?? "unit"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">${money(totalCost)}</TableCell>
                      <TableCell colSpan={isEditable ? 2 : 1} />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ── BOM Explosion tab ─────────────────────────────────────────── */}
        <TabsContent value="explosion" className="mt-4">
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center gap-3 border-b px-4 py-2.5 bg-muted/30 flex-wrap">
              <h2 className="text-sm font-semibold">Multi-Level BOM Explosion</h2>
              <div className="flex items-center gap-2 ml-auto">
                <Label className="text-xs text-muted-foreground shrink-0">Production qty:</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={explosionQty}
                  onChange={(e) => setExplosionQty(Math.max(1, Number(e.target.value)))}
                  className="h-7 w-20 text-right font-mono text-sm"
                />
                <Button variant="outline" size="sm" className="h-7 gap-1" onClick={() => refetchExplosion()}>
                  <RefreshCw className={`h-3 w-3 ${exploding ? "animate-spin" : ""}`} />
                  Recalculate
                </Button>
              </div>
            </div>

            {exploding ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : explosionRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                <Layers className="h-7 w-7 opacity-30" />
                <p className="text-sm">
                  No explosion data yet. Save the BOM first, then switch to Active/Approved status for sub-assembly
                  expansion.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20">
                      <TableHead className="text-xs w-8">Lvl</TableHead>
                      <TableHead className="text-xs">Component</TableHead>
                      <TableHead className="text-xs">SKU</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-right text-xs">Qty / Yield</TableHead>
                      <TableHead className="text-right text-xs">Total Qty</TableHead>
                      <TableHead className="text-right text-xs">Eff. Qty (w/ scrap)</TableHead>
                      <TableHead className="text-xs w-16">UoM</TableHead>
                      <TableHead className="text-right text-xs">Unit Cost</TableHead>
                      <TableHead className="text-right text-xs">Line Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {explosionRows.map((r, i) => (
                      <TableRow key={i} className={r.is_subassembly ? "bg-muted/10 font-medium" : ""}>
                        <TableCell>
                          <div className="flex items-center gap-0.5">
                            {Array.from({ length: r.level - 1 }).map((_, d) => (
                              <span key={d} className="inline-block w-3 border-l border-muted-foreground/30 h-4" />
                            ))}
                            {r.level > 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                            <span className="font-mono text-xs text-muted-foreground">{r.level}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.is_subassembly ? (
                            <span className="font-semibold text-foreground">{r.item_name}</span>
                          ) : (
                            r.item_name
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{r.sku ?? "—"}</TableCell>
                        <TableCell>
                          {r.is_subassembly ? (
                            <span className="inline-flex items-center rounded-full bg-info/15 text-info px-2 py-0.5 text-xs font-medium">
                              Sub-assembly
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs">
                              Component
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-xs">{qtyFmt(r.qty_per)}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-sm">
                          {qtyFmt(r.total_qty)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-sm font-semibold">
                          {qtyFmt(r.effective_qty)}
                          {r.scrap_pct > 0 && (
                            <span className="ml-1 text-xs text-warning font-normal">+{r.scrap_pct}%</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.uom ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-xs text-muted-foreground">
                          ${money(r.unit_cost)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono tabular-nums text-sm ${r.is_subassembly ? "text-muted-foreground" : "font-semibold"}`}
                        >
                          {r.is_subassembly ? "—" : `$${money(r.line_cost)}`}
                        </TableCell>
                      </TableRow>
                    ))}

                    {/* Total leaf cost */}
                    <TableRow className="bg-muted/30 font-bold">
                      <TableCell colSpan={9} className="text-right text-sm">
                        Total material cost for {explosionQty} {productItem?.uom ?? "unit"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-sm">
                        ${money(explosionTotalCost)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── Validation tab ────────────────────────────────────────────── */}
        <TabsContent value="validation" className="mt-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> BOM Validation
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={runValidation}
                  disabled={isNew || validating}
                  className="gap-1"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${validating ? "animate-spin" : ""}`} />
                  Re-check
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {isNew ? (
                <p className="text-sm text-muted-foreground">Save the BOM first to run validation.</p>
              ) : validationIssues.length === 0 ? (
                <div className="flex items-center gap-2 text-success py-3">
                  <CheckCircle2 className="h-5 w-5" />
                  <p className="text-sm font-medium">All validations passed. BOM is ready for approval.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {validationIssues.map((issue, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${
                        issue.level === "error"
                          ? "bg-destructive/5 text-destructive border border-destructive/20"
                          : "bg-warning/5 text-warning border border-warning/20"
                      }`}
                    >
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{issue.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Notes tab ────────────────────────────────────────────────── */}
        <TabsContent value="notes" className="mt-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="space-y-4 max-w-2xl">
                <div className="space-y-1">
                  <Label>Revision Notes</Label>
                  <p className="text-xs text-muted-foreground">
                    What changed in this version compared to the previous one.
                  </p>
                  <Textarea
                    value={header.revision_notes}
                    onChange={(e) => setHeader((h) => ({ ...h, revision_notes: e.target.value }))}
                    disabled={!canWrite}
                    rows={4}
                    placeholder="e.g. Substituted component X with Y due to supply shortage…"
                  />
                </div>
                <Separator />
                <div className="space-y-1">
                  <Label>Internal Notes</Label>
                  <Textarea
                    value={header.notes}
                    onChange={(e) => setHeader((h) => ({ ...h, notes: e.target.value }))}
                    disabled={!canWrite}
                    rows={3}
                    placeholder="Internal notes, manufacturing considerations…"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Approval confirm dialogs ──────────────────────────────────────── */}
      <AlertDialog open={approvingAction === "approve"} onOpenChange={(o) => !o && setApprovingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve BOM?</AlertDialogTitle>
            <AlertDialogDescription>
              This marks <strong>{header.code}</strong> as Approved. The BOM can then be activated to replace the
              current active version for this product.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => runApprovalAction("approve")}>Approve</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={approvingAction === "activate"} onOpenChange={(o) => !o && setApprovingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate BOM?</AlertDialogTitle>
            <AlertDialogDescription>
              This will make{" "}
              <strong>
                {header.code} ({header.version})
              </strong>{" "}
              the active BOM for this product. Any other Active BOM for the same product will be set to Inactive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => runApprovalAction("activate")}>Activate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCloneConfirm} onOpenChange={setShowCloneConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clone BOM to new version?</AlertDialogTitle>
            <AlertDialogDescription>
              A new BOM Draft will be created with the same product and all components copied. The version number will
              be incremented automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowCloneConfirm(false);
                cloneBom.mutate();
              }}
            >
              Clone
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
