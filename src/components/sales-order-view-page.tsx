import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentEvents } from "@/lib/document-events";
import { logDocumentEvent } from "@/lib/document-events";
import { useDocumentBranding } from "@/hooks/use-document-branding";
import { downloadDocumentPdf, type PdfDocInput } from "@/lib/document-pdf";
import { DocumentEditor } from "@/components/document-editor";
import { FulfillmentTimeline } from "@/components/fulfillment-timeline";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SalesDocumentLineage } from "@/components/sales-document-lineage";
import { SalesNextAction } from "@/components/sales-next-action";
import { SalesFinancialSummary } from "@/components/sales-financial-summary";
import { CreditLimitWarning } from "@/components/credit-limit-warning";
import { CreateInvoiceFromOrderDialog } from "@/components/create-invoice-from-order-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  MoreHorizontal,
  Pencil,
  ShoppingCart,
  Trash2,
  Truck,
  Wallet,
  Factory,
} from "lucide-react";
import { toast } from "sonner";

type Row = Record<string, any>;
const money = (value: any, currency: string) =>
  `${currency} ${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateFmt = (value: any) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
const dateTimeFmt = (value: any) =>
  value
    ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "—";

function SideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}
function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || "Not set"}</p>
    </div>
  );
}
function Total({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className={bold ? "font-semibold" : "text-sm text-muted-foreground"}>{label}</span>
      <span className={`font-mono ${bold ? "font-bold" : "text-sm"}`}>{value}</span>
    </div>
  );
}

type ManufacturingRequirement = {
  sales_order_line_id: string;
  item_id: string;
  item_name: string;
  sku: string | null;
  uom: string | null;
  ordered_qty: number;
  fulfilled_qty: number;
  available_qty: number;
  in_production_qty: number;
  manufacturing_required: number;
  active_bom_id: string | null;
  active_bom_version: string | null;
};

function ManufacturingRequirementDialog({
  open,
  onOpenChange,
  orderId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  onCreated: () => void;
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const qc = useQueryClient();
  const { data: requirements = [], isLoading } = useQuery({
    queryKey: ["sales_order_mto_requirements", orderId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (db as any).rpc("get_sales_order_manufacturing_requirements", {
        _sales_order_id: orderId,
      });
      if (error) throw error;
      return (data ?? []) as ManufacturingRequirement[];
    },
  });
  const createMto = useMutation({
    mutationFn: async () => {
      const lines = requirements
        .filter((line) => selected[line.sales_order_line_id] && Number(line.manufacturing_required) > 0)
        .map((line) => ({
          sales_order_line_id: line.sales_order_line_id,
          quantity: Number(line.manufacturing_required),
        }));
      if (lines.length === 0) throw new Error("Select at least one line requiring manufacturing");
      const { data, error } = await (db as any).rpc("create_sales_order_mto_orders", {
        _sales_order_id: orderId,
        _lines: lines,
      });
      if (error) throw error;
      return data ?? [];
    },
    onSuccess: (created) => {
      toast.success(`${created.length} Manufacturing Order${created.length === 1 ? "" : "s"} created.`);
      setSelected({});
      qc.invalidateQueries({ queryKey: ["sales_order_mto_requirements", orderId] });
      onCreated();
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Factory className="h-5 w-5" /> Manufacturing Required</DialogTitle>
          <DialogDescription>Select order lines and create one MTO Manufacturing Order per selected line.</DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground">
              <tr><th className="w-10 p-3" /><th className="p-3 text-left">Product</th><th className="p-3 text-right">Ordered</th><th className="p-3 text-right">Available</th><th className="p-3 text-right">In Production</th><th className="p-3 text-right">Required</th><th className="p-3 text-left">BOM</th></tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Checking inventory and manufacturing...</td></tr> : requirements.map((line) => {
                const required = Number(line.manufacturing_required);
                const disabled = required <= 0 || !line.active_bom_id;
                return (
                  <tr key={line.sales_order_line_id} className="border-t">
                    <td className="p-3"><Checkbox checked={!!selected[line.sales_order_line_id]} disabled={disabled} onCheckedChange={(checked) => setSelected((current) => ({ ...current, [line.sales_order_line_id]: checked === true }))} /></td>
                    <td className="p-3"><div className="font-medium">{line.item_name}</div><div className="font-mono text-xs text-muted-foreground">{line.sku ?? "No SKU"}</div></td>
                    <td className="p-3 text-right font-mono">{line.ordered_qty}</td>
                    <td className="p-3 text-right font-mono">{line.available_qty}</td>
                    <td className="p-3 text-right font-mono">{line.in_production_qty}</td>
                    <td className={`p-3 text-right font-mono font-semibold ${required > 0 ? "text-warning" : "text-success"}`}>{required}</td>
                    <td className="p-3 text-xs">{line.active_bom_id ? `Active ${line.active_bom_version ?? ""}` : <span className="text-destructive">No active BOM</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => createMto.mutate()} disabled={createMto.isPending || isLoading}><Factory className="mr-1.5 h-4 w-4" />Create Manufacturing Orders</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
const ORDER_STAGES = [
  "Draft",
  "Confirmed",
  "Processing",
  "Partially Fulfilled",
  "Fulfilled",
  "Completed",
];

function PaymentBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={
        status === "Paid"
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : status === "Partially Paid"
            ? "border-amber-300 bg-amber-50 text-amber-700"
            : ""
      }
    >
      {status}
    </Badge>
  );
}
function OrderLines({
  lines,
  items,
  packageLines,
  currency,
  order,
  onEdit,
}: {
  lines: Row[];
  items: Row[];
  packageLines: Row[];
  currency: string;
  order: Row;
  onEdit: () => void;
}) {
  const totalQuantity = lines.reduce((sum, line) => sum + Number(line.quantity ?? 0), 0);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Sales Order Items</CardTitle>
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="mr-1.5 h-4 w-4" /> Edit Items
        </Button>
      </CardHeader>
      <Separator />
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                <th className="px-3 py-3">#</th>
                <th className="px-3 py-3 text-left">Item / SKU</th>
                <th className="px-3 py-3 text-left">Description</th>
                <th className="px-3 py-3 text-right">Ordered</th>
                <th className="px-3 py-3 text-right">Fulfilled</th>
                <th className="px-3 py-3 text-right">Remaining</th>
                <th className="px-3 py-3 text-right">Unit Price</th>
                <th className="px-3 py-3 text-right">Discount</th>
                <th className="px-3 py-3 text-right">Tax</th>
                <th className="px-3 py-3 text-right">Amount</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No products added yet.
                  </td>
                </tr>
              ) : (
                lines.map((line, index) => {
                  const item = items.find((candidate) => candidate.id === line.item_id);
                  const fulfilled = packageLines
                    .filter((packageLine) => packageLine.item_id === line.item_id)
                    .reduce((sum, packageLine) => sum + Number(packageLine.quantity ?? 0), 0);
                  return (
                    <tr key={line.id} className="border-b">
                      <td className="px-3 py-3">{index + 1}</td>
                      <td className="px-3 py-3">
                        <p className="font-medium">{item?.name ?? line.description ?? "Item"}</p>
                        <p className="text-xs text-muted-foreground">{item?.sku ?? "No SKU"}</p>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{line.description ?? "—"}</td>
                      <td className="px-3 py-3 text-right">{line.quantity ?? 0}</td>
                      <td className="px-3 py-3 text-right">{fulfilled}</td>
                      <td className="px-3 py-3 text-right">
                        {Math.max(0, Number(line.quantity ?? 0) - fulfilled)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs">
                        {money(line.unit_price, currency)}
                      </td>
                      <td className="px-3 py-3 text-right">{Number(line.discount_pct ?? 0)}%</td>
                      <td className="px-3 py-3 text-right">{Number(line.tax_pct ?? 0)}%</td>
                      <td className="px-3 py-3 text-right font-mono">
                        {money(line.line_total, currency)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={onEdit}
                          aria-label={`Edit ${item?.name ?? "line item"}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 border-t p-4">
          <div className="flex gap-6 text-xs text-muted-foreground">
            <span>
              Total Items <strong className="ml-1 text-foreground">{lines.length}</strong>
            </span>
            <span>
              Total Quantity <strong className="ml-1 text-foreground">{totalQuantity}</strong>
            </span>
          </div>
          <div className="space-y-2">
            <Total label="Subtotal" value={money(order.subtotal, currency)} />
            <Total label="Discount" value={money(order.discount_total, currency)} />
            <Total label="Tax" value={money(order.tax_total, currency)} />
            <Total label="Grand Total" value={money(order.grand_total, currency)} bold />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function SalesOrderViewPage({ id }: { id: string }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { tenant, can } = useAuth();
  const { branding } = useDocumentBranding("order");
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState("overview");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [mtoDialogOpen, setMtoDialogOpen] = useState(false);
  const { data: order, isLoading } = useQuery({
    queryKey: ["sales_orders", id, "view"],
    queryFn: async () => {
      const { data, error } = await db.from("sales_orders").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
  });
  const { data: lines = [] } = useQuery({
    queryKey: ["sales_order_lines", id, "view"],
    queryFn: async () => {
      const { data, error } = await db
        .from("sales_order_lines")
        .select("*")
        .eq("document_id", id)
        .is("deleted_at", null)
        .order("line_no");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const itemIds = useMemo(
    () => Array.from(new Set(lines.map((line) => line.item_id).filter(Boolean))),
    [lines],
  );
  const { data: items = [] } = useQuery({
    queryKey: ["items", itemIds],
    enabled: itemIds.length > 0,
    queryFn: async () => {
      const { data } = await db.from("items").select("id,name,sku").in("id", itemIds);
      return (data ?? []) as Row[];
    },
  });
  const { data: customer } = useQuery({
    queryKey: ["customers", order?.customer_id],
    enabled: !!order?.customer_id,
    queryFn: async () => {
      if (!order?.customer_id) throw new Error("Sales order customer is unavailable");
      const { data } = await db
        .from("customers")
        .select("*")
        .eq("id", order.customer_id)
        .maybeSingle();
      return data as Row | null;
    },
  });
  const { data: packages = [] } = useQuery({
    queryKey: ["packages", id],
    queryFn: async () => {
      const { data } = await db
        .from("packages")
        .select("id")
        .eq("sales_order_id", id)
        .is("deleted_at", null);
      return (data ?? []) as Row[];
    },
  });
  const { data: packageLines = [] } = useQuery({
    queryKey: ["package_lines", packages.map((p) => p.id)],
    enabled: packages.length > 0,
    queryFn: async () => {
      const { data } = await db
        .from("package_lines")
        .select("*")
        .in(
          "document_id",
          packages.map((p) => p.id),
        )
        .is("deleted_at", null);
      return (data ?? []) as Row[];
    },
  });
  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices", id],
    queryFn: async () => {
      const { data } = await db
        .from("invoices")
        .select("*")
        .eq("source_order_id", id)
        .is("deleted_at", null);
      return (data ?? []) as Row[];
    },
  });
  const { data: payments = [] } = useQuery({
    queryKey: ["payments_received", invoices.map((i) => i.id)],
    enabled: invoices.length > 0,
    queryFn: async () => {
      const { data } = await db
        .from("payments_received")
        .select("*")
        .in(
          "invoice_id",
          invoices.map((i) => i.id),
        )
        .is("deleted_at", null);
      return (data ?? []) as Row[];
    },
  });
  const { data: financialSummary } = useQuery({
    queryKey: ["sales_orders", id, "financial-summary"],
    queryFn: async () => {
      const { data, error } = await db.rpc("get_sales_order_financial_summary", { _order_id: id });
      if (error) throw error;
      return (data?.[0] ?? data) as Row;
    },
  });
  const { data: manufacturingOrders = [] } = useQuery({
    queryKey: ["production_orders", "sales_order", id],
    queryFn: async () => {
      const { data, error } = await db
        .from("production_orders")
        .select("id, number, quantity, qty_produced, status, product_id, source_id, source_type")
        .eq("source_type", "sales_order")
        .eq("source_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const { data: events = [] } = useDocumentEvents("order", id);
  const { data: audit = [] } = useQuery({
    queryKey: ["audit_logs", "sales_orders", id],
    queryFn: async () => {
      const { data } = await db
        .from("audit_logs")
        .select("*")
        .eq("table_name", "sales_orders")
        .eq("record_id", id)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as Row[];
    },
  });
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from("sales_orders")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sales order deleted");
      nav({ to: "/sales/orders" as never });
    },
  });
  const setStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await db.from("sales_orders").update({ status }).eq("id", id);
      if (error) throw error;
      if (tenant?.id)
        await logDocumentEvent({
          tenantId: tenant.id,
          entityType: "order",
          entityId: id,
          status,
          note: `Sales Order ${status.toLowerCase()}`,
          actorId: null,
          actorEmail: null,
        });
      return status;
    },
    onSuccess: (status) => {
      toast.success(`Order ${status.toLowerCase()}`);
      qc.invalidateQueries({ queryKey: ["sales_orders", id] });
      qc.invalidateQueries({ queryKey: ["sales_orders", id, "view"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  if (editing)
    return (
      <DocumentEditor
        kind="order"
        id={id}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          qc.invalidateQueries({ queryKey: ["sales_orders", id] });
        }}
      />
    );
  if (isLoading)
    return <div className="p-8 text-sm text-muted-foreground">Loading sales order...</div>;
  if (!order)
    return <div className="p-8 text-sm text-muted-foreground">Sales order not found.</div>;
  const currency = order.currency ?? tenant?.currency_symbol ?? tenant?.currency ?? "KES";
  const ordered = lines.reduce((sum, line) => sum + Number(line.quantity ?? 0), 0);
  const fulfilled = packageLines.reduce((sum, line) => sum + Number(line.quantity ?? 0), 0);
  const progress = ordered ? Math.min(100, (fulfilled / ordered) * 100) : 0;
  const paid = Number(financialSummary?.paid_amount ?? 0);
  const outstanding = Number(
    financialSummary?.outstanding_amount ?? Math.max(0, Number(order.grand_total ?? 0) - paid),
  );
  const paymentStatus = order.payment_status ?? (paid > 0 ? "Partially Paid" : "Unpaid");
  const fulfillmentStatus =
    order.fulfillment_status ??
    (fulfilled <= 0
      ? "Not Started"
      : fulfilled >= ordered && ordered > 0
        ? "Fulfilled"
        : "Partially Fulfilled");
  const creditExceeded =
    Number(customer?.credit_limit ?? 0) > 0 &&
    Number(customer?.balance ?? 0) + Number(order.grand_total ?? 0) >
      Number(customer?.credit_limit ?? 0);
  const currentStatus = order.status ?? "Draft";
  const currentStage = ORDER_STAGES.indexOf(currentStatus);
  const canDelete = can(["sales.delete", "admin"]);
  const canWrite = can([
    "sales.create",
    "sales.update",
    "accounting.journal.create",
    "accounting.journal.update",
  ]);
  const pdf: PdfDocInput = {
    title: "Sales Order",
    number: String(order.number ?? ""),
    companyName: tenant?.name ?? "Company",
    partyLabel: "Customer",
    partyName: customer?.name ?? "—",
    currency,
    meta: [
      { label: "Date", value: dateFmt(order.date) },
      { label: "Status", value: String(order.status ?? "Draft") },
    ],
    lines: lines.map((line) => ({
      description: line.description ?? "",
      quantity: Number(line.quantity ?? 0),
      unit_price: Number(line.unit_price ?? 0),
      discount_pct: Number(line.discount_pct ?? 0),
      tax_pct: Number(line.tax_pct ?? 0),
      line_total: Number(line.line_total ?? 0),
    })),
    totals: {
      subtotal: Number(order.subtotal ?? 0),
      discount_total: Number(order.discount_total ?? 0),
      tax_total: Number(order.tax_total ?? 0),
      grand_total: Number(order.grand_total ?? 0),
    },
    branding,
    notes: order.notes,
  };
  return (
    <div className="min-h-full bg-muted/20 p-4 md:p-6">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="sm" onClick={() => nav({ to: "/sales/orders" as never })}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold">{order.number ?? "Sales Order"}</h1>
                <Badge variant="secondary">{order.status ?? "Draft"}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                <span>
                  <strong className="text-foreground">Customer</strong>{" "}
                  {customer?.name ?? "No customer"}
                </span>
                <span>
                  <strong className="text-foreground">Order Date</strong> {dateFmt(order.date)}
                </span>
                <span>
                  <strong className="text-foreground">Salesperson</strong>{" "}
                  {order.salesperson_name ?? order.salesperson ?? "Not assigned"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {currentStatus === "Draft" && canWrite && (
              <Button
                size="sm"
                onClick={() => setStatus.mutate("Confirmed")}
                disabled={setStatus.isPending || creditExceeded}
                title={creditExceeded ? "Credit limit exceeded; approval is required" : undefined}
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" /> Confirm Order
              </Button>
            )}
            {(currentStatus === "Confirmed" ||
              currentStatus === "Processing" ||
              currentStatus === "Partially Fulfilled") &&
              canWrite && (
                <Button size="sm" asChild>
                  <a href={`/sales/packages/new?order=${id}`}>
                    <Truck className="mr-1.5 h-4 w-4" />{" "}
                    {currentStatus === "Partially Fulfilled"
                      ? "Fulfill Remaining"
                      : "Fulfill Order"}
                  </a>
                </Button>
              )}
            {canWrite && can("manufacturing.create") && ["Confirmed", "Processing", "Partially Fulfilled"].includes(currentStatus) && (
              <Button size="sm" variant="outline" onClick={() => setMtoDialogOpen(true)}>
                <Factory className="mr-1.5 h-4 w-4" /> Manufacturing Required
              </Button>
            )}
            {(currentStatus === "Confirmed" ||
              currentStatus === "Processing" ||
              currentStatus === "Partially Fulfilled" ||
              currentStatus === "Fulfilled") &&
              canWrite && (
                <Button size="sm" variant="outline" onClick={() => setInvoiceDialogOpen(true)}>
                  <FileText className="mr-1.5 h-4 w-4" /> Create Invoice
                </Button>
              )}
            {canWrite && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="mr-1.5 h-4 w-4" /> Edit
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => downloadDocumentPdf(pdf)}>
              <Download className="mr-1.5 h-4 w-4" /> PDF
            </Button>
            {canDelete && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => setDeleteOpen(true)}
                aria-label="Delete order"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </header>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Order Total", value: money(order.grand_total, currency), icon: ShoppingCart },
            {
              label: "Outstanding",
              value: money(outstanding, currency),
              sub: `${money(paid, currency)} paid`,
              icon: Wallet,
            },
            {
              label: "Fulfillment",
              value: `${Math.round(progress)}%`,
              sub: `${fulfilled} / ${ordered} units`,
              icon: Truck,
            },
            {
              label: "Payment Status",
              value: paymentStatus,
              sub: `${money(paid, currency)} received`,
              icon: Wallet,
            },
            {
              label: "Delivery",
              value: dateFmt(order.expected_delivery_date ?? order.delivery_date),
              sub: "Expected delivery",
              icon: CalendarDays,
            },
          ].map((kpi) => (
            <Card key={kpi.label} className="p-4">
              <div className="flex justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className="mt-1 truncate font-mono text-lg font-semibold">{kpi.value}</p>
                  {kpi.sub && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">{kpi.sub}</p>
                  )}
                </div>
                <kpi.icon className="h-4 w-4 text-primary" />
              </div>
            </Card>
          ))}
        </div>
        <CreditLimitWarning
          creditLimit={Number(customer?.credit_limit ?? 0)}
          outstanding={Number(customer?.balance ?? 0)}
          orderValue={Number(order.grand_total ?? 0)}
          currency={currency}
        />
        <SalesFinancialSummary
          summary={{
            orderTotal: Number(order.grand_total ?? 0),
            fulfillmentPercent: progress,
            invoicedAmount: Number(financialSummary?.invoiced_amount ?? 0),
            paidAmount: paid,
            outstandingAmount: outstanding,
            currency,
          }}
        />
        <SalesNextAction
          state={{
            kind: "order",
            status: currentStatus,
            fulfillmentStatus,
            invoiceStatus: order.invoice_status,
            outstanding,
            currency,
          }}
          onAction={() =>
            fulfillmentStatus === "Not Started"
              ? nav({ to: `/sales/packages/new?order=${id}` as never })
              : setInvoiceDialogOpen(true)
          }
        />
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="customer">Customer</TabsTrigger>
            <TabsTrigger value="fulfillment">Fulfillment</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="audit">Audit Trail</TabsTrigger>
          </TabsList>
          <TabsContent value="customer" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>Customer</span>
                  <Button variant="link" size="sm" className="h-auto px-0" asChild>
                    <a href={`/crm/customers/${customer?.id}`}>
                      <ExternalLink className="mr-1 h-3.5 w-3.5" /> View Customer
                    </a>
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Info label="Name" value={customer?.name} />
                <Info label="Code" value={customer?.code} />
                <Info label="Contact" value={customer?.contact_person} />
                <Info label="Email" value={customer?.email} />
                <Info label="Phone" value={customer?.phone} />
                <Info
                  label="Payment Terms"
                  value={order.payment_terms ?? customer?.payment_terms}
                />
                <Info label="Currency" value={currency} />
                <Info label="Billing Address" value={customer?.billing_address} />
                <Info label="Shipping Address" value={customer?.shipping_address} />
                <Info
                  label="Credit Limit"
                  value={
                    customer?.credit_limit ? money(customer.credit_limit, currency) : "Not set"
                  }
                />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="fulfillment" className="mt-4 grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Fulfillment</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="flex justify-between">
                  <span>Ordered</span>
                  <b>{ordered}</b>
                </div>
                <div className="flex justify-between">
                  <span>Fulfilled</span>
                  <b>{fulfilled}</b>
                </div>
                <div className="flex justify-between">
                  <span>Remaining</span>
                  <b>{Math.max(0, ordered - fulfilled)}</b>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${progress}%` }} />
                </div>
              </CardContent>
            </Card>
            <FulfillmentTimeline orderId={id} />
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Manufacturing Orders</CardTitle>
                {can("manufacturing.create") && <Button size="sm" variant="outline" onClick={() => setMtoDialogOpen(true)}>
                  <Factory className="mr-1.5 h-4 w-4" /> Create MTO
                </Button>}
              </CardHeader>
              <CardContent>
                {manufacturingOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No manufacturing orders linked to this Sales Order.</p>
                ) : (
                  <div className="space-y-2">
                    {manufacturingOrders.map((mo) => (
                      <div key={mo.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
                        <a className="font-mono text-sm text-primary hover:underline" href={`/manufacturing/orders/${mo.id}`}>{mo.number}</a>
                        <span className="text-sm">{mo.qty_produced ?? 0} / {mo.quantity} produced</span>
                        <Badge variant="secondary">{mo.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="invoices" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Invoices</CardTitle>
              </CardHeader>
              <CardContent>
                {invoices.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-2">Invoice</th>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Due</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                          <th className="px-3 py-2 text-right">Paid</th>
                          <th className="px-3 py-2 text-right">Balance</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map((invoice) => (
                          <tr key={invoice.id} className="border-b last:border-0">
                            <td className="px-3 py-3 font-medium">
                              <a
                                className="text-primary hover:underline"
                                href={`/sales/invoices/${invoice.id}`}
                              >
                                {invoice.number ?? "Invoice"}
                              </a>
                            </td>
                            <td className="px-3 py-3">{dateFmt(invoice.date)}</td>
                            <td className="px-3 py-3">{dateFmt(invoice.due_date)}</td>
                            <td className="px-3 py-3 text-right font-mono">
                              {money(invoice.grand_total, currency)}
                            </td>
                            <td className="px-3 py-3 text-right font-mono">
                              {money(invoice.amount_paid, currency)}
                            </td>
                            <td className="px-3 py-3 text-right font-mono">
                              {money(
                                Math.max(
                                  0,
                                  Number(invoice.grand_total ?? 0) -
                                    Number(invoice.amount_paid ?? 0),
                                ),
                                currency,
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <Badge variant="secondary">{invoice.status ?? "Draft"}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No invoices have been created for this order.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="payments" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4 grid gap-3 sm:grid-cols-3">
                  <Info label="Order Total" value={money(order.grand_total, currency)} />
                  <Info label="Paid" value={money(paid, currency)} />
                  <Info label="Outstanding" value={money(outstanding, currency)} />
                </div>
                {payments.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Method</th>
                          <th className="px-3 py-2">Reference</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((payment) => (
                          <tr key={payment.id} className="border-b last:border-0">
                            <td className="px-3 py-3">{dateFmt(payment.payment_date)}</td>
                            <td className="px-3 py-3">{payment.mode ?? payment.method ?? "—"}</td>
                            <td className="px-3 py-3">{payment.reference ?? "—"}</td>
                            <td className="px-3 py-3 text-right font-mono">
                              {money(payment.amount, currency)}
                            </td>
                            <td className="px-3 py-3">
                              <PaymentBadge status={payment.status ?? "Recorded"} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No payments recorded.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="documents" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <AttachmentsPanel entityType="order" entityId={id} />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="activity" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Activity</CardTitle>
              </CardHeader>
              <CardContent>
                {events.length ? (
                  events.map((event) => (
                    <p key={event.id} className="border-b py-3 text-sm">
                      {event.note ?? event.status}
                      <br />
                      <span className="text-xs text-muted-foreground">
                        {dateTimeFmt(event.created_at)}
                      </span>
                    </p>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="audit" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Audit Trail</CardTitle>
              </CardHeader>
              <CardContent>
                {audit.length ? (
                  audit.map((entry) => (
                    <p key={entry.id} className="border-b py-3 text-sm">
                      {entry.action} · {entry.actor_email ?? "System"}
                    </p>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No audit activity yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="overview" className="mt-4">
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
              <OrderLines
                lines={lines}
                items={items}
                packageLines={packageLines}
                currency={currency}
                order={order}
                onEdit={() => setEditing(true)}
              />
              <aside className="flex flex-col gap-4">
                <SalesDocumentLineage
                  nodes={[
                    {
                      type: "Sales Order",
                      number: order.number,
                      status: currentStatus,
                      amount: order.grand_total,
                      currency,
                      date: order.date,
                      href: `/sales/orders/${id}`,
                    },
                    ...invoices.slice(0, 3).map((invoice) => ({
                      type: "Invoice",
                      number: invoice.number,
                      status: invoice.status,
                      amount: invoice.grand_total,
                      currency: invoice.currency ?? currency,
                      date: invoice.date,
                      href: `/sales/invoices/${invoice.id}`,
                    })),
                  ]}
                />
                <SideCard title="Order Status & Fulfillment">
                  <div className="space-y-2">
                    {ORDER_STAGES.map((stage, index) => (
                      <div
                        key={stage}
                        className={`flex items-center gap-2 text-xs ${stage === currentStatus ? "font-semibold text-foreground" : index < currentStage ? "text-muted-foreground" : "text-muted-foreground/60"}`}
                      >
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full border ${stage === currentStatus ? "border-primary bg-primary text-primary-foreground" : index < currentStage ? "border-primary/40 bg-primary/10 text-primary" : "border-muted-foreground/30"}`}
                        >
                          {index < currentStage ? <CheckCircle2 className="h-3 w-3" /> : index + 1}
                        </span>
                        {stage}
                        {stage === currentStatus && (
                          <Badge variant="outline" className="ml-auto">
                            Current
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex items-center justify-between text-sm">
                    <span>Fulfillment</span>
                    <strong>{Math.round(progress)}%</strong>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <p className="text-muted-foreground">Ordered</p>
                      <strong>{ordered}</strong>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Fulfilled</p>
                      <strong>{fulfilled}</strong>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Remaining</p>
                      <strong>{Math.max(0, ordered - fulfilled)}</strong>
                    </div>
                  </div>
                  <div className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                    {currentStatus === "Draft"
                      ? "Complete the order details before confirming."
                      : fulfillmentStatus === "Fulfilled"
                        ? "All ordered units have been fulfilled."
                        : "Order is ready for fulfillment."}
                  </div>
                </SideCard>
                <SideCard title="Activity">
                  {events.length ? (
                    events.slice(-5).map((event) => (
                      <p key={event.id} className="border-b py-2 text-xs">
                        {event.note ?? event.status}
                        <br />
                        <span className="text-muted-foreground">
                          {dateTimeFmt(event.created_at)}
                        </span>
                      </p>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No activity yet.</p>
                  )}
                </SideCard>
                <SideCard title="Notes">
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {order.notes || "No notes added."}
                  </p>
                </SideCard>
              </aside>
            </div>
          </TabsContent>
        </Tabs>
        <ManufacturingRequirementDialog
          open={mtoDialogOpen}
          onOpenChange={setMtoDialogOpen}
          orderId={id}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ["production_orders", "sales_order", id] });
          }}
        />
      </div>
      <CreateInvoiceFromOrderDialog
        open={invoiceDialogOpen}
        onOpenChange={setInvoiceDialogOpen}
        orderId={id}
        onCreated={(invoiceId) => nav({ to: `/sales/invoices/${invoiceId}` as never })}
      />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sales order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will hide the order from active lists.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => remove.mutate()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
