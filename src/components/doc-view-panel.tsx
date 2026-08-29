/**
 * DocViewPanel
 *
 * Wraps DocumentEditor with:
 *  - Details / PDF toggle switch
 *  - Edit button (shows editor in editable mode)
 *  - Delete button with confirmation (soft-delete via deleted_at)
 *
 * Used by every $id route for all 7 document types.
 */
import { useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { Loader2, Pencil, Trash2, FileText, FileImage } from "lucide-react";
import { DocumentEditor, type DocKind } from "@/components/document-editor";
import { buildDocumentPdf } from "@/lib/document-pdf";
import { useDocumentBranding, type DocTemplateKind } from "@/hooks/use-document-branding";
import { db } from "@/lib/typed-db";
import type { TableName } from "@/lib/typed-db";

// ── config ────────────────────────────────────────────────────────────────────

const DOC_CONFIG: Record<
  DocKind,
  {
    table: TableName;
    lines: TableName;
    label: string;
    partyField: "customer_id" | "supplier_id";
    partyTable: "customers" | "suppliers";
    listPath: string;
    dateField: string;
    extraDate: { field: string; label: string } | null;
    prefix: string;
    templateKind: DocTemplateKind;
    deletePermission: string;
  }
> = {
  quote: {
    table: "sales_quotes",
    lines: "sales_quote_lines",
    label: "Quote",
    partyField: "customer_id",
    partyTable: "customers",
    listPath: "/sales/quotes",
    dateField: "date",
    extraDate: { field: "expiry", label: "Valid Until" },
    prefix: "QT",
    templateKind: "quote",
    deletePermission: "sales.delete",
  },
  order: {
    table: "sales_orders",
    lines: "sales_order_lines",
    label: "Sales Order",
    partyField: "customer_id",
    partyTable: "customers",
    listPath: "/sales/orders",
    dateField: "date",
    extraDate: null,
    prefix: "SO",
    templateKind: "order",
    deletePermission: "sales.delete",
  },
  invoice: {
    table: "invoices",
    lines: "invoice_lines",
    label: "Invoice",
    partyField: "customer_id",
    partyTable: "customers",
    listPath: "/sales/invoices",
    dateField: "date",
    extraDate: { field: "due_date", label: "Due Date" },
    prefix: "INV",
    templateKind: "invoice",
    deletePermission: "sales.delete",
  },
  credit_note: {
    table: "credit_notes",
    lines: "credit_note_lines",
    label: "Credit Note",
    partyField: "customer_id",
    partyTable: "customers",
    listPath: "/sales/credit-notes",
    dateField: "date",
    extraDate: null,
    prefix: "CN",
    templateKind: "credit_note",
    deletePermission: "sales.delete",
  },
  requisition: {
    table: "purchase_requisitions",
    lines: "purchase_requisition_lines",
    label: "Requisition",
    partyField: "supplier_id",
    partyTable: "suppliers",
    listPath: "/purchasing/requisitions",
    dateField: "date",
    extraDate: { field: "required_date", label: "Required By" },
    prefix: "REQ",
    templateKind: "order",
    deletePermission: "purchasing.delete",
  },
  po: {
    table: "purchase_orders",
    lines: "purchase_order_lines",
    label: "Purchase Order",
    partyField: "supplier_id",
    partyTable: "suppliers",
    listPath: "/purchasing/orders",
    dateField: "date",
    extraDate: { field: "expected_date", label: "Expected" },
    prefix: "PO",
    templateKind: "order",
    deletePermission: "purchasing.delete",
  },
  bill: {
    table: "bills",
    lines: "bill_lines",
    label: "Bill",
    partyField: "supplier_id",
    partyTable: "suppliers",
    listPath: "/purchasing/bills",
    dateField: "date",
    extraDate: { field: "due_date", label: "Due Date" },
    prefix: "BILL",
    templateKind: "invoice",
    deletePermission: "purchasing.delete",
  },
};

const money = (n: number) =>
  (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── PdfPreview ────────────────────────────────────────────────────────────────

function PdfPreview({ kind, id }: { kind: DocKind; id: string }) {
  const cfg = DOC_CONFIG[kind];
  const { tenant } = useAuth();
  const { branding } = useDocumentBranding(cfg.templateKind);

  const { data: doc } = useQuery({
    queryKey: [cfg.table, id],
    queryFn: async () => {
      const { data } = await db.from(cfg.table).select("*").eq("id", id).maybeSingle();
      return data as Record<string, any> | null;
    },
  });

  const { data: lines = [] } = useQuery({
    queryKey: [cfg.lines, id],
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
    queryKey: [cfg.partyTable, "detail", doc?.[cfg.partyField]],
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

  const pdfUri = useCallback(() => {
    if (!doc) return null;
    const totals = {
      subtotal: Number(doc.subtotal ?? 0),
      discount_total: Number(doc.discount_total ?? 0),
      tax_total: Number(doc.tax_total ?? 0),
      grand_total: Number(doc.grand_total ?? doc.amount ?? 0),
    };
    const meta: { label: string; value: string }[] = [
      { label: "Date", value: String(doc[cfg.dateField] ?? "") },
      ...(cfg.extraDate ? [{ label: cfg.extraDate.label, value: String(doc[cfg.extraDate.field] ?? "") }] : []),
      { label: "Status", value: String(doc.status ?? "") },
    ];
    const input = {
      title: cfg.label,
      number: String(doc.number ?? ""),
      companyName: tenant?.name ?? "Company",
      partyLabel: cfg.partyField === "customer_id" ? "Customer" : "Supplier",
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
    };
    try {
      const pdf = buildDocumentPdf(input);
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

  const uri = pdfUri();
  if (!uri) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Could not render PDF preview.
      </div>
    );
  }

  return (
    <iframe
      src={uri}
      title={`${cfg.label} PDF Preview`}
      className="h-full w-full border-0"
      style={{ minHeight: "600px" }}
    />
  );
}

// ── DocViewPanel ──────────────────────────────────────────────────────────────

export type ViewMode = "details" | "pdf";

interface DocViewPanelProps {
  kind: DocKind;
  id: string;
  /** If true, renders without internal navigation (embedded in split-panel view) */
  embedded?: boolean;
  onClose?: () => void;
  /** Called after successful save of a new doc */
  onSaved?: (id: string) => void;
}

export function DocViewPanel({
  kind,
  id,
  embedded = false,
  onClose,
  onSaved,
}: DocViewPanelProps) {
  const cfg = DOC_CONFIG[kind];
  const nav = useNavigate();
  const qc = useQueryClient();
  const { can } = useAuth();
  const isNew = id === "new";

  const [mode, setMode] = useState<ViewMode>("details");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const canDelete = can([cfg.deletePermission, "admin"]);

  // Fetch doc for header info (number, posted status)
  const { data: doc } = useQuery({
    queryKey: [cfg.table, id],
    enabled: !isNew,
    queryFn: async () => {
      const { data } = await db.from(cfg.table).select("number,status,posted_at,grand_total,amount,currency").eq("id", id).maybeSingle();
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
      // soft-delete lines too
      await supabase
        .from(cfg.lines as any)
        .update({ deleted_at: new Date().toISOString() })
        .eq("document_id", id);
    },
    onSuccess: () => {
      toast.success(`${cfg.label} deleted`);
      qc.invalidateQueries({ queryKey: [cfg.table] });
      setDeleteOpen(false);
      if (embedded && onClose) {
        onClose();
      } else {
        nav({ to: cfg.listPath as any });
      }
    },
    onError: (e: Error) => toast.error(e.message ?? "Delete failed"),
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Toolbar ── */}
      {!isNew && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b bg-background px-4 py-2">
          {/* Left: doc info */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-sm font-semibold truncate text-foreground">
              {doc?.number ?? cfg.label}
            </span>
            {doc?.status && (
              <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground bg-muted">
                {doc.status}
              </span>
            )}
          </div>

          {/* Center: Details / PDF toggle */}
          <div className="flex items-center gap-2 select-none">
            <FileText
              className={`h-3.5 w-3.5 transition-colors ${mode === "details" ? "text-foreground" : "text-muted-foreground"}`}
            />
            <Label htmlFor="view-mode-switch" className="text-xs font-medium cursor-pointer">
              {mode === "details" ? "Details" : "PDF Preview"}
            </Label>
            <Switch
              id="view-mode-switch"
              checked={mode === "pdf"}
              onCheckedChange={(checked) => setMode(checked ? "pdf" : "details")}
              aria-label="Toggle PDF preview"
            />
            <FileImage
              className={`h-3.5 w-3.5 transition-colors ${mode === "pdf" ? "text-primary" : "text-muted-foreground"}`}
            />
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2">
            {mode === "pdf" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMode("details")}
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Button>
            )}
            {canDelete && !doc?.posted_at && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive hover:border-destructive/50"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Content ── */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {mode === "details" || isNew ? (
          <div className="h-full overflow-y-auto">
            <DocumentEditor
              kind={kind}
              id={id}
              embedded={embedded}
              onClose={onClose}
              onSaved={onSaved}
            />
          </div>
        ) : (
          <PdfPreview kind={kind} id={id} />
        )}
      </div>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {cfg.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-semibold">{doc?.number ?? cfg.label}</span> and all its
              line items. This action cannot be undone.
              {doc?.posted_at && (
                <span className="block mt-2 text-destructive font-medium">
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
              {deleteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
