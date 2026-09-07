/**
 * DocViewPanel
 *
 * Matches the reference design:
 *   ┌──────────────────────────────────────────────────────┐
 *   │  ✏ Edit  | 📧 Mails ▾ | Share | 🖨 PDF/Print ▾ | Convert ▾ | ···  │
 *   ├──────────────────────────────────────────────────────┤
 *   │  [Quote Details]  [Activity]          [Details][PDF] │
 *   ├──────────────────────────────────────────────────────┤
 *   │  Q1956   Draft                                       │
 *   │  Total: KES 2,290.00                                  │
 *   │  ── header fields ──                                  │
 *   │  Customer Details                                     │
 *   │  Items table                                          │
 *   │  Totals                                               │
 *   └──────────────────────────────────────────────────────┘
 */
import { useState, useMemo, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pencil,
  Trash2,
  Mail,
  Share2,
  Printer,
  ChevronDown,
  MoreHorizontal,
  Loader2,
  Send,
  ArrowRight,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { DocumentEditor, type DocKind } from "@/components/document-editor";
import { DocumentTimeline } from "@/components/document-timeline";
import { buildDocumentPdf } from "@/lib/document-pdf";
import { downloadDocumentPdf } from "@/lib/document-pdf";
import { useDocumentBranding, type DocTemplateKind } from "@/hooks/use-document-branding";
import { db } from "@/lib/typed-db";
import type { TableName } from "@/lib/typed-db";
import { EmailDocumentDialog } from "@/components/email-document-dialog";
import { getDocumentTemplate } from "@/lib/document-template-types";

// ── Config ────────────────────────────────────────────────────────────────────

const DOC_CONFIG: Record<
  DocKind,
  {
    table: TableName;
    lines: TableName;
    label: string;
    tabLabel: string;
    partyField: "customer_id" | "supplier_id";
    partyTable: "customers" | "suppliers";
    partyLabel: string;
    listPath: string;
    dateField: string;
    extraDate: { field: string; label: string } | null;
    prefix: string;
    templateKind: DocTemplateKind;
    deletePermission: string;
    statuses: readonly string[];
    converts?: { label: string; action: string }[];
  }
> = {
  quote: {
    table: "sales_quotes",
    lines: "sales_quote_lines",
    label: "Quote",
    tabLabel: "Quote Details",
    partyField: "customer_id",
    partyTable: "customers",
    partyLabel: "Customer",
    listPath: "/sales/quotes",
    dateField: "date",
    extraDate: { field: "expiry", label: "Expiry Date" },
    prefix: "QT",
    templateKind: "quote",
    deletePermission: "sales.delete",
    statuses: ["Draft", "Sent", "Accepted", "Rejected", "Expired"],
    converts: [{ label: "Convert to Order", action: "convert_quote_to_order" }],
  },
  order: {
    table: "sales_orders",
    lines: "sales_order_lines",
    label: "Sales Order",
    tabLabel: "Order Details",
    partyField: "customer_id",
    partyTable: "customers",
    partyLabel: "Customer",
    listPath: "/sales/orders",
    dateField: "date",
    extraDate: null,
    prefix: "SO",
    templateKind: "order",
    deletePermission: "sales.delete",
    statuses: ["Draft", "Confirmed", "Processing", "Packed", "Shipped", "Delivered", "Invoiced", "Cancelled"],
    converts: [{ label: "Convert to Invoice", action: "convert_order_to_invoice" }],
  },
  invoice: {
    table: "invoices",
    lines: "invoice_lines",
    label: "Invoice",
    tabLabel: "Invoice Details",
    partyField: "customer_id",
    partyTable: "customers",
    partyLabel: "Customer",
    listPath: "/sales/invoices",
    dateField: "date",
    extraDate: { field: "due_date", label: "Due Date" },
    prefix: "INV",
    templateKind: "invoice",
    deletePermission: "sales.delete",
    statuses: ["Draft", "Sent", "Posted", "Paid", "Overdue", "Cancelled"],
  },
  credit_note: {
    table: "credit_notes",
    lines: "credit_note_lines",
    label: "Credit Note",
    tabLabel: "Credit Note Details",
    partyField: "customer_id",
    partyTable: "customers",
    partyLabel: "Customer",
    listPath: "/sales/credit-notes",
    dateField: "date",
    extraDate: null,
    prefix: "CN",
    templateKind: "credit_note",
    deletePermission: "sales.delete",
    statuses: ["Draft", "Issued", "Applied", "Void"],
  },
  requisition: {
    table: "purchase_requisitions",
    lines: "purchase_requisition_lines",
    label: "Requisition",
    tabLabel: "Requisition Details",
    partyField: "supplier_id",
    partyTable: "suppliers",
    partyLabel: "Supplier",
    listPath: "/purchasing/requisitions",
    dateField: "date",
    extraDate: { field: "required_date", label: "Required By" },
    prefix: "REQ",
    templateKind: "order",
    deletePermission: "purchasing.delete",
    statuses: ["Draft", "Submitted", "Approved", "Rejected", "Ordered", "Cancelled"],
    // No converts here — conversion is handled in the editor via ConvertReqToPoDialog
  },
  po: {
    table: "purchase_orders",
    lines: "purchase_order_lines",
    label: "Purchase Order",
    tabLabel: "PO Details",
    partyField: "supplier_id",
    partyTable: "suppliers",
    partyLabel: "Supplier",
    listPath: "/purchasing/orders",
    dateField: "date",
    extraDate: { field: "expected_date", label: "Expected Date" },
    prefix: "PO",
    templateKind: "order",
    deletePermission: "purchasing.delete",
    statuses: ["Draft", "Confirmed", "Processing", "Delivered", "Billed", "Cancelled"],
    converts: [{ label: "Convert to Bill", action: "convert_po_to_bill" }],
  },
  bill: {
    table: "bills",
    lines: "bill_lines",
    label: "Bill",
    tabLabel: "Bill Details",
    partyField: "supplier_id",
    partyTable: "suppliers",
    partyLabel: "Supplier",
    listPath: "/purchasing/bills",
    dateField: "date",
    extraDate: { field: "due_date", label: "Due Date" },
    prefix: "BILL",
    templateKind: "invoice",
    deletePermission: "purchasing.delete",
    statuses: ["Pending", "Posted", "Paid", "Overdue", "Cancelled"],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-600 border-slate-300",
  Sent: "bg-blue-50 text-blue-700 border-blue-300",
  Accepted: "bg-emerald-50 text-emerald-700 border-emerald-300",
  Approved: "bg-emerald-50 text-emerald-700 border-emerald-300",
  Rejected: "bg-red-50 text-red-700 border-red-300",
  Expired: "bg-orange-50 text-orange-700 border-orange-300",
  Confirmed: "bg-blue-50 text-blue-700 border-blue-300",
  Processing: "bg-blue-50 text-blue-700 border-blue-300",
  Posted: "bg-emerald-50 text-emerald-700 border-emerald-300",
  Paid: "bg-emerald-50 text-emerald-700 border-emerald-300",
  Overdue: "bg-orange-50 text-orange-700 border-orange-300",
  Cancelled: "bg-red-50 text-red-700 border-red-300",
  Voided: "bg-red-50 text-red-700 border-red-300",
  Submitted: "bg-blue-50 text-blue-700 border-blue-300",
  Ordered: "bg-violet-50 text-violet-700 border-violet-300",
  Pending: "bg-slate-100 text-slate-600 border-slate-300",
};

const money = (n: number | null | undefined, currency = "USD") =>
  `${currency} ${(Number(n) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtDate = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
};

function getInvoicePaymentState(doc: Record<string, any>) {
  const total = Number(doc?.grand_total ?? 0);
  const paid = Number(doc?.amount_paid ?? 0);
  const outstanding = Math.max(0, total - paid);
  const isOverdue = Number(outstanding) > 0 && doc?.due_date && new Date(doc.due_date) < new Date();

  if (outstanding <= 0.01) return { label: "Paid", tone: "bg-emerald-50 text-emerald-700 border-emerald-200", pct: 100, outstanding };
  if (paid > 0) return { label: "Partially Paid", tone: "bg-amber-50 text-amber-700 border-amber-200", pct: total > 0 ? (paid / total) * 100 : 0, outstanding };
  if (isOverdue) return { label: "Overdue", tone: "bg-red-50 text-red-700 border-red-200", pct: 0, outstanding };
  return { label: "Unpaid", tone: "bg-slate-100 text-slate-700 border-slate-200", pct: 0, outstanding };
}

function InvoiceOverviewView({ id }: { id: string }) {
  const { tenant, can } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"overview" | "payments" | "documents" | "activity">("overview");
  const [editing, setEditing] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoices", id, "invoice-overview"],
    queryFn: async () => {
      const { data, error } = await db.from("invoices").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as Record<string, any> | null;
    },
  });

  const { data: lines = [] } = useQuery({
    queryKey: ["invoice_lines", id, "invoice-overview"],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db.from("invoice_lines").select("*").eq("document_id", id).is("deleted_at", null).order("line_no");
      if (error) throw error;
      return (data ?? []) as Record<string, any>[];
    },
  });

  const itemIds = useMemo(() => Array.from(new Set(lines.map((line) => line.item_id).filter(Boolean))), [lines]);
  const { data: items = [] } = useQuery({
    queryKey: ["items", "invoice-overview", itemIds],
    enabled: itemIds.length > 0,
    queryFn: async () => {
      const { data, error } = await db.from("items").select("id,name,sku").in("id", itemIds).is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as Record<string, any>[];
    },
  });

  const { data: customer } = useQuery({
    queryKey: ["customers", invoice?.customer_id],
    enabled: !!invoice?.customer_id,
    queryFn: async () => {
      const { data, error } = await db.from("customers").select("* ").eq("id", invoice.customer_id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as Record<string, any> | null;
    },
  });

  const { data: salesperson } = useQuery({
    queryKey: ["profiles", invoice?.created_by],
    enabled: !!invoice?.created_by,
    queryFn: async () => {
      const { data, error } = await db.from("profiles").select("full_name,email").eq("id", invoice.created_by).maybeSingle();
      if (error) throw error;
      return (data ?? null) as Record<string, any> | null;
    },
  });

  const { data: sourceOrder } = useQuery({
    queryKey: ["sales_orders", invoice?.source_order_id],
    enabled: !!invoice?.source_order_id,
    queryFn: async () => {
      const { data, error } = await db.from("sales_orders").select("id,number").eq("id", invoice.source_order_id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as Record<string, any> | null;
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["payments_received", id],
    enabled: !!invoice?.id,
    queryFn: async () => {
      const { data, error } = await db.from("payments_received").select("*").eq("invoice_id", id).is("deleted_at", null).order("payment_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Record<string, any>[];
    },
  });

  const { data: events = [] } = useDocumentEvents("invoice", id);
  const { data: audit = [] } = useQuery({
    queryKey: ["audit_logs", "invoices", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db.from("audit_logs").select("*").eq("table_name", "invoices").eq("record_id", id).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as Record<string, any>[];
    },
  });

  const canWrite = can(["sales.create", "sales.update", "accounting.journal.create", "accounting.journal.update"]);
  const canRecordPayment = can(["payments.create", "payments.post"]);
  const canDelete = can(["sales.delete", "admin"]);

  if (isLoading) return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Loading invoice…</div>;
  if (!invoice) return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Invoice not found.</div>;

  const currency = invoice.currency ?? tenant?.currency_symbol ?? tenant?.currency ?? "KES";
  const invoiceTotal = Number(invoice.grand_total ?? 0);
  const paid = Number(invoice.amount_paid ?? 0);
  const outstanding = Math.max(0, invoiceTotal - paid);
  const paymentState = getInvoicePaymentState(invoice);
  const progress = invoiceTotal > 0 ? Math.min(100, (paid / invoiceTotal) * 100) : 0;

  const totals = {
    subtotal: Number(invoice.subtotal ?? 0),
    discount: Number(invoice.discount_total ?? 0),
    tax: Number(invoice.tax_total ?? 0),
    total: invoiceTotal,
  };

  const tabOptions = [
    { key: "overview", label: "Overview" },
    { key: "payments", label: "Payments" },
    { key: "documents", label: "Documents" },
    { key: "activity", label: "Activity" },
  ] as const;

  const headerTitle = invoice.number ?? "Invoice";

  return (
    <div className="min-h-full bg-muted/20 p-4 md:p-6">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">{headerTitle}</h1>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${paymentState.tone}`}>
                  {paymentState.label}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
                <span><span className="font-medium text-foreground">Customer</span> {customer?.name ?? "—"}</span>
                <span><span className="font-medium text-foreground">Invoice Date</span> {fmtDate(invoice.date)}</span>
                <span><span className="font-medium text-foreground">Due Date</span> {fmtDate(invoice.due_date)}</span>
                <span><span className="font-medium text-foreground">Salesperson</span> {salesperson?.full_name ?? "—"}</span>
              </div>
              {sourceOrder && (
                <div className="mt-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Order</span> {sourceOrder.number}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <Button variant="outline" size="sm" onClick={() => downloadDocumentPdf({
              title: "Invoice",
              number: String(invoice.number ?? ""),
              companyName: tenant?.name ?? "Company",
              partyLabel: "Customer",
              partyName: customer?.name ?? "—",
              currency,
              meta: [
                { label: "Invoice Date", value: fmtDate(invoice.date) },
                { label: "Due Date", value: fmtDate(invoice.due_date) },
                { label: "Status", value: String(invoice.status ?? paymentState.label) },
              ],
              lines: lines.map((line) => ({
                description: line.description ?? "",
                quantity: Number(line.quantity ?? 0),
                unit_price: Number(line.unit_price ?? 0),
                discount_pct: Number(line.discount_pct ?? 0),
                tax_pct: Number(line.tax_pct ?? 0),
                line_total: Number(line.line_total ?? 0),
              })),
              totals: { subtotal: totals.subtotal, discount_total: totals.discount, tax_total: totals.tax, grand_total: totals.total },
              branding: { primaryColor: "#2563eb", logoUrl: "" },
              notes: invoice.notes ?? null,
            })}>
              <Download className="mr-1.5 h-4 w-4" /> Download PDF
            </Button>
            {canRecordPayment && outstanding > 0 && (
              <Button variant="default" size="sm" onClick={() => setPayOpen(true)}>
                <DollarSign className="mr-1.5 h-4 w-4" /> Record Payment
              </Button>
            )}
            {canWrite && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="mr-1.5 h-4 w-4" /> Edit
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  More
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => window.print()}>
                  <Printer className="mr-2 h-4 w-4" /> Print
                </DropdownMenuItem>
                {canDelete && (
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete Invoice
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Invoice Total", value: `${currency} ${Number(invoiceTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: FileText },
            { label: "Amount Paid", value: `${currency} ${Number(paid).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, sub: `${Math.round(progress)}%`, icon: CheckCircle2 },
            { label: "Outstanding", value: `${currency} ${Number(outstanding).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, sub: paymentState.label === "Paid" ? "Fully Paid" : paymentState.label, icon: Wallet },
            { label: "Status", value: paymentState.label, icon: Receipt },
          ].map((kpi) => (
            <Card key={kpi.label} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className="mt-1 truncate font-mono text-lg font-semibold tabular-nums">{kpi.value}</p>
                  {kpi.sub && <p className="mt-1 text-[11px] text-muted-foreground">{kpi.sub}</p>}
                </div>
                <kpi.icon className="h-4 w-4 shrink-0 text-primary" />
              </div>
            </Card>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border bg-background">
          <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 p-2">
            {tabOptions.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${tab === item.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div className="grid items-start gap-4 p-4 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
              <div className="space-y-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <CardTitle className="text-sm">Line Items</CardTitle>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{lines.length} items</span>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] text-sm">
                        <thead>
                          <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                            <th className="px-4 py-3 text-left">#</th>
                            <th className="px-4 py-3 text-left">Item / SKU</th>
                            <th className="px-4 py-3 text-left">Description</th>
                            <th className="px-4 py-3 text-right">Qty</th>
                            <th className="px-4 py-3 text-right">Unit Price</th>
                            <th className="px-4 py-3 text-right">Discount</th>
                            <th className="px-4 py-3 text-right">Tax</th>
                            <th className="px-4 py-3 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.length === 0 ? (
                            <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">No line items on this invoice.</td></tr>
                          ) : lines.map((line, index) => {
                            const item = items.find((candidate) => candidate.id === line.item_id);
                            return (
                              <tr key={line.id ?? index} className="border-b last:border-0">
                                <td className="px-4 py-3 text-muted-foreground">{index + 1}</td>
                                <td className="px-4 py-3">
                                  <div className="font-medium">{item?.name ?? line.description ?? "Item"}</div>
                                  <div className="text-[11px] text-muted-foreground">{item?.sku ?? "No SKU"}</div>
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">{line.description ?? "—"}</td>
                                <td className="px-4 py-3 text-right">{Number(line.quantity ?? 0)}</td>
                                <td className="px-4 py-3 text-right font-mono text-xs">{currency} {Number(line.unit_price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="px-4 py-3 text-right">{Number(line.discount_pct ?? 0)}%</td>
                                <td className="px-4 py-3 text-right">{Number(line.tax_pct ?? 0)}%</td>
                                <td className="px-4 py-3 text-right font-mono font-medium">{currency} {Number(line.line_total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-col gap-3 border-t bg-muted/10 p-4 md:items-end">
                      <div className="grid w-full max-w-xs gap-2 text-sm md:ml-auto">
                        <TotalRow label="Subtotal" value={`${currency} ${totals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                        <TotalRow label="Discount" value={`${currency} ${totals.discount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                        <TotalRow label="Tax" value={`${currency} ${totals.tax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                        <div className="border-t pt-2">
                          <TotalRow label="Grand Total" value={`${currency} ${totals.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} bold />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <aside className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Payment Status</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${paymentState.tone}`}>{paymentState.label}</span>
                      <span className="font-mono text-xs text-muted-foreground">{Math.round(progress)}% paid</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
                    </div>
                    <div className="space-y-2 text-sm">
                      <TotalRow label="Invoice Total" value={`${currency} ${totals.total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} />
                      <TotalRow label="Amount Paid" value={`${currency} ${paid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                      <TotalRow label="Outstanding" value={`${currency} ${outstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                    </div>
                    <div className="space-y-2 border-t pt-3 text-xs text-muted-foreground">
                      {payments.length ? payments.map((payment) => (
                        <div key={payment.id} className="flex items-start justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
                          <div>
                            <div className="font-medium text-foreground">{payment.mode ?? "Payment"}</div>
                            <div>{fmtDate(payment.payment_date)}</div>
                          </div>
                          <div className="font-mono text-foreground">{currency} {Number(payment.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        </div>
                      )) : (
                        <div className="space-y-2">
                          <p>No payments recorded.</p>
                          {canRecordPayment && outstanding > 0 && <Button variant="secondary" size="sm" className="w-full" onClick={() => setPayOpen(true)}>Record Payment</Button>}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Activity</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {events.length ? events.slice(-5).reverse().map((event) => (
                      <div key={event.id} className="flex gap-2 border-b pb-2 last:border-0 last:pb-0">
                        <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                        <div>
                          <p className="text-sm font-medium">{event.note ?? event.status}</p>
                          <p className="text-[11px] text-muted-foreground">{fmtDate(event.created_at)} · {event.actor_email ?? "System"}</p>
                        </div>
                      </div>
                    )) : <p className="text-sm text-muted-foreground">No activity yet.</p>}
                    <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setTab("activity")}>View All</Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <CardTitle className="text-sm">Notes</CardTitle>
                    {canWrite && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /></Button>}
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{invoice.notes || "No notes added."}</p>
                  </CardContent>
                </Card>
              </aside>
            </div>
          )}

          {tab === "payments" && (
            <div className="p-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-sm">Payments</CardTitle>
                  {canRecordPayment && outstanding > 0 && <Button variant="secondary" size="sm" onClick={() => setPayOpen(true)}>Record Payment</Button>}
                </CardHeader>
                <CardContent>
                  {payments.length ? (
                    <div className="overflow-x-auto"><table className="w-full text-sm"><thead>...</thead><tbody>...</tbody></table></div>
                  ) : <div className="rounded border border-dashed p-6 text-sm text-muted-foreground">No payments recorded.</div>}
                </CardContent>
              </Card>
            </div>
          )}

          {tab === "documents" && (
            <div className="p-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Documents</CardTitle></CardHeader>
                <CardContent>
                  <AttachmentsPanel entityType="invoice" entityId={id} />
                </CardContent>
              </Card>
            </div>
          )}

          {tab === "activity" && (
            <div className="p-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-sm">Activity</CardTitle>
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setTab("overview")}>Back</Button>
                </CardHeader>
                <CardContent>
                  <DocumentTimeline entityType="invoice" entityId={id} stages={["Draft", "Sent", "Posted", "Paid", "Overdue", "Cancelled"]} currentStage={invoice.status ?? "Draft"} />
                </CardContent>
              </Card>
            </div>
          )}

        </div>
      </div>

      {payOpen && (
        <RecordPaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          kind="receive"
          docId={id}
          docNumber={invoice.number}
          partyId={invoice.customer_id}
          balanceDue={outstanding}
          currency={currency}
        />
      )}

      {deleteOpen && (
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete invoice?</AlertDialogTitle>
              <AlertDialogDescription>This will remove the invoice and its lines.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => { qc.invalidateQueries({ queryKey: ["invoices"] }); setDeleteOpen(false); }}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {editing && <DocumentEditor kind="invoice" id={id} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); qc.invalidateQueries({ queryKey: ["invoices", id] }); qc.invalidateQueries({ queryKey: ["invoice_lines", id] }); }} />}
    </div>
  );
}

// ── DetailsView ───────────────────────────────────────────────────────────────

function DetailsView({ kind, id }: { kind: DocKind; id: string }) {
  const cfg = DOC_CONFIG[kind];
  const { tenant } = useAuth();
  const isReq = kind === "requisition";

  const { data: doc, isLoading: loadingDoc } = useQuery({
    queryKey: [cfg.table, id, "full"],
    queryFn: async () => {
      const { data } = await db.from(cfg.table).select("*").eq("id", id).maybeSingle();
      return data as Record<string, any> | null;
    },
  });

  const { data: lines = [], isLoading: loadingLines } = useQuery({
    queryKey: [cfg.lines, id, "view"],
    queryFn: async () => {
      const { data } = await db
        .from(cfg.lines)
        .select("*")
        .eq("document_id", id)
        .is("deleted_at", null)
        .order("line_no");
      return (data ?? []) as Record<string, any>[];
    },
  });

  // Party details — skip for requisitions (no supplier on a requisition)
  const { data: party } = useQuery({
    queryKey: [cfg.partyTable, "detail-view", doc?.[cfg.partyField]],
    enabled: !isReq && !!doc?.[cfg.partyField],
    queryFn: async () => {
      const { data } = await db
        .from(cfg.partyTable)
        .select("id,name,email,phone,billing_address,shipping_address")
        .eq("id", doc![cfg.partyField])
        .maybeSingle();
      return data as Record<string, any> | null;
    },
  });

  // Source quote lookup — for Sales Orders that were created from a Quote
  const sourceQuoteId = kind === "order" ? (doc?.source_quote_id ?? null) : null;
  const { data: sourceQuote } = useQuery({
    queryKey: ["sales_quotes", "source-quote", sourceQuoteId],
    enabled: !!sourceQuoteId,
    queryFn: async () => {
      const { data } = await db.from("sales_quotes").select("id, number").eq("id", sourceQuoteId!).maybeSingle();
      return data as { id: string; number: string | null } | null;
    },
  });

  // Source order lookup — for Invoices that were created from a Sales Order
  const sourceOrderId = kind === "invoice" ? (doc?.source_order_id ?? null) : null;
  const { data: sourceOrder } = useQuery({
    queryKey: ["sales_orders", "source-order", sourceOrderId],
    enabled: !!sourceOrderId,
    queryFn: async () => {
      const { data } = await db.from("sales_orders").select("id, number").eq("id", sourceOrderId!).maybeSingle();
      return data as { id: string; number: string | null } | null;
    },
  });

  // Warehouse name lookup for stock requisitions
  const { data: warehouseDoc } = useQuery({
    queryKey: ["warehouses", "detail-view", doc?.from_warehouse_id],
    enabled: isReq && !!doc?.from_warehouse_id,
    queryFn: async () => {
      const { data } = await db
        .from("warehouses")
        .select("id,name,code")
        .eq("id", doc!.from_warehouse_id)
        .maybeSingle();
      return data as Record<string, any> | null;
    },
  });

  if (loadingDoc || loadingLines) {
    return (
      <div className="flex h-48 items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">Document not found.</div>
    );
  }

  if (kind === "invoice") {
    return <InvoiceOverviewView id={id} />;
  }

  const currency = doc.currency ?? "USD";
  const subtotal = Number(doc.subtotal ?? 0);
  const discountTotal = Number(doc.discount_total ?? 0);
  const taxTotal = Number(doc.tax_total ?? 0);
  const grandTotal = Number(doc.grand_total ?? doc.amount ?? 0);
  const statusColor = STATUS_COLORS[doc.status] ?? "bg-slate-100 text-slate-600 border-slate-300";

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* ── Document header ── */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-2xl font-bold tracking-tight">{doc.number ?? "—"}</h2>
          {doc.status && (
            <span className={`rounded border px-2.5 py-0.5 text-xs font-semibold ${statusColor}`}>{doc.status}</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">Total: {money(grandTotal, currency)}</p>
      </div>

      {/* ── Meta fields grid ── */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 rounded-lg border bg-muted/20 px-5 py-4">
        <MetaRow label={`${cfg.label} Number`} value={doc.number} />
        <MetaRow label={`${cfg.label} Date`} value={fmtDate(doc[cfg.dateField])} />
        <MetaRow label="Creation Date" value={fmtDate(doc.created_at)} />
        {cfg.extraDate && <MetaRow label={cfg.extraDate.label} value={fmtDate(doc[cfg.extraDate.field])} />}
        {doc.notes && <MetaRow label="Reference / Notes" value={String(doc.notes)} />}
        <MetaRow label="Currency" value={currency} />
        {doc.payment_terms && <MetaRow label="Payment Terms" value={String(doc.payment_terms)} />}
        {/* Requisition-specific meta */}
        {isReq && doc.requisition_type && (
          <MetaRow
            label="Requisition Type"
            value={doc.requisition_type === "stock" ? "Stock Requisition" : "Purchase Requisition"}
          />
        )}
        {isReq && warehouseDoc && (
          <MetaRow
            label="From Warehouse"
            value={warehouseDoc.code ? `${warehouseDoc.code} — ${warehouseDoc.name}` : warehouseDoc.name}
          />
        )}
        {isReq && doc.department && <MetaRow label="Department" value={String(doc.department)} />}
        {isReq && doc.requested_by && <MetaRow label="Requested By" value={String(doc.requested_by)} />}
        {isReq && doc.converted_po_id && <MetaRow label="Converted PO" value="See Purchase Orders" />}
        {/* Source document links */}
        {kind === "order" && sourceQuote && (
          <div className="col-span-2 flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Source Quote</span>
            <Link
              to={`/sales/quotes/${sourceQuote.id}` as any}
              className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              {sourceQuote.number || "Quote"}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        )}
        {kind === "invoice" && sourceOrder && (
          <div className="col-span-2 flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Source Sales Order</span>
            <Link
              to={`/sales/orders/${sourceOrder.id}` as any}
              className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              {sourceOrder.number || "Sales Order"}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>

      {/* ── Party details (hidden for requisitions) ── */}
      {!isReq && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {cfg.partyLabel} Details
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Name</p>
              <p className="font-medium text-sm">{party?.name ?? "—"}</p>
            </div>
            {party?.email && (
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Email</p>
                <p className="text-sm">{party.email}</p>
              </div>
            )}
            {party?.phone && (
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Phone</p>
                <p className="text-sm">{party.phone}</p>
              </div>
            )}
            {party?.billing_address && (
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Billing Address</p>
                <p className="text-sm whitespace-pre-line">{party.billing_address}</p>
              </div>
            )}
            {party?.shipping_address && (
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Shipping Address</p>
                <p className="text-sm whitespace-pre-line">{party.shipping_address}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Items table ── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Items</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {lines.length}
          </span>
        </div>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b">
                <th className="px-4 py-2.5 text-left w-8">S.NO</th>
                <th className="px-4 py-2.5 text-left">Item</th>
                <th className="px-4 py-2.5 text-right w-20">QTY</th>
                <th className="px-4 py-2.5 text-right w-28">Price</th>
                <th className="px-4 py-2.5 text-right w-24">Discount</th>
                <th className="px-4 py-2.5 text-right w-28">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No line items.
                  </td>
                </tr>
              )}
              {lines.map((l, i) => (
                <tr key={l.id ?? i} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{i + 1}</td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-primary text-sm leading-tight">{l.description || "—"}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums">{l.quantity ?? 0}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
                    {money(l.unit_price, currency)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums text-muted-foreground">
                    {l.discount_pct ? `${l.discount_pct}%` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums font-medium">
                    {money(l.line_total, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Totals ── */}
      <div className="flex justify-end">
        <div className="w-full max-w-xs space-y-2 rounded-lg border bg-muted/20 px-5 py-4">
          <TotalsRow label="Sub Total (Tax Inclusive)" value={money(subtotal, currency)} />
          {discountTotal > 0 && <TotalsRow label="Discount" value={`− ${money(discountTotal, currency)}`} muted />}
          {taxTotal > 0 && <TotalsRow label="Tax" value={money(taxTotal, currency)} muted />}
          <div className="border-t pt-2">
            <TotalsRow label="Total" value={money(grandTotal, currency)} bold />
          </div>
          {doc.amount_paid != null && doc.amount_paid > 0 && (
            <>
              <TotalsRow label="Amount Paid" value={money(doc.amount_paid, currency)} muted />
              <TotalsRow
                label="Balance Due"
                value={money(doc.balance_due ?? doc.balance ?? 0, currency)}
                bold
                accent={Number(doc.balance_due ?? doc.balance ?? 0) > 0 ? "text-destructive" : "text-emerald-600"}
              />
            </>
          )}
        </div>
      </div>

      {/* ── Notes ── */}
      {doc.notes && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Notes</h3>
          <p className="text-sm text-muted-foreground whitespace-pre-line rounded border bg-muted/20 px-4 py-3">
            {doc.notes}
          </p>
        </section>
      )}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

function TotalsRow({
  label,
  value,
  bold,
  muted,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  accent?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={`text-sm ${muted ? "text-muted-foreground" : ""} ${bold ? "font-semibold" : ""}`}>{label}</span>
      <span
        className={`font-mono text-sm tabular-nums ${bold ? "font-bold" : ""} ${accent ?? ""} ${muted ? "text-muted-foreground" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

// ── PdfPreview ────────────────────────────────────────────────────────────────

function PdfPreview({ kind, id }: { kind: DocKind; id: string }) {
  const cfg = DOC_CONFIG[kind];
  const { tenant } = useAuth();
  const { branding } = useDocumentBranding(cfg.templateKind);

  const { data: doc } = useQuery({
    queryKey: [cfg.table, id, "full"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await db.from(cfg.table).select("*").eq("id", id).maybeSingle();
      return data as Record<string, any> | null;
    },
  });

  const { data: lines = [] } = useQuery({
    queryKey: [cfg.lines, id, "view"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await db
        .from(cfg.lines)
        .select("*")
        .eq("document_id", id)
        .is("deleted_at", null)
        .order("line_no");
      return (data ?? []) as Record<string, any>[];
    },
  });

  const { data: party } = useQuery({
    queryKey: [cfg.partyTable, "detail-view", doc?.[cfg.partyField]],
    enabled: !!doc?.[cfg.partyField],
    queryFn: async () => {
      const { data } = await db
        .from(cfg.partyTable)
        .select("id,name,email")
        .eq("id", doc![cfg.partyField])
        .maybeSingle();
      return data as Record<string, any> | null;
    },
  });

  const pdfUri = useMemo(() => {
    if (!doc) return null;
    const totals = {
      subtotal: Number(doc.subtotal ?? 0),
      discount_total: Number(doc.discount_total ?? 0),
      tax_total: Number(doc.tax_total ?? 0),
      grand_total: Number(doc.grand_total ?? doc.amount ?? 0),
    };
    const meta: { label: string; value: string }[] = [
      { label: "Date", value: fmtDate(doc[cfg.dateField]) },
      ...(cfg.extraDate ? [{ label: cfg.extraDate.label, value: fmtDate(doc[cfg.extraDate.field]) }] : []),
      { label: "Status", value: String(doc.status ?? "") },
    ];
    try {
      const pdf = buildDocumentPdf({
        title: cfg.label,
        number: String(doc.number ?? ""),
        companyName: tenant?.name ?? "Company",
        partyLabel: cfg.partyLabel,
        partyName: String(party?.name ?? "—"),
        currency: String(doc.currency ?? "USD"),
        meta,
        lines: lines.map((l) => ({
          description: l.description || "",
          quantity: Number(l.quantity ?? 0),
          unit_price: Number(l.unit_price ?? 0),
          discount_pct: Number(l.discount_pct ?? 0),
          tax_pct: Number(l.tax_pct ?? 0),
          line_total: Number(l.line_total ?? 0),
        })),
        totals,
        branding,
        notes: doc.notes ?? null,
      });
      return pdf.output("datauristring");
    } catch {
      return null;
    }
  }, [doc, lines, party, branding, cfg, tenant]);

  if (!doc) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!pdfUri) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Could not render PDF preview.
      </div>
    );
  }

  const templateName = {
    modern: "Nimbus Modern",
    corporate: "Nimbus Corporate",
    compact: "Nimbus Compact",
  }[getDocumentTemplate(kind as any)];
  return (
    <div className="flex h-full min-h-[600px] flex-col">
      <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span>Document Preview</span>
        <span>Template: <strong className="text-foreground">{templateName}</strong></span>
      </div>
      <iframe
        src={pdfUri}
        title={`${cfg.label} PDF Preview`}
        className="min-h-0 w-full flex-1 border-0"
      />
    </div>
  );
}

// ── DocViewPanel ──────────────────────────────────────────────────────────────

type TabType = "details" | "activity";
type ViewMode = "details" | "pdf";

interface DocViewPanelProps {
  kind: DocKind;
  id: string;
  embedded?: boolean;
  onClose?: () => void;
  onSaved?: (id: string) => void;
}

export function DocViewPanel({ kind, id, embedded = false, onClose, onSaved }: DocViewPanelProps) {
  const cfg = DOC_CONFIG[kind];
  const nav = useNavigate();
  const qc = useQueryClient();
  const { can, tenant, user, profile } = useAuth();
  const { branding } = useDocumentBranding(cfg.templateKind);
  const isNew = id === "new";

  const [tab, setTab] = useState<TabType>("details");
  const [viewMode, setViewMode] = useState<ViewMode>("details");
  const [editMode, setEditMode] = useState(isNew);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const canDelete = can([cfg.deletePermission, "admin"]);
  const permModule = kind === "po" || kind === "bill" || kind === "requisition" ? "purchasing" : "sales";
  const canWrite = can([`${permModule}.create`, `${permModule}.update`]);

  // Fetch lightweight header doc
  const { data: doc } = useQuery({
    queryKey: [cfg.table, id],
    enabled: !isNew,
    queryFn: async () => {
      const { data } = await db
        .from(cfg.table)
        .select("number,status,posted_at,grand_total,amount,currency,notes")
        .eq("id", id)
        .maybeSingle();
      return data as Record<string, any> | null;
    },
  });

  // Fetch lines for PDF download
  const { data: lines = [] } = useQuery({
    queryKey: [cfg.lines, id, "view"],
    enabled: !isNew,
    queryFn: async () => {
      const { data } = await db
        .from(cfg.lines)
        .select("*")
        .eq("document_id", id)
        .is("deleted_at", null)
        .order("line_no");
      return (data ?? []) as Record<string, any>[];
    },
  });

  const { data: party } = useQuery({
    queryKey: [cfg.partyTable, "detail-view", doc?.customer_id ?? doc?.supplier_id],
    enabled: !isNew && !!(doc?.customer_id ?? doc?.supplier_id),
    queryFn: async () => {
      const partyId = doc?.customer_id ?? doc?.supplier_id;
      const { data } = await db.from(cfg.partyTable).select("id,name,email").eq("id", partyId).maybeSingle();
      return data as Record<string, any> | null;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (doc?.posted_at) throw new Error("Posted documents cannot be deleted. Use Void & Reverse instead.");
      const { error } = await supabase
        .from(cfg.table as any)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      await supabase
        .from(cfg.lines as any)
        .update({ deleted_at: new Date().toISOString() })
        .eq("document_id", id);
    },
    onSuccess: () => {
      toast.success(`${cfg.label} deleted`);
      qc.invalidateQueries({ queryKey: [cfg.table] });
      setDeleteOpen(false);
      if (embedded && onClose) onClose();
      else nav({ to: cfg.listPath as any });
    },
    onError: (e: Error) => toast.error(e.message ?? "Delete failed"),
  });

  const buildPdfInput = () => ({
    title: cfg.label,
    number: String(doc?.number ?? ""),
    companyName: tenant?.name ?? "Company",
    partyLabel: cfg.partyLabel,
    partyName: String(party?.name ?? "—"),
    currency: String(doc?.currency ?? "USD"),
    meta: [
      { label: "Date", value: fmtDate(doc?.[cfg.dateField]) },
      ...(cfg.extraDate ? [{ label: cfg.extraDate.label, value: fmtDate(doc?.[cfg.extraDate.field]) }] : []),
      { label: "Status", value: String(doc?.status ?? "") },
    ],
    lines: lines.map((l) => ({
      description: l.description || "",
      quantity: Number(l.quantity ?? 0),
      unit_price: Number(l.unit_price ?? 0),
      discount_pct: Number(l.discount_pct ?? 0),
      tax_pct: Number(l.tax_pct ?? 0),
      line_total: Number(l.line_total ?? 0),
    })),
    totals: {
      subtotal: Number(doc?.subtotal ?? 0),
      discount_total: Number(doc?.discount_total ?? 0),
      tax_total: Number(doc?.tax_total ?? 0),
      grand_total: Number(doc?.grand_total ?? doc?.amount ?? 0),
    },
    branding,
    notes: doc?.notes ?? null,
  });

  // If new doc or explicitly in edit mode, show the editor full-screen
  if (editMode || isNew) {
    return (
      <div className="flex min-h-full w-full flex-col">
        <DocumentEditor
          kind={kind}
          id={id}
          embedded={embedded}
          onClose={() => {
            if (isNew) {
              if (onClose) onClose();
              else nav({ to: cfg.listPath as any });
            } else {
              setEditMode(false);
            }
          }}
          onSaved={(newId) => {
            if (isNew) {
              if (onSaved) onSaved(newId);
              else nav({ to: `${cfg.listPath}/${newId}` as any });
            } else {
              setEditMode(false);
              qc.invalidateQueries({ queryKey: [cfg.table, id] });
              qc.invalidateQueries({ queryKey: [cfg.lines, id] });
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* ══ Action bar ══════════════════════════════════════════════════════════ */}
      <div className="flex shrink-0 items-center gap-1.5 border-b px-4 py-2 bg-background">
        {/* Edit */}
        {canWrite && !doc?.posted_at && (
          <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => setEditMode(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        )}

        {/* Divider */}
        <div className="h-5 w-px bg-border mx-0.5" />

        {kind === "invoice" && can(["payments.create", "payments.post"]) && Number(doc?.balance_due ?? doc?.grand_total ?? 0) > 0.001 && (
          <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => setPayOpen(true)}>
            <DollarSign className="h-3.5 w-3.5" />
            Record Payment
          </Button>
        )}

        {/* Mails */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              Mails
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setEmailOpen(true)}>
              <Send className="mr-2 h-3.5 w-3.5" /> Send by Email
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Share */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => {
            navigator.clipboard?.writeText(window.location.href);
            toast.success("Link copied");
          }}
        >
          <Share2 className="h-3.5 w-3.5" />
          Share
        </Button>

        {/* PDF / Print */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5">
              <Printer className="h-3.5 w-3.5" />
              PDF/Print
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => downloadDocumentPdf(buildPdfInput())}>Download PDF</DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setTab("details");
                setViewMode("pdf");
              }}
            >
              Preview PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Convert (if available) */}
        {cfg.converts && cfg.converts.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5">
                <ArrowRight className="h-3.5 w-3.5" />
                Convert
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {cfg.converts.map((c) => (
                <DropdownMenuItem key={c.action}>{c.label}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* More */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 px-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canDelete && !doc?.posted_at && (
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete {cfg.label}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ══ Tabs + Details|PDF toggle ════════════════════════════════════════════ */}
      <div className="flex shrink-0 items-center justify-between border-b px-4 bg-background">
        {/* Tabs */}
        <div className="flex items-center gap-0">
          <TabBtn active={tab === "details"} onClick={() => setTab("details")}>
            {cfg.tabLabel}
          </TabBtn>
          <TabBtn
            active={tab === "activity"}
            onClick={() => {
              setTab("activity");
              setViewMode("details");
            }}
          >
            Activity
          </TabBtn>
        </div>

        {/* Details | PDF segmented pill — only on "details" tab */}
        {tab === "details" && (
          <div className="flex items-center rounded-md border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("details")}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === "details"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Details
            </button>
            <button
              type="button"
              onClick={() => setViewMode("pdf")}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === "pdf"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              PDF
            </button>
          </div>
        )}
      </div>

      {/* ══ Content ══════════════════════════════════════════════════════════════ */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "activity" ? (
          <div className="p-6 max-w-2xl">
            <DocumentTimeline
              entityType={kind}
              entityId={id}
              stages={[...cfg.statuses]}
              currentStage={doc?.status ?? null}
            />
          </div>
        ) : viewMode === "pdf" ? (
          <PdfPreview kind={kind} id={id} />
        ) : (
          <DetailsView kind={kind} id={id} />
        )}
      </div>

      {/* ══ Delete confirmation ══════════════════════════════════════════════════ */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {cfg.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <span className="font-semibold">{doc?.number ?? cfg.label}</span> and all its
              line items. This cannot be undone.
              {doc?.posted_at && (
                <span className="mt-2 block font-medium text-destructive">
                  Posted documents cannot be deleted — use Void &amp; Reverse instead.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending || !!doc?.posted_at}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ══ Email dialog ═════════════════════════════════════════════════════════ */}
      {kind === "invoice" && doc && payOpen && (
        <RecordPaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          kind="receive"
          docId={id}
          docNumber={doc.number}
          partyId={doc.customer_id}
          balanceDue={Number(doc.balance_due ?? doc.grand_total ?? 0)}
          currency={String(doc.currency ?? "KES")}
        />
      )}

      {emailOpen && (
        <EmailDocumentDialog
          open={emailOpen}
          onOpenChange={setEmailOpen}
          defaultTo={String(party?.email ?? "")}
          defaultSubject={`${cfg.label} ${String(doc?.number ?? "")}`}
          defaultMessage={`Dear ${party?.name ?? cfg.partyLabel},\n\nPlease find attached ${cfg.label.toLowerCase()} ${doc?.number ?? ""}.\n\nKind regards,\n${tenant?.name ?? ""}`}
          pdf={buildPdfInput}
          entityType={kind}
          entityId={id}
        />
      )}
    </div>
  );
}

// ── Tab button ────────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-4 py-3 text-sm font-medium transition-colors ${
        active
          ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
