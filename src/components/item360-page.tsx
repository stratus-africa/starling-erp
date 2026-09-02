/**
 * Item 360 Page
 *
 * A comprehensive item detail view with 12 tabs:
 * Overview · Inventory · Warehouses · Movements · Sales · Purchasing ·
 * Suppliers · BOMs · Manufacturing · Pricing · Accounting · Activity
 *
 * Used by both /inventory/items/:id and /manufacturing/items/:id.
 * Replaces the older ProductionItemPage for the inventory module
 * while ProductionItemPage is preserved for backward compatibility.
 */

import { useState, useMemo } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { useFkOptions } from "@/hooks/use-module-data";
import { toast } from "sonner";
import { buildUomEngine, UOM_CLASS_COLORS, type UomMaster, type UomConversionRow } from "@/lib/uom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import {
  ArrowLeft,
  Save,
  Loader2,
  ImagePlus,
  Package,
  Warehouse,
  ArrowLeftRight,
  ShoppingCart,
  ShoppingBag,
  Users,
  ListTree,
  Factory,
  DollarSign,
  BookOpen,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Info,
  TrendingUp,
  TrendingDown,
  FileText,
  ReceiptText,
  RefreshCw,
  Plus,
  Trash2,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

// Kept as static fallback when the DB master list hasn't loaded yet
const FALLBACK_UOM_OPTIONS = [
  "pc",
  "pcs",
  "kg",
  "g",
  "lb",
  "oz",
  "m",
  "cm",
  "mm",
  "ft",
  "in",
  "l",
  "ml",
  "gal",
  "box",
  "pack",
  "ctn",
  "doz",
  "pair",
  "roll",
  "sheet",
  "bag",
  "can",
  "bottle",
];

const ITEM_TYPES = ["Finished Good", "Raw Material", "Sub-assembly", "Service", "Consumable"];

const TRACKING_METHODS = ["AVCO", "FIFO", "None"];

const REF_LABELS: Record<string, string> = {
  bill: "Purchase In",
  invoice: "Sale Out",
  package: "Package Out",
  shipment: "Shipment Out",
  adjustment: "Adjustment",
  transfer_out: "Transfer Out",
  transfer_in: "Transfer In",
  production_consume: "Production Consume",
  production_receive: "Production Receive",
  credit_note: "Credit Return",
  opening_balance: "Opening Balance",
  reversal: "Reversal",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (v: any) =>
  !v
    ? "—"
    : new Date(v).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

const fmtDateTime = (v: any) =>
  !v
    ? "—"
    : new Date(v).toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });

const money = (v: any) =>
  v == null
    ? "—"
    : Number(v).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const qty = (v: any) =>
  v == null
    ? "0.00"
    : Number(v).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldRow({
  label,
  children,
  required,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="grid grid-cols-[180px_1fr] items-start gap-x-4 gap-y-1 py-1.5">
      <Label className="text-sm text-muted-foreground pt-1.5 flex items-center gap-1">
        {label}
        {required && <span className="text-destructive">*</span>}
        {hint && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-60 text-xs">
                {hint}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </Label>
      <div>{children}</div>
    </div>
  );
}

function ReadValue({ value }: { value: any }) {
  return <span className="text-sm">{value == null || value === "" ? "—" : String(value)}</span>;
}

function StockBadge({ value, warn, uom }: { value: number; warn?: boolean; uom?: string }) {
  return (
    <span className={`font-mono tabular-nums text-sm ${warn ? "text-destructive font-semibold" : ""}`}>
      {qty(value)} {uom ?? ""}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 mt-5 first:mt-0">
      {children}
    </h3>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Item360PageProps {
  id: string;
  /** Path to navigate back to (defaults to /inventory/items) */
  backTo?: string;
  backLabel?: string;
}

export function Item360Page({ id, backTo = "/inventory/items", backLabel = "Items" }: Item360PageProps) {
  const isNew = id === "new";
  const { tenant, can, hasRole } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

  const canWrite =
    can(["inventory.create", "inventory.update"]) ||
    can(["manufacturing.create", "manufacturing.update"]) ||
    hasRole(["tenant_admin", "super_admin"]);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: item, isLoading } = useQuery({
    queryKey: ["items", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await db.from("items").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["stock_movements", "item", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await db
        .from("stock_movements")
        .select("*, warehouses(name, code), warehouse_locations(code, name, aisle, rack, level, bin)")
        .eq("item_id", id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: bomHeaders = [] } = useQuery({
    queryKey: ["bom_headers", "for-item", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data } = await db
        .from("bom_headers")
        .select("id, code, version, status, yield_qty")
        .eq("product_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const { data: bomLines = [] } = useQuery({
    queryKey: ["bom_lines", "for-item", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data: headers } = await db
        .from("bom_headers")
        .select("id")
        .eq("product_id", id)
        .is("deleted_at", null)
        .limit(10);
      if (!headers?.length) return [];
      const bomIds = headers.map((h: any) => h.id);
      const { data, error } = await db
        .from("bom_lines")
        .select("*, items(id, name, sku, uom, stock, cost)")
        .in("bom_id", bomIds)
        .is("deleted_at", null)
        .order("line_no");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: productionOrders = [] } = useQuery({
    queryKey: ["production_orders", "for-item", id],
    enabled: !isNew,
    queryFn: async () => {
      if (!bomHeaders.length) return [];
      const bomIds = bomHeaders.map((b: any) => b.id);
      const { data } = await db
        .from("production_orders")
        .select("id, number, date, quantity, status, posted_at")
        .in("bom_id", bomIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as any[];
    },
    enabled: !isNew && bomHeaders.length > 0,
  });

  const { data: salesOrderLines = [] } = useQuery({
    queryKey: ["sales_order_lines", "for-item", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data } = await db
        .from("sales_order_lines")
        .select(
          "id, quantity, unit_price, line_total, sales_orders!document_id(number, date, status, customer_id, customers(name))",
        )
        .eq("item_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? []) as any[];
    },
  });

  const { data: invoiceLines = [] } = useQuery({
    queryKey: ["invoice_lines", "for-item", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data } = await db
        .from("invoice_lines")
        .select(
          "id, quantity, unit_price, line_total, invoices!document_id(number, date, status, customer_id, customers(name))",
        )
        .eq("item_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? []) as any[];
    },
  });

  const { data: billLines = [] } = useQuery({
    queryKey: ["bill_lines", "for-item", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data } = await db
        .from("bill_lines")
        .select(
          "id, quantity, unit_price, line_total, bills!document_id(number, date, status, supplier_id, suppliers(name))",
        )
        .eq("item_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? []) as any[];
    },
  });

  const { data: uomConversions = [] } = useQuery({
    queryKey: ["uom_conversions", "for-item", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data } = await db
        .from("uom_conversions")
        .select("*")
        .eq("item_id", id)
        .is("deleted_at", null)
        .order("from_uom");
      return (data ?? []) as any[];
    },
  });

  // FK options
  const { data: categories = [] } = useFkOptions("item_categories", "name");
  const { data: suppliers = [] } = useFkOptions("suppliers", "name");
  const { data: coaAccounts = [] } = useFkOptions("chart_of_accounts", "name");

  // UOM master + all conversions (global + item-specific for this item)
  const { data: uomMaster = [] } = useQuery({
    queryKey: ["units_of_measure", "master"],
    queryFn: async () => {
      const { data } = await db
        .from("units_of_measure")
        .select("*")
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("uom_class")
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

  // Build client-side engine for instant preview
  const uomEngine = useMemo(() => buildUomEngine(uomMaster, allConversions), [uomMaster, allConversions]);

  // Merged option list: live master codes + fallback
  const uomOptions = uomMaster.length > 0 ? uomMaster.map((u) => u.code) : FALLBACK_UOM_OPTIONS;

  // ── Derived metrics ────────────────────────────────────────────────────────

  const stockOnHand = movements.reduce((sum: number, m: any) => sum + Number(m.quantity ?? 0), 0);

  // Live stock by warehouse + zone + location from canonical view
  const { data: locationStock = [] } = useQuery({
    queryKey: ["inventory_location_stock", "item", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await db.from("inventory_location_stock").select("*").eq("item_id", id).neq("on_hand", 0);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Keep legacy stockByWarehouse for backward-compat (stock snapshot card uses it)
  const stockByWarehouse = movements.reduce(
    (acc: Record<string, { name: string; code: string; qty: number }>, m: any) => {
      const wid = m.warehouse_id ?? "__none";
      if (!acc[wid]) acc[wid] = { name: m.warehouses?.name ?? "No Warehouse", code: m.warehouses?.code ?? "", qty: 0 };
      acc[wid].qty += Number(m.quantity ?? 0);
      return acc;
    },
    {},
  );

  const totalCostValue = stockOnHand * Number(item?.cost ?? 0);

  const pendingShip = salesOrderLines
    .filter((l: any) => ["Confirmed", "Processing", "Packed"].includes(l.sales_orders?.status))
    .reduce((s: number, l: any) => s + Number(l.quantity ?? 0), 0);

  const pendingReceive = productionOrders
    .filter((o: any) => ["Planned", "In Progress"].includes(o.status))
    .reduce((s: number, o: any) => s + Number(o.quantity ?? 0), 0);

  const totalSalesQty = invoiceLines.reduce((s: number, l: any) => s + Number(l.quantity ?? 0), 0);

  const totalSalesValue = invoiceLines.reduce((s: number, l: any) => s + Number(l.line_total ?? 0), 0);

  const totalPurchaseQty = billLines.reduce((s: number, l: any) => s + Number(l.quantity ?? 0), 0);

  const totalPurchaseValue = billLines.reduce((s: number, l: any) => s + Number(l.line_total ?? 0), 0);

  const isLowStock = item?.reorder != null && stockOnHand <= Number(item.reorder);
  const isBelowMin = item?.min_stock != null && stockOnHand < Number(item.min_stock);

  // ── Form state ─────────────────────────────────────────────────────────────

  const emptyForm = {
    name: "",
    sku: "",
    barcode: "",
    type: "Finished Good",
    status: "Active",
    brand: "",
    manufacturer: "",
    model: "",
    category_id: "",
    description: "",
    sales_description: "",
    purchase_description: "",
    // UOM
    uom: "pc",
    purchase_uom: "",
    sales_uom: "",
    manufacturing_uom: "",
    // Pricing
    cost: "",
    standard_cost: "",
    price: "",
    // Stock levels
    reorder: "",
    reorder_qty: "",
    min_stock: "",
    max_stock: "",
    safety_stock: "",
    // Procurement
    preferred_supplier_id: "",
    supplier_lead_time_days: "",
    // Tracking
    track_inventory: true,
    track_batches: false,
    track_serials: false,
    track_expiry: false,
    inventory_tracking: "AVCO",
    // GL overrides
    inventory_account_id: "",
    cogs_account_id: "",
    sales_account_id: "",
    purchase_account_id: "",
  };

  const [values, setValues] = useState<Record<string, any>>(emptyForm);
  const [synced, setSynced] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (item && !synced) {
    setValues({
      name: item.name ?? "",
      sku: item.sku ?? "",
      barcode: item.barcode ?? "",
      type: item.type ?? "Finished Good",
      status: item.status ?? "Active",
      brand: item.brand ?? "",
      manufacturer: item.manufacturer ?? "",
      model: item.model ?? "",
      category_id: item.category_id ?? "",
      description: item.description ?? "",
      sales_description: item.sales_description ?? "",
      purchase_description: item.purchase_description ?? "",
      uom: item.uom ?? "pc",
      purchase_uom: item.purchase_uom ?? "",
      sales_uom: item.sales_uom ?? "",
      manufacturing_uom: item.manufacturing_uom ?? "",
      cost: item.cost ?? "",
      standard_cost: item.standard_cost ?? "",
      price: item.price ?? "",
      reorder: item.reorder ?? "",
      reorder_qty: item.reorder_qty ?? "",
      min_stock: item.min_stock ?? "",
      max_stock: item.max_stock ?? "",
      safety_stock: item.safety_stock ?? "",
      preferred_supplier_id: item.preferred_supplier_id ?? "",
      supplier_lead_time_days: item.supplier_lead_time_days ?? "",
      track_inventory: item.track_inventory ?? true,
      track_batches: item.track_batches ?? false,
      track_serials: item.track_serials ?? false,
      track_expiry: item.track_expiry ?? false,
      inventory_tracking: item.inventory_tracking ?? "AVCO",
      inventory_account_id: item.inventory_account_id ?? "",
      cogs_account_id: item.cogs_account_id ?? "",
      sales_account_id: item.sales_account_id ?? "",
      purchase_account_id: item.purchase_account_id ?? "",
    });
    setSynced(true);
  }

  const set = (k: string, v: any) => {
    setValues((p) => ({ ...p, [k]: v }));
    if (errors[k])
      setErrors((e) => {
        const c = { ...e };
        delete c[k];
        return c;
      });
  };

  // ── Validation ─────────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!values.name?.trim()) errs.name = "Item name is required";
    if (!values.uom) errs.uom = "Stock UoM is required";
    const numFields: [string, string][] = [
      ["cost", "Cost"],
      ["standard_cost", "Standard cost"],
      ["price", "Sell price"],
      ["reorder", "Reorder point"],
      ["reorder_qty", "Reorder qty"],
      ["min_stock", "Min stock"],
      ["max_stock", "Max stock"],
      ["safety_stock", "Safety stock"],
      ["supplier_lead_time_days", "Lead time"],
    ];
    for (const [k, label] of numFields) {
      const v = values[k];
      if (v !== "" && v != null && isNaN(Number(v))) errs[k] = `${label} must be a number`;
      else if (v !== "" && v != null && Number(v) < 0) errs[k] = `${label} cannot be negative`;
    }
    if (
      values.min_stock !== "" &&
      values.max_stock !== "" &&
      values.min_stock != null &&
      values.max_stock != null &&
      Number(values.min_stock) > Number(values.max_stock)
    ) {
      errs.max_stock = "Max stock must be ≥ min stock";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Save mutation ──────────────────────────────────────────────────────────

  const toNumOrNull = (v: any) => (v === "" || v == null ? null : Number(v));
  const toStrOrNull = (v: any) => (v === "" || v == null ? null : String(v).trim() || null);

  const save = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error("Please fix validation errors");
      if (!tenant?.id) throw new Error("No workspace");

      const payload: Record<string, any> = {
        name: values.name.trim(),
        sku: toStrOrNull(values.sku),
        barcode: toStrOrNull(values.barcode),
        type: values.type || "Finished Good",
        status: values.status || "Active",
        brand: toStrOrNull(values.brand),
        manufacturer: toStrOrNull(values.manufacturer),
        model: toStrOrNull(values.model),
        category_id: toStrOrNull(values.category_id),
        description: toStrOrNull(values.description),
        sales_description: toStrOrNull(values.sales_description),
        purchase_description: toStrOrNull(values.purchase_description),
        uom: values.uom || "pc",
        purchase_uom: toStrOrNull(values.purchase_uom),
        sales_uom: toStrOrNull(values.sales_uom),
        manufacturing_uom: toStrOrNull(values.manufacturing_uom),
        cost: toNumOrNull(values.cost),
        standard_cost: toNumOrNull(values.standard_cost),
        price: toNumOrNull(values.price),
        reorder: toNumOrNull(values.reorder),
        reorder_qty: toNumOrNull(values.reorder_qty),
        min_stock: toNumOrNull(values.min_stock),
        max_stock: toNumOrNull(values.max_stock),
        safety_stock: toNumOrNull(values.safety_stock),
        preferred_supplier_id: toStrOrNull(values.preferred_supplier_id),
        supplier_lead_time_days: toNumOrNull(values.supplier_lead_time_days),
        track_inventory: Boolean(values.track_inventory),
        track_batches: Boolean(values.track_batches),
        track_serials: Boolean(values.track_serials),
        track_expiry: Boolean(values.track_expiry),
        inventory_tracking: values.inventory_tracking || "AVCO",
        inventory_account_id: toStrOrNull(values.inventory_account_id),
        cogs_account_id: toStrOrNull(values.cogs_account_id),
        sales_account_id: toStrOrNull(values.sales_account_id),
        purchase_account_id: toStrOrNull(values.purchase_account_id),
      };

      if (isNew) {
        const { data, error } = await db
          .from("items")
          .insert({ ...payload, tenant_id: tenant.id })
          .select("id")
          .single();
        if (error) throw error;
        return data.id as string;
      } else {
        const { error } = await db.from("items").update(payload).eq("id", id);
        if (error) throw error;
        return id;
      }
    },
    onSuccess: (newId) => {
      toast.success(isNew ? "Item created" : "Item saved");
      qc.invalidateQueries({ queryKey: ["items"] });
      if (isNew) nav({ to: (backTo + "/$id") as any, params: { id: newId } as any });
      else {
        setSynced(false); // re-sync from server
        qc.invalidateQueries({ queryKey: ["items", id] });
      }
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  // ── UOM conversion helpers ─────────────────────────────────────────────────

  const [newConv, setNewConv] = useState({ from_uom: "", to_uom: "", factor: "" });

  const addConversion = useMutation({
    mutationFn: async () => {
      if (!newConv.from_uom || !newConv.to_uom || !newConv.factor)
        throw new Error("All conversion fields are required");
      if (Number(newConv.factor) <= 0) throw new Error("Factor must be greater than 0");
      if (newConv.from_uom === newConv.to_uom) throw new Error("From and To UoM must be different");
      // Client-side circular check before hitting the DB
      const cycleErr = uomEngine.checkCircular(newConv.from_uom, newConv.to_uom, id);
      if (cycleErr) throw new Error(cycleErr);
      if (!tenant?.id) throw new Error("No workspace");
      const { error } = await db.from("uom_conversions").insert({
        tenant_id: tenant.id,
        item_id: id,
        from_uom: newConv.from_uom,
        to_uom: newConv.to_uom,
        factor: Number(newConv.factor),
      });
      if (error) throw error;
      setNewConv({ from_uom: "", to_uom: "", factor: "" });
    },
    onSuccess: () => {
      toast.success("Conversion added");
      qc.invalidateQueries({ queryKey: ["uom_conversions", "for-item", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeConversion = useMutation({
    mutationFn: async (convId: string) => {
      const { error } = await db
        .from("uom_conversions")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", convId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["uom_conversions", "for-item", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  if (!isNew && isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Shared form control helpers ────────────────────────────────────────────

  const TextInput = ({
    field,
    placeholder,
    mono: isMono,
    type: inputType = "text",
  }: {
    field: string;
    placeholder?: string;
    mono?: boolean;
    type?: string;
  }) =>
    canWrite ? (
      <div>
        <Input
          type={inputType}
          step={inputType === "number" ? "any" : undefined}
          value={values[field] ?? ""}
          onChange={(e) => set(field, e.target.value)}
          placeholder={placeholder}
          className={`h-8 text-sm ${isMono ? "font-mono" : ""} ${errors[field] ? "border-destructive" : ""}`}
        />
        {errors[field] && <p className="text-xs text-destructive mt-0.5">{errors[field]}</p>}
      </div>
    ) : (
      <ReadValue value={values[field]} />
    );

  const SelectInput = ({ field, options, placeholder }: { field: string; options: string[]; placeholder?: string }) =>
    canWrite ? (
      <Select value={values[field] || ""} onValueChange={(v) => set(field, v)}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder={placeholder ?? "Select…"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : (
      <ReadValue value={values[field]} />
    );

  const FkSelect = ({
    field,
    opts,
    labelKey = "name",
    placeholder,
  }: {
    field: string;
    opts: any[];
    labelKey?: string;
    placeholder?: string;
  }) =>
    canWrite ? (
      <Select value={values[field] || ""} onValueChange={(v) => set(field, v)}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder={placeholder ?? "Select…"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">—</SelectItem>
          {opts.map((o: any) => (
            <SelectItem key={o.id} value={o.id}>
              {o[labelKey]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : (
      <ReadValue value={opts.find((o: any) => o.id === values[field])?.[labelKey]} />
    );

  const SwitchInput = ({ field, label, description }: { field: string; label: string; description?: string }) => (
    <div className="flex items-start gap-3 py-1.5">
      <Switch
        id={`switch-${field}`}
        checked={Boolean(values[field])}
        onCheckedChange={(v) => set(field, v)}
        disabled={!canWrite}
        className="mt-0.5"
      />
      <div>
        <Label htmlFor={`switch-${field}`} className="text-sm font-medium cursor-pointer">
          {label}
        </Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    </div>
  );

  const categoryName = (categories as any[]).find((c: any) => c.id === values.category_id)?.name;
  const supplierName = (suppliers as any[]).find((s: any) => s.id === values.preferred_supplier_id)?.name;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* ── Header bar ── */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b bg-background px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" asChild>
            <Link to={backTo as any}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              {backLabel}
            </Link>
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold leading-tight">
              {isNew ? "New Item" : (item?.name ?? "Item")}
            </h1>
            {!isNew && item?.sku && (
              <p className="text-xs text-muted-foreground font-mono leading-tight">
                {item.sku}
                {item.barcode ? ` · ${item.barcode}` : ""}
              </p>
            )}
          </div>
          {!isNew && item?.type && (
            <Badge variant="secondary" className="shrink-0">
              {item.type}
            </Badge>
          )}
          {!isNew && (
            <Badge
              className={`shrink-0 ${
                item?.status === "Active"
                  ? "bg-success/15 text-success border-0"
                  : "bg-muted text-muted-foreground border-0"
              }`}
            >
              {item?.status ?? "Active"}
            </Badge>
          )}
          {isLowStock && !isNew && (
            <Badge variant="destructive" className="shrink-0 gap-1">
              <AlertTriangle className="h-3 w-3" /> Low Stock
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canWrite && (
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              {isNew ? "Create Item" : "Save Changes"}
            </Button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="min-h-0 flex-1 overflow-auto">
        <Tabs defaultValue="overview" className="h-full flex flex-col">
          {/* Tab bar */}
          <div className="shrink-0 border-b px-6 bg-background">
            <TabsList className="h-10 bg-transparent p-0 gap-0 flex-wrap">
              {[
                { value: "overview", label: "Overview", icon: Info },
                { value: "inventory", label: "Inventory", icon: Package },
                { value: "warehouses", label: "Warehouses", icon: Warehouse },
                { value: "movements", label: "Movements", icon: ArrowLeftRight },
                { value: "sales", label: "Sales", icon: ShoppingCart },
                { value: "purchasing", label: "Purchasing", icon: ShoppingBag },
                { value: "suppliers", label: "Suppliers", icon: Users },
                { value: "boms", label: "BOMs", icon: ListTree },
                { value: "manufacturing", label: "Manufacturing", icon: Factory },
                { value: "pricing", label: "Pricing", icon: DollarSign },
                { value: "accounting", label: "Accounting", icon: BookOpen },
                { value: "activity", label: "Activity", icon: Activity },
              ].map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs px-3 h-10"
                >
                  <Icon className="h-3.5 w-3.5 mr-1.5" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* ════════════════════════════════════════════════════════════════
              TAB 1: OVERVIEW
          ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="overview" className="mt-0 flex-1 overflow-auto">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] min-h-full">
              {/* Left: form fields */}
              <div className="border-r p-6 overflow-auto">
                <SectionTitle>Identity</SectionTitle>
                <FieldRow label="Item Name" required>
                  <TextInput field="name" placeholder="Item name…" />
                </FieldRow>
                <FieldRow label="SKU / Item Code">
                  <TextInput field="sku" placeholder="SKU-001" mono />
                </FieldRow>
                <FieldRow label="Barcode">
                  <TextInput field="barcode" placeholder="EAN / UPC / QR…" mono />
                </FieldRow>
                <FieldRow label="Item Type">
                  <SelectInput field="type" options={ITEM_TYPES} />
                </FieldRow>
                <FieldRow label="Status">
                  <SelectInput field="status" options={["Active", "Inactive"]} />
                </FieldRow>
                <FieldRow label="Category">
                  <FkSelect field="category_id" opts={categories as any[]} placeholder="Select category…" />
                </FieldRow>
                <FieldRow label="Brand">
                  <TextInput field="brand" placeholder="Brand name…" />
                </FieldRow>
                <FieldRow label="Manufacturer">
                  <TextInput field="manufacturer" placeholder="Manufacturer…" />
                </FieldRow>
                <FieldRow label="Model">
                  <TextInput field="model" placeholder="Model number…" />
                </FieldRow>

                <Separator className="my-4" />
                <SectionTitle>Description</SectionTitle>
                <FieldRow label="General Description">
                  {canWrite ? (
                    <Textarea
                      rows={3}
                      className="text-sm"
                      value={values.description}
                      onChange={(e) => set("description", e.target.value)}
                      placeholder="General item description…"
                    />
                  ) : (
                    <ReadValue value={values.description} />
                  )}
                </FieldRow>
                <FieldRow label="Sales Description">
                  {canWrite ? (
                    <Textarea
                      rows={2}
                      className="text-sm"
                      value={values.sales_description}
                      onChange={(e) => set("sales_description", e.target.value)}
                      placeholder="Description shown on sales documents…"
                    />
                  ) : (
                    <ReadValue value={values.sales_description} />
                  )}
                </FieldRow>
                <FieldRow label="Purchase Description">
                  {canWrite ? (
                    <Textarea
                      rows={2}
                      className="text-sm"
                      value={values.purchase_description}
                      onChange={(e) => set("purchase_description", e.target.value)}
                      placeholder="Description shown on purchase documents…"
                    />
                  ) : (
                    <ReadValue value={values.purchase_description} />
                  )}
                </FieldRow>
              </div>

              {/* Right: image + stock snapshot */}
              <div className="flex flex-col gap-5 p-6">
                {/* Image placeholder */}
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 p-8 text-center">
                  {values.image_url ? (
                    <img src={values.image_url} alt={values.name} className="max-h-40 object-contain rounded" />
                  ) : (
                    <>
                      <ImagePlus className="h-8 w-8 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">Item image will appear here</p>
                      <p className="text-xs text-muted-foreground/60">Upload via image_url field</p>
                    </>
                  )}
                </div>

                {/* Quick stats */}
                {!isNew && (
                  <Card>
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm">Stock Snapshot</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">On Hand</span>
                        <StockBadge value={stockOnHand} warn={isBelowMin} uom={item?.uom} />
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Pending Ship</span>
                        <span className="font-mono tabular-nums text-sm">
                          {qty(pendingShip)} {item?.uom}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Available</span>
                        <span className="font-mono tabular-nums text-sm font-semibold">
                          {qty(Math.max(0, stockOnHand - pendingShip))} {item?.uom}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Pending Receive</span>
                        <span className="font-mono tabular-nums text-sm text-blue-500">
                          {qty(pendingReceive)} {item?.uom}
                        </span>
                      </div>
                      <Separator />
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Stock Value</span>
                        <span className="font-mono tabular-nums text-sm font-semibold">{money(totalCostValue)}</span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Metadata */}
                {!isNew && (
                  <Card>
                    <CardContent className="px-4 py-3 space-y-1.5 text-xs text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Created</span>
                        <span>{fmtDate(item?.created_at)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Last updated</span>
                        <span>{fmtDate(item?.updated_at)}</span>
                      </div>
                      {categoryName && (
                        <div className="flex justify-between">
                          <span>Category</span>
                          <span className="font-medium text-foreground">{categoryName}</span>
                        </div>
                      )}
                      {supplierName && (
                        <div className="flex justify-between">
                          <span>Preferred Supplier</span>
                          <span className="font-medium text-foreground">{supplierName}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════
              TAB 2: INVENTORY
          ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="inventory" className="mt-0 flex-1 overflow-auto p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
              {/* Stock level controls */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Package className="h-4 w-4" /> Stock Level Controls
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <FieldRow label="Reorder Point" hint="An alert is raised when on-hand falls to or below this level.">
                    <TextInput field="reorder" type="number" placeholder="0" />
                  </FieldRow>
                  <FieldRow label="Reorder Qty" hint="Suggested purchase/production quantity when reordering.">
                    <TextInput field="reorder_qty" type="number" placeholder="0" />
                  </FieldRow>
                  <FieldRow label="Min Stock" hint="Minimum acceptable on-hand quantity.">
                    <TextInput field="min_stock" type="number" placeholder="0" />
                  </FieldRow>
                  <FieldRow label="Max Stock" hint="Maximum stock you want to hold.">
                    <TextInput field="max_stock" type="number" placeholder="0" />
                  </FieldRow>
                  <FieldRow label="Safety Stock" hint="Buffer stock to absorb unexpected demand or supply delays.">
                    <TextInput field="safety_stock" type="number" placeholder="0" />
                  </FieldRow>
                </CardContent>
              </Card>

              {/* Tracking flags */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" /> Tracking Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-1">
                  <SwitchInput
                    field="track_inventory"
                    label="Track Inventory"
                    description="Maintain stock quantity records for this item."
                  />
                  <SwitchInput
                    field="track_batches"
                    label="Batch / Lot Tracking"
                    description="Track items by batch or lot numbers."
                  />
                  <SwitchInput
                    field="track_serials"
                    label="Serial Number Tracking"
                    description="Track each unit by a unique serial number."
                  />
                  <SwitchInput
                    field="track_expiry"
                    label="Expiry Date Tracking"
                    description="Track expiry / best-before dates per batch."
                  />
                  <Separator className="my-2" />
                  <FieldRow label="Costing Method">
                    <SelectInput field="inventory_tracking" options={TRACKING_METHODS} />
                  </FieldRow>
                </CardContent>
              </Card>

              {/* UOM conversions */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" /> Unit of Measure & Conversions
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {/* ── 4 UOM pickers with class badge + path validation ── */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    {(
                      [
                        { field: "uom", label: "Stock UoM", required: true },
                        { field: "purchase_uom", label: "Purchase UoM" },
                        { field: "sales_uom", label: "Sales UoM" },
                        { field: "manufacturing_uom", label: "Mfg UoM" },
                      ] as const
                    ).map(({ field, label, required }) => {
                      const code = values[field] as string | undefined;
                      const stockUom = values.uom as string | undefined;
                      const uomMeta = uomMaster.find((u) => u.code === code);
                      const classLabel = uomMeta?.uom_class;
                      const classColor = classLabel
                        ? UOM_CLASS_COLORS[classLabel as keyof typeof UOM_CLASS_COLORS]
                        : undefined;

                      // Path check: non-stock UOM must be convertible to stock UOM
                      let pathError: string | null = null;
                      if (field !== "uom" && code && stockUom && code !== stockUom && uomMaster.length > 0) {
                        if (!uomEngine.hasPath(code, stockUom, isNew ? null : id)) {
                          pathError = `No conversion path from "${code}" to stock UoM "${stockUom}"`;
                        }
                      }

                      return (
                        <div key={field} className="flex flex-col gap-1">
                          <Label className="text-xs text-muted-foreground">
                            {label}
                            {required && <span className="text-destructive ml-0.5">*</span>}
                          </Label>
                          {canWrite ? (
                            <Select value={values[field] || ""} onValueChange={(v) => set(field, v || null)}>
                              <SelectTrigger
                                className={`h-8 text-sm ${pathError || (required && errors[field]) ? "border-destructive" : ""}`}
                              >
                                <SelectValue placeholder={required ? "Required" : "Same as stock"} />
                              </SelectTrigger>
                              <SelectContent>
                                {!required && (
                                  <SelectItem value="">
                                    <span className="text-muted-foreground text-xs">Same as stock UoM</span>
                                  </SelectItem>
                                )}
                                {uomOptions.map((code) => {
                                  const meta = uomMaster.find((u) => u.code === code);
                                  return (
                                    <SelectItem key={code} value={code}>
                                      <span className="flex items-center gap-2">
                                        <span className="font-mono text-xs">{code}</span>
                                        {meta?.name && (
                                          <span className="text-muted-foreground text-xs">{meta.name}</span>
                                        )}
                                        {meta?.uom_class && (
                                          <span
                                            className={`ml-auto text-[10px] rounded px-1.5 py-0.5 ${UOM_CLASS_COLORS[meta.uom_class as keyof typeof UOM_CLASS_COLORS] ?? "bg-muted text-muted-foreground"}`}
                                          >
                                            {meta.uom_class}
                                          </span>
                                        )}
                                      </span>
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-sm font-mono">{values[field] || "—"}</span>
                          )}
                          {classLabel && !pathError && (
                            <span
                              className={`self-start text-[10px] rounded px-1.5 py-0.5 ${classColor ?? "bg-muted text-muted-foreground"}`}
                            >
                              {classLabel}
                              {uomMaster.find((u) => u.code === code)?.symbol &&
                                ` · ${uomMaster.find((u) => u.code === code)?.symbol}`}
                            </span>
                          )}
                          {pathError && <p className="text-[10px] text-destructive leading-tight">{pathError}</p>}
                          {required && errors[field] && <p className="text-[10px] text-destructive">{errors[field]}</p>}
                        </div>
                      );
                    })}
                  </div>

                  {/* ── Item-specific conversion table ── */}
                  {!isNew && (
                    <>
                      <Separator className="mb-3" />
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-muted-foreground">
                          Item-specific conversions — 1 From UoM = Factor × To UoM
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Global conversions (e.g. g → kg) are managed in{" "}
                          <Link to="/settings/uom" className="underline text-primary">
                            Settings → UoM
                          </Link>
                        </p>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/20">
                            <TableHead className="text-xs">From UoM</TableHead>
                            <TableHead className="text-xs">To UoM</TableHead>
                            <TableHead className="text-xs text-right w-28">Factor</TableHead>
                            <TableHead className="text-xs">Preview</TableHead>
                            {canWrite && <TableHead className="text-xs w-10" />}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {uomConversions.length === 0 && (
                            <TableRow>
                              <TableCell
                                colSpan={canWrite ? 5 : 4}
                                className="text-center text-sm text-muted-foreground py-6"
                              >
                                No item-specific conversions. Add one below (e.g. 1 Box = 12 pc).
                              </TableCell>
                            </TableRow>
                          )}
                          {uomConversions.map((c: any) => {
                            const preview = uomEngine.convert(1, c.from_uom, c.to_uom, id);
                            return (
                              <TableRow key={c.id}>
                                <TableCell className="font-mono text-sm">{c.from_uom}</TableCell>
                                <TableCell className="font-mono text-sm">{c.to_uom}</TableCell>
                                <TableCell className="text-right font-mono tabular-nums">
                                  {Number(c.factor)
                                    .toFixed(8)
                                    .replace(/\.?0+$/, "")}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {preview ? `1 ${c.from_uom} = ${preview.qty} ${c.to_uom}` : "—"}
                                </TableCell>
                                {canWrite && (
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => removeConversion.mutate(c.id)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                    </Button>
                                  </TableCell>
                                )}
                              </TableRow>
                            );
                          })}
                          {canWrite && (
                            <TableRow>
                              <TableCell>
                                <Select
                                  value={newConv.from_uom}
                                  onValueChange={(v) => setNewConv((p) => ({ ...p, from_uom: v }))}
                                >
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue placeholder="From…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {uomOptions.map((o) => (
                                      <SelectItem key={o} value={o}>
                                        {o}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={newConv.to_uom}
                                  onValueChange={(v) => setNewConv((p) => ({ ...p, to_uom: v }))}
                                >
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue placeholder="To…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {uomOptions.map((o) => (
                                      <SelectItem key={o} value={o}>
                                        {o}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  step="any"
                                  min="0.00000001"
                                  value={newConv.factor}
                                  onChange={(e) => setNewConv((p) => ({ ...p, factor: e.target.value }))}
                                  placeholder="e.g. 12"
                                  className="h-7 text-xs text-right"
                                />
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {/* Live preview of the entered conversion */}
                                {newConv.from_uom && newConv.to_uom && newConv.factor && Number(newConv.factor) > 0 && (
                                  <span>
                                    1 {newConv.from_uom} = {Number(newConv.factor)} {newConv.to_uom}
                                  </span>
                                )}
                                {newConv.from_uom &&
                                  newConv.to_uom &&
                                  uomEngine.checkCircular(newConv.from_uom, newConv.to_uom, id) && (
                                    <span className="text-destructive block text-[10px]">⚠ Circular</span>
                                  )}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => addConversion.mutate()}
                                  disabled={addConversion.isPending}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════
              TAB 3: WAREHOUSES
          ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="warehouses" className="mt-0 flex-1 overflow-auto p-6">
            <div className="space-y-5 max-w-4xl">
              {/* ── Warehouse-level summary ─────────────────────────────── */}
              {(() => {
                // Group location stock rows by warehouse
                const byWh: Record<string, { name: string; code: string; qty: number }> = {};
                for (const r of locationStock as any[]) {
                  const wid = r.warehouse_id ?? "__none";
                  // Warehouse name comes from movements join since inventory_location_stock view doesn't carry it
                  if (!byWh[wid]) {
                    const mv = movements.find((m: any) => m.warehouse_id === wid);
                    byWh[wid] = {
                      name: mv?.warehouses?.name ?? "Unassigned",
                      code: mv?.warehouses?.code ?? "",
                      qty: 0,
                    };
                  }
                  byWh[wid].qty += Number(r.on_hand ?? 0);
                }
                return (
                  <Card className="overflow-hidden p-0">
                    <CardHeader className="border-b px-4 py-3">
                      <CardTitle className="text-sm">Stock by Warehouse</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/20">
                            <TableHead className="text-xs">Warehouse</TableHead>
                            <TableHead className="text-xs">Code</TableHead>
                            <TableHead className="text-xs text-right">On Hand</TableHead>
                            <TableHead className="text-xs text-right">Value</TableHead>
                            <TableHead className="text-xs text-center">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.keys(byWh).length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                                No warehouse stock recorded yet.
                              </TableCell>
                            </TableRow>
                          ) : (
                            Object.entries(byWh).map(([wid, w]: any) => (
                              <TableRow key={wid}>
                                <TableCell className="font-medium text-sm">{w.name}</TableCell>
                                <TableCell className="font-mono text-xs text-muted-foreground">
                                  {w.code || "—"}
                                </TableCell>
                                <TableCell className="text-right font-mono tabular-nums">
                                  <span className={w.qty < 0 ? "text-destructive" : ""}>
                                    {qty(w.qty)} {item?.uom}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right font-mono tabular-nums text-sm">
                                  {money(w.qty * Number(item?.cost ?? 0))}
                                </TableCell>
                                <TableCell className="text-center">
                                  {w.qty <= 0 ? (
                                    <Badge variant="destructive" className="text-xs">
                                      Out
                                    </Badge>
                                  ) : item?.reorder && w.qty <= Number(item.reorder) ? (
                                    <Badge className="bg-warning/15 text-warning border-0 text-xs">Low</Badge>
                                  ) : (
                                    <Badge className="bg-success/15 text-success border-0 text-xs">In Stock</Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* ── Zone + bin breakdown ────────────────────────────────── */}
              {locationStock.length > 0 && (
                <Card className="overflow-hidden p-0">
                  <CardHeader className="border-b px-4 py-3">
                    <CardTitle className="text-sm">
                      Stock by Zone &amp; Bin
                      <span className="ml-2 text-muted-foreground font-normal text-xs">
                        ({locationStock.filter((r: any) => r.location_id).length} binned
                        {locationStock.filter((r: any) => !r.location_id).length > 0 &&
                          ` · ${locationStock.filter((r: any) => !r.location_id).length} unlocated`}
                        )
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/20">
                            <TableHead className="text-xs">Zone</TableHead>
                            <TableHead className="text-xs">Bin / Location</TableHead>
                            <TableHead className="text-xs">Aisle</TableHead>
                            <TableHead className="text-xs">Rack</TableHead>
                            <TableHead className="text-xs">Level</TableHead>
                            <TableHead className="text-xs text-right">On Hand</TableHead>
                            <TableHead className="text-xs text-right">Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(locationStock as any[]).map((r, i) => (
                            <TableRow key={i}>
                              <TableCell>
                                {r.zone_name ? (
                                  <span className="text-xs bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                                    {r.zone_name}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-xs font-medium">
                                {r.location_code ?? <span className="text-muted-foreground italic">Unlocated</span>}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {r.aisle ?? "—"}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">{r.rack ?? "—"}</TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {r.level ?? "—"}
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums">
                                <span className={Number(r.on_hand) < 0 ? "text-destructive" : ""}>
                                  {qty(r.on_hand)} {item?.uom}
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums text-sm">
                                {money(Number(r.on_hand) * Number(item?.cost ?? 0))}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════
              TAB 4: STOCK MOVEMENTS
          ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="movements" className="mt-0 flex-1 overflow-auto p-6">
            <Card className="overflow-hidden p-0">
              <CardHeader className="border-b px-4 py-3">
                <CardTitle className="text-sm">
                  Stock Movements
                  <span className="ml-2 text-muted-foreground font-normal text-xs">({movements.length} entries)</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs">Warehouse</TableHead>
                        <TableHead className="text-xs">Bin</TableHead>
                        <TableHead className="text-xs">Reference</TableHead>
                        <TableHead className="text-xs text-right w-24">In</TableHead>
                        <TableHead className="text-xs text-right w-24">Out</TableHead>
                        <TableHead className="text-xs text-right w-28">Unit Cost</TableHead>
                        <TableHead className="text-xs text-right w-28">Line Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                            No stock movements yet. Post a bill, invoice, adjustment, or production order.
                          </TableCell>
                        </TableRow>
                      ) : (
                        movements.map((m: any) => {
                          const q = Number(m.quantity);
                          const isIn = q > 0;
                          return (
                            <TableRow key={m.id}>
                              <TableCell className="text-xs whitespace-nowrap">{fmtDateTime(m.created_at)}</TableCell>
                              <TableCell>
                                <Badge variant={isIn ? "secondary" : "outline"} className="text-xs">
                                  {REF_LABELS[m.ref_type] ?? m.ref_type}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs">{m.warehouses?.name ?? "—"}</TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {m.warehouse_locations?.code ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs font-mono text-muted-foreground">{m.note ?? "—"}</TableCell>
                              <TableCell className="text-right font-mono tabular-nums text-xs text-success">
                                {isIn ? qty(Math.abs(q)) : "—"}
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums text-xs text-destructive">
                                {!isIn ? qty(Math.abs(q)) : "—"}
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums text-xs">
                                {money(m.unit_cost)}
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums text-xs">
                                {money(Math.abs(q) * Number(m.unit_cost ?? 0))}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════
              TAB 5: SALES
          ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="sales" className="mt-0 flex-1 overflow-auto p-6">
            <div className="space-y-6 max-w-5xl">
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Total Sold (Qty)", value: qty(totalSalesQty), icon: TrendingUp },
                  { label: "Total Revenue", value: money(totalSalesValue), icon: DollarSign },
                  { label: "Open Orders (Qty)", value: qty(pendingShip), icon: ShoppingCart },
                  { label: "Invoices", value: String(invoiceLines.length), icon: FileText },
                ].map(({ label, value, icon: Icon }) => (
                  <Card key={label}>
                    <CardContent className="p-4 flex items-start gap-3">
                      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-lg font-semibold font-mono tabular-nums leading-tight">{value}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Invoice lines table */}
              <Card className="overflow-hidden p-0">
                <CardHeader className="border-b px-4 py-3">
                  <CardTitle className="text-sm">Invoice History</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="text-xs">Invoice #</TableHead>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Customer</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs text-right">Qty</TableHead>
                        <TableHead className="text-xs text-right">Unit Price</TableHead>
                        <TableHead className="text-xs text-right">Line Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoiceLines.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                            No invoice history.
                          </TableCell>
                        </TableRow>
                      ) : (
                        invoiceLines.map((l: any) => (
                          <TableRow key={l.id}>
                            <TableCell className="font-mono text-xs">{l.invoices?.number ?? "—"}</TableCell>
                            <TableCell className="text-xs">{fmtDate(l.invoices?.date)}</TableCell>
                            <TableCell className="text-sm">{l.invoices?.customers?.name ?? "—"}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">
                                {l.invoices?.status ?? "—"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-xs">
                              {qty(l.quantity)}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-xs">
                              {money(l.unit_price)}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-xs font-medium">
                              {money(l.line_total)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Open sales orders */}
              <Card className="overflow-hidden p-0">
                <CardHeader className="border-b px-4 py-3">
                  <CardTitle className="text-sm">Open Sales Orders</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="text-xs">SO #</TableHead>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Customer</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs text-right">Qty</TableHead>
                        <TableHead className="text-xs text-right">Line Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesOrderLines.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                            No open sales orders.
                          </TableCell>
                        </TableRow>
                      ) : (
                        salesOrderLines.map((l: any) => (
                          <TableRow key={l.id}>
                            <TableCell className="font-mono text-xs">{l.sales_orders?.number ?? "—"}</TableCell>
                            <TableCell className="text-xs">{fmtDate(l.sales_orders?.date)}</TableCell>
                            <TableCell className="text-sm">{l.sales_orders?.customers?.name ?? "—"}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">
                                {l.sales_orders?.status ?? "—"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-xs">
                              {qty(l.quantity)}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-xs">
                              {money(l.line_total)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════
              TAB 6: PURCHASING
          ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="purchasing" className="mt-0 flex-1 overflow-auto p-6">
            <div className="space-y-6 max-w-5xl">
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Total Purchased (Qty)", value: qty(totalPurchaseQty), icon: TrendingDown },
                  { label: "Total Spend", value: money(totalPurchaseValue), icon: DollarSign },
                  { label: "Pending Receive", value: qty(pendingReceive), icon: ShoppingBag },
                  { label: "Bills", value: String(billLines.length), icon: ReceiptText },
                ].map(({ label, value, icon: Icon }) => (
                  <Card key={label}>
                    <CardContent className="p-4 flex items-start gap-3">
                      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-lg font-semibold font-mono tabular-nums leading-tight">{value}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Bill lines table */}
              <Card className="overflow-hidden p-0">
                <CardHeader className="border-b px-4 py-3">
                  <CardTitle className="text-sm">Purchase History (Bills)</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="text-xs">Bill #</TableHead>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Supplier</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs text-right">Qty</TableHead>
                        <TableHead className="text-xs text-right">Unit Price</TableHead>
                        <TableHead className="text-xs text-right">Line Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {billLines.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                            No purchase history.
                          </TableCell>
                        </TableRow>
                      ) : (
                        billLines.map((l: any) => (
                          <TableRow key={l.id}>
                            <TableCell className="font-mono text-xs">{l.bills?.number ?? "—"}</TableCell>
                            <TableCell className="text-xs">{fmtDate(l.bills?.date)}</TableCell>
                            <TableCell className="text-sm">{l.bills?.suppliers?.name ?? "—"}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">
                                {l.bills?.status ?? "—"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-xs">
                              {qty(l.quantity)}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-xs">
                              {money(l.unit_price)}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-xs font-medium">
                              {money(l.line_total)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════
              TAB 7: SUPPLIERS
          ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="suppliers" className="mt-0 flex-1 overflow-auto p-6">
            <div className="max-w-3xl space-y-6">
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm">Procurement Settings</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <FieldRow label="Preferred Supplier">
                    <FkSelect field="preferred_supplier_id" opts={suppliers as any[]} placeholder="Select supplier…" />
                  </FieldRow>
                  <FieldRow label="Lead Time (days)" hint="Average days from order placement to receipt.">
                    <TextInput field="supplier_lead_time_days" type="number" placeholder="0" />
                  </FieldRow>
                  <FieldRow label="Purchase Description">
                    {canWrite ? (
                      <Textarea
                        rows={2}
                        className="text-sm"
                        value={values.purchase_description}
                        onChange={(e) => set("purchase_description", e.target.value)}
                        placeholder="Text that appears on purchase orders…"
                      />
                    ) : (
                      <ReadValue value={values.purchase_description} />
                    )}
                  </FieldRow>
                </CardContent>
              </Card>

              {/* Suppliers who have billed this item */}
              <Card className="overflow-hidden p-0">
                <CardHeader className="border-b px-4 py-3">
                  <CardTitle className="text-sm">Suppliers Who Have Supplied This Item</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="text-xs">Supplier</TableHead>
                        <TableHead className="text-xs text-right">Times Purchased</TableHead>
                        <TableHead className="text-xs text-right">Total Qty</TableHead>
                        <TableHead className="text-xs text-right">Total Spend</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const bySupplier: Record<string, { name: string; count: number; qty: number; spend: number }> =
                          {};
                        for (const l of billLines as any[]) {
                          const sid = l.bills?.supplier_id ?? "__none";
                          const sname = l.bills?.suppliers?.name ?? "Unknown";
                          if (!bySupplier[sid]) bySupplier[sid] = { name: sname, count: 0, qty: 0, spend: 0 };
                          bySupplier[sid].count++;
                          bySupplier[sid].qty += Number(l.quantity ?? 0);
                          bySupplier[sid].spend += Number(l.line_total ?? 0);
                        }
                        const rows = Object.values(bySupplier);
                        if (rows.length === 0) {
                          return (
                            <TableRow>
                              <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                                No supplier history yet.
                              </TableCell>
                            </TableRow>
                          );
                        }
                        return rows.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium text-sm">{r.name}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{qty(r.qty)}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{money(r.spend)}</TableCell>
                          </TableRow>
                        ));
                      })()}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════
              TAB 8: BOMs
          ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="boms" className="mt-0 flex-1 overflow-auto p-6">
            <div className="space-y-6 max-w-5xl">
              {/* BOMs where this item is the output */}
              <Card className="overflow-hidden p-0">
                <CardHeader className="border-b px-4 py-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm">Bills of Materials (This Item as Output)</CardTitle>
                  {canWrite && (
                    <Button variant="outline" size="sm" asChild>
                      <Link to={"/manufacturing/bom/new" as any}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> New BOM
                      </Link>
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="text-xs">BOM Code</TableHead>
                        <TableHead className="text-xs">Version</TableHead>
                        <TableHead className="text-xs text-right">Yield Qty</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs w-16" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bomHeaders.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                            No BOMs defined for this item.
                          </TableCell>
                        </TableRow>
                      ) : (
                        bomHeaders.map((b: any) => (
                          <TableRow key={b.id}>
                            <TableCell className="font-mono text-sm font-medium">{b.code}</TableCell>
                            <TableCell className="text-sm">{b.version || "—"}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{qty(b.yield_qty)}</TableCell>
                            <TableCell>
                              <Badge
                                className={`text-xs ${
                                  b.status === "Active"
                                    ? "bg-success/15 text-success border-0"
                                    : "bg-muted text-muted-foreground border-0"
                                }`}
                              >
                                {b.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                                <Link to={`/manufacturing/bom/${b.id}` as any}>View</Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* BOM lines where this item is a component */}
              <Card className="overflow-hidden p-0">
                <CardHeader className="border-b px-4 py-3">
                  <CardTitle className="text-sm">Component Of (BOMs where this item is used as an input)</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="text-xs">Component Qty</TableHead>
                        <TableHead className="text-xs">UoM</TableHead>
                        <TableHead className="text-xs text-right">Unit Cost (BOM)</TableHead>
                        <TableHead className="text-xs text-right">Line Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bomLines.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                            This item is not used as a component in any BOM.
                          </TableCell>
                        </TableRow>
                      ) : (
                        bomLines.map((l: any) => (
                          <TableRow key={l.id}>
                            <TableCell className="font-mono tabular-nums text-sm">{qty(l.quantity)}</TableCell>
                            <TableCell className="text-sm">{l.items?.uom ?? item?.uom ?? "—"}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-sm">
                              {money(l.unit_cost)}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-sm">
                              {money(l.line_total)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════
              TAB 9: MANUFACTURING
          ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="manufacturing" className="mt-0 flex-1 overflow-auto p-6">
            <div className="space-y-6 max-w-5xl">
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  {
                    label: "Total Produced",
                    value: qty(
                      productionOrders
                        .filter((o: any) => o.status === "Completed")
                        .reduce((s: number, o: any) => s + Number(o.quantity), 0),
                    ),
                    icon: Factory,
                  },
                  {
                    label: "Open Orders",
                    value: String(
                      productionOrders.filter((o: any) => ["Planned", "In Progress"].includes(o.status)).length,
                    ),
                    icon: RefreshCw,
                  },
                  { label: "Pending Qty", value: qty(pendingReceive), icon: TrendingUp },
                ].map(({ label, value, icon: Icon }) => (
                  <Card key={label}>
                    <CardContent className="p-4 flex items-start gap-3">
                      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-lg font-semibold font-mono tabular-nums leading-tight">{value}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="overflow-hidden p-0">
                <CardHeader className="border-b px-4 py-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm">Production Orders</CardTitle>
                  {canWrite && (
                    <Button variant="outline" size="sm" asChild>
                      <Link to={"/manufacturing/orders" as any}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> New Order
                      </Link>
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="text-xs">MO #</TableHead>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs text-right">Qty</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Posted</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productionOrders.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                            No production orders for this item.
                          </TableCell>
                        </TableRow>
                      ) : (
                        productionOrders.map((o: any) => (
                          <TableRow key={o.id}>
                            <TableCell className="font-mono text-xs">{o.number}</TableCell>
                            <TableCell className="text-xs">{fmtDate(o.date)}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{qty(o.quantity)}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">
                                {o.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {o.posted_at ? fmtDate(o.posted_at) : "—"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════
              TAB 10: PRICING
          ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="pricing" className="mt-0 flex-1 overflow-auto p-6">
            <div className="max-w-2xl space-y-6">
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <DollarSign className="h-4 w-4" /> Cost & Pricing
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <FieldRow
                    label="Average Cost"
                    hint="Weighted average cost maintained by the inventory ledger. Updated automatically on posting."
                  >
                    <TextInput field="cost" type="number" placeholder="0.00" />
                  </FieldRow>
                  <FieldRow
                    label="Standard Cost"
                    hint="Planned/budgeted cost used for variance analysis. Not updated automatically."
                  >
                    <TextInput field="standard_cost" type="number" placeholder="0.00" />
                  </FieldRow>
                  <FieldRow label="Selling Price" hint="Default price shown on sales orders and invoices.">
                    <TextInput field="price" type="number" placeholder="0.00" />
                  </FieldRow>
                  {!isNew && item?.cost != null && item?.price != null && (
                    <>
                      <Separator className="my-3" />
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Gross Margin</span>
                          <span className="font-mono tabular-nums font-medium">
                            {money(Number(item.price) - Number(item.cost))}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Margin %</span>
                          <span className="font-mono tabular-nums font-medium">
                            {Number(item.price) > 0
                              ? (((Number(item.price) - Number(item.cost)) / Number(item.price)) * 100).toFixed(1) + "%"
                              : "—"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Markup %</span>
                          <span className="font-mono tabular-nums font-medium">
                            {Number(item.cost) > 0
                              ? (((Number(item.price) - Number(item.cost)) / Number(item.cost)) * 100).toFixed(1) + "%"
                              : "—"}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {!isNew && (
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm">Stock Valuation</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">On Hand</span>
                      <span className="font-mono tabular-nums">
                        {qty(stockOnHand)} {item?.uom}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avg Cost</span>
                      <span className="font-mono tabular-nums">{money(item?.cost)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-semibold">
                      <span>Total Stock Value</span>
                      <span className="font-mono tabular-nums">{money(totalCostValue)}</span>
                    </div>
                    {item?.standard_cost != null && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>At Standard Cost</span>
                        <span className="font-mono tabular-nums">
                          {money(stockOnHand * Number(item.standard_cost))}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════
              TAB 11: ACCOUNTING
          ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="accounting" className="mt-0 flex-1 overflow-auto p-6">
            <div className="max-w-2xl space-y-6">
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BookOpen className="h-4 w-4" /> GL Account Overrides
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="text-xs text-muted-foreground mb-4">
                    Leave blank to use the tenant-wide default accounts (1200 Inventory, 5000 COGS, 4000 Revenue, 6000
                    Expense). These per-item overrides take precedence when set.
                  </p>
                  <FieldRow label="Inventory Account" hint="Asset account for this item's stock value.">
                    <FkSelect
                      field="inventory_account_id"
                      opts={coaAccounts as any[]}
                      placeholder="Default (1200 Inventory)…"
                    />
                  </FieldRow>
                  <FieldRow label="COGS Account" hint="Expense account debited when this item is invoiced.">
                    <FkSelect field="cogs_account_id" opts={coaAccounts as any[]} placeholder="Default (5000 COGS)…" />
                  </FieldRow>
                  <FieldRow label="Sales Account" hint="Income account credited when this item is invoiced.">
                    <FkSelect
                      field="sales_account_id"
                      opts={coaAccounts as any[]}
                      placeholder="Default (4000 Revenue)…"
                    />
                  </FieldRow>
                  <FieldRow label="Purchase Account" hint="Account debited when this item appears on a bill.">
                    <FkSelect
                      field="purchase_account_id"
                      opts={coaAccounts as any[]}
                      placeholder="Default (1200 Inventory or 6000 Expense)…"
                    />
                  </FieldRow>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm">Costing Method</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <FieldRow label="Inventory Tracking" hint="Valuation method used for cost of goods sold.">
                    <SelectInput field="inventory_tracking" options={TRACKING_METHODS} />
                  </FieldRow>
                  <p className="text-xs text-muted-foreground mt-2">
                    <strong>AVCO</strong> — Weighted average cost, recalculated on each receipt. Current implementation.
                    <br />
                    <strong>FIFO</strong> — First in, first out. Reserved for future implementation.
                    <br />
                    <strong>None</strong> — Item does not carry inventory value (services, non-stocked).
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════
              TAB 12: ACTIVITY
          ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="activity" className="mt-0 flex-1 overflow-auto p-6">
            <div className="max-w-3xl space-y-6">
              {/* Recent stock movements as activity feed */}
              <Card>
                <CardHeader className="border-b px-4 py-3">
                  <CardTitle className="text-sm">Recent Activity</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  {movements.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No activity recorded yet.</p>
                  ) : (
                    <ol className="relative border-l border-muted ml-2 space-y-0">
                      {movements.slice(0, 50).map((m: any, idx: number) => {
                        const q = Number(m.quantity);
                        const isIn = q > 0;
                        return (
                          <li key={m.id} className="pl-5 pb-4 relative">
                            <span
                              className={`absolute -left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-background ${
                                isIn ? "bg-success" : "bg-destructive"
                              }`}
                            />
                            <p className="text-xs text-muted-foreground leading-tight">{fmtDateTime(m.created_at)}</p>
                            <p className="text-sm leading-snug mt-0.5">
                              <span className="font-medium">{REF_LABELS[m.ref_type] ?? m.ref_type}</span>
                              {" — "}
                              <span className={`font-mono font-semibold ${isIn ? "text-success" : "text-destructive"}`}>
                                {isIn ? "+" : "−"}
                                {qty(Math.abs(q))} {item?.uom}
                              </span>
                              {m.warehouses?.name && (
                                <span className="text-muted-foreground text-xs"> @ {m.warehouses.name}</span>
                              )}
                            </p>
                            {m.note && <p className="text-xs text-muted-foreground mt-0.5">{m.note}</p>}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
