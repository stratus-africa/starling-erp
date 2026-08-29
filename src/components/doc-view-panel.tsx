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
import { DocumentEditor, type DocKind } from "@/components/document-editor";
import { DocumentTimeline } from "@/components/document-timeline";
import { buildDocumentPdf } from "@/lib/document-pdf";
import { downloadDocumentPdf } from "@/lib/document-pdf";
import { useDocumentBranding, type DocTemplateKind } from "@/hooks/use-document-branding";
import { db } from "@/lib/typed-db";
import type { TableName } from "@/lib/typed-db";
import { EmailDocumentDialog } from "@/components/email-document-dialog";

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
    converts: [{ label: "Convert to PO", action: "convert_req_to_po" }],
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

const fmtDate = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

// ── DetailsView ───────────────────────────────────────────────────────────────

function DetailsView({ kind, id }: { kind: DocKind; id: string }) {
  const cfg = DOC_CONFIG[kind];
  const { tenant } = useAuth();

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

  const { data: party } = useQuery({
    queryKey: [cfg.partyTable, "detail-view", doc?.[cfg.partyField]],
    enabled: !!doc?.[cfg.partyField],
    queryFn: async () => {
      const { data } = await db
        .from(cfg.partyTable)
        .select("id,name,email,phone,billing_address,shipping_address")
        .eq("id", doc![cfg.partyField])
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
      </div>

      {/* ── Party details ── */}
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

  return (
    <iframe
      src={pdfUri}
      title={`${cfg.label} PDF Preview`}
      className="h-full w-full border-0"
      style={{ minHeight: "600px" }}
    />
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
      <div className="flex h-full flex-col overflow-hidden">
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
