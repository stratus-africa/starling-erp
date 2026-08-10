import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Plus, Save, Send, Trash2, FileText, DollarSign, Printer, Mail, Receipt, Truck, Package as PackageIcon, CheckCircle2 } from "lucide-react";
import { useFkOptions } from "@/hooks/use-module-data";
import { RecordPaymentDialog } from "@/components/record-payment-dialog";
import { EmailDocumentDialog } from "@/components/email-document-dialog";
import { EmailStatus } from "@/components/email-status";
import { DocumentTimeline } from "@/components/document-timeline";
import { PostingDetailsDrawer } from "@/components/posting-details-drawer";
import { FulfillmentTimeline } from "@/components/fulfillment-timeline";
import { useDocumentBranding, type DocTemplateKind } from "@/hooks/use-document-branding";
import { logDocumentEvent } from "@/lib/document-events";
import { downloadDocumentPdf, type PdfDocInput } from "@/lib/document-pdf";
import { Link } from "@tanstack/react-router";

export type DocKind = "quote" | "order" | "invoice" | "po" | "bill" | "credit_note" | "requisition";

type CfgEntry = {
  table: string;
  lines: string;
  label: string;
  prefix: string;
  dateField: string;
  extraDate: { field: string; label: string } | null;
  statuses: readonly string[];
  partyField: "customer_id" | "supplier_id";
  partyTable: "customers" | "suppliers";
  partyLabel: string;
  partyRequired?: boolean;
  timelineStages?: string[];
  linkFk?: { field: string; table: string; label: string; labelKey: string };
  listPath: string;
  detailBase: string;
};

const CFG: Record<DocKind, CfgEntry> = {
  quote:   { table: "sales_quotes",    lines: "sales_quote_lines",    label: "Quote",          prefix: "QT",   dateField: "date", extraDate: { field: "expiry",        label: "Valid Until" }, statuses: ["Draft","Sent","Accepted","Rejected","Expired"], partyField: "customer_id", partyTable: "customers", partyLabel: "Customer", listPath: "/sales/quotes",       detailBase: "/sales/quotes" },
  order:   { table: "sales_orders",    lines: "sales_order_lines",    label: "Sales Order",    prefix: "SO",   dateField: "date", extraDate: null,                                                statuses: ["Draft","Confirmed","Processing","Packed","Shipped","Delivered","Invoiced","Cancelled"], partyField: "customer_id", partyTable: "customers", partyLabel: "Customer", listPath: "/sales/orders",       detailBase: "/sales/orders" },
  invoice: { table: "invoices",        lines: "invoice_lines",        label: "Invoice",        prefix: "INV",  dateField: "date", extraDate: { field: "due_date",      label: "Due Date" },    statuses: ["Draft","Sent","Posted","Paid","Overdue","Cancelled"], partyField: "customer_id", partyTable: "customers", partyLabel: "Customer", listPath: "/sales/invoices",     detailBase: "/sales/invoices" },
  po:      { table: "purchase_orders", lines: "purchase_order_lines", label: "Purchase Order", prefix: "PO",   dateField: "date", extraDate: { field: "expected_date", label: "Expected" },    statuses: ["Draft","Confirmed","Processing","Delivered","Billed","Cancelled"], partyField: "supplier_id", partyTable: "suppliers", partyLabel: "Supplier", listPath: "/purchasing/orders", detailBase: "/purchasing/orders" },
  bill:    { table: "bills",           lines: "bill_lines",           label: "Bill",           prefix: "BILL", dateField: "date", extraDate: { field: "due_date",      label: "Due Date" },    statuses: ["Pending","Posted","Paid","Overdue","Cancelled"], partyField: "supplier_id", partyTable: "suppliers", partyLabel: "Supplier", listPath: "/purchasing/bills",  detailBase: "/purchasing/bills" },
  credit_note: { table: "credit_notes", lines: "credit_note_lines",   label: "Credit Note",    prefix: "CN",   dateField: "date", extraDate: null,                                                statuses: ["Draft","Issued","Applied","Void"], partyField: "customer_id", partyTable: "customers", partyLabel: "Customer", timelineStages: ["Draft","Confirmed","Posted"], linkFk: { field: "invoice_id", table: "invoices", label: "Against Invoice", labelKey: "number" }, listPath: "/sales/credit-notes", detailBase: "/sales/credit-notes" },
  requisition: { table: "purchase_requisitions", lines: "purchase_requisition_lines", label: "Requisition", prefix: "REQ", dateField: "date", extraDate: { field: "required_date", label: "Required By" }, statuses: ["Draft","Submitted","Approved","Rejected","Ordered","Cancelled"], partyField: "supplier_id", partyTable: "suppliers", partyLabel: "Preferred Supplier", partyRequired: false, listPath: "/purchasing/requisitions", detailBase: "/purchasing/requisitions" },
};

const TEMPLATE_KIND: Record<DocKind, DocTemplateKind> = {
  quote: "quote", order: "order", invoice: "invoice", po: "order", bill: "invoice", credit_note: "credit_note", requisition: "order",
};



const money = (n: number) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Line {
  id?: string;
  line_no: number;
  item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  tax_pct: number;
  line_total: number;
  _dirty?: boolean;
}

function computeLine(l: Line): number {
  const gross = l.quantity * l.unit_price;
  const afterDisc = gross * (1 - (l.discount_pct || 0) / 100);
  const total = afterDisc * (1 + (l.tax_pct || 0) / 100);
  return Math.round(total * 100) / 100;
}

export function DocumentEditor({ kind, id }: { kind: DocKind; id: string }) {
  const cfg = CFG[kind];
  const qc = useQueryClient();
  const nav = useNavigate();
  const { tenant, user, profile, hasRole } = useAuth();
  const writeRoles: string[] = kind === "po" || kind === "bill" || kind === "requisition" ? ["tenant_admin", "super_admin", "purchasing"] : ["tenant_admin", "super_admin", "sales", "accounting"];
  const canWrite = hasRole(writeRoles as any);
  const isNew = id === "new";
  const [payOpen, setPayOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const { branding } = useDocumentBranding(TEMPLATE_KIND[kind]);


  const { data: doc, isLoading } = useQuery({
    queryKey: [cfg.table, id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await supabase.from(cfg.table as any).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: linesData } = useQuery({
    queryKey: [cfg.lines, id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await supabase.from(cfg.lines as any).select("*").eq("document_id", id).is("deleted_at", null).order("line_no");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: parties = [] } = useFkOptions(cfg.partyTable);
  const { data: items = [] } = useQuery({
    queryKey: ["items", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("id,name,sku,price,cost").is("deleted_at", null).order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const [header, setHeader] = useState<any>({
    number: "",
    [cfg.partyField]: "",
    [cfg.dateField]: new Date().toISOString().slice(0, 10),
    ...(cfg.extraDate ? { [cfg.extraDate.field]: "" } : {}),
    currency: "USD",
    notes: "",
    status: cfg.statuses[0],
  });
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => { if (doc) setHeader(doc); }, [doc]);
  useEffect(() => { if (linesData) setLines(linesData.map((l: any) => ({ ...l }))); }, [linesData]);

  const totals = useMemo(() => {
    let subtotal = 0, discount_total = 0, tax_total = 0, grand_total = 0;
    for (const l of lines) {
      const gross = l.quantity * l.unit_price;
      const disc = gross * ((l.discount_pct || 0) / 100);
      const afterDisc = gross - disc;
      const tax = afterDisc * ((l.tax_pct || 0) / 100);
      subtotal += gross;
      discount_total += disc;
      tax_total += tax;
      grand_total += afterDisc + tax;
    }
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      discount_total: Math.round(discount_total * 100) / 100,
      tax_total: Math.round(tax_total * 100) / 100,
      grand_total: Math.round(grand_total * 100) / 100,
    };
  }, [lines]);

  const addLine = () =>
    setLines((prev) => [
      ...prev,
      { line_no: prev.length + 1, item_id: null, description: "", quantity: 1, unit_price: 0, discount_pct: 0, tax_pct: 0, line_total: 0, _dirty: true },
    ]);

  const updateLine = (idx: number, patch: Partial<Line>) =>
    setLines((prev) => {
      const next = [...prev];
      const merged = { ...next[idx], ...patch, _dirty: true } as Line;
      merged.line_total = computeLine(merged);
      next[idx] = merged;
      return next;
    });

  const removeLine = (idx: number) =>
    setLines((prev) => prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, line_no: i + 1, _dirty: true })));

  const save = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("No tenant");
      if (cfg.partyRequired !== false && !header[cfg.partyField]) throw new Error(`Please select a ${cfg.partyLabel.toLowerCase()}`);

      const headerPayload: any = { ...header, ...totals, amount: totals.grand_total, tenant_id: tenant.id };
      if (kind === "invoice" || kind === "bill") {
        headerPayload.balance_due = totals.grand_total - (header.amount_paid ?? 0);
        headerPayload.balance = headerPayload.balance_due;
      }
      delete headerPayload.id;
      delete headerPayload.created_at;
      delete headerPayload.updated_at;
      delete headerPayload.search_vec;

      let docId: string | null = isNew ? null : id;
      if (isNew) {
        if (!headerPayload.number) headerPayload.number = `${cfg.prefix}-${Date.now().toString().slice(-8)}`;
        const { data, error } = await supabase.from(cfg.table as any).insert(headerPayload).select("id").single();
        if (error) throw error;
        docId = (data as any).id;
      } else {
        const { error } = await supabase.from(cfg.table as any).update(headerPayload).eq("id", id);
        if (error) throw error;
      }

      await supabase.from(cfg.lines as any).update({ deleted_at: new Date().toISOString() }).eq("document_id", docId!);
      if (lines.length) {
        const linePayload = lines.map((l, i) => ({
          tenant_id: tenant.id,
          document_id: docId,
          line_no: i + 1,
          item_id: l.item_id || null,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_pct: l.discount_pct || 0,
          tax_pct: l.tax_pct || 0,
          line_total: computeLine(l),
        }));
        const { error } = await supabase.from(cfg.lines as any).insert(linePayload);
        if (error) throw error;
      }
      return docId;
    },
    onSuccess: (docId) => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: [cfg.table] });
      qc.invalidateQueries({ queryKey: [cfg.lines] });
      if (isNew && docId) nav({ to: `${cfg.detailBase}/${docId}` as any });
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  const runRpc = useMutation({
    mutationFn: async (rpc: "convert_quote_to_order" | "convert_order_to_invoice" | "post_invoice" | "convert_po_to_bill" | "post_bill" | "post_credit_note") => {
      const args: any =
        rpc === "convert_quote_to_order" ? { _quote_id: id }
        : rpc === "convert_order_to_invoice" ? { _order_id: id }
        : rpc === "post_invoice" ? { _invoice_id: id }
        : rpc === "convert_po_to_bill" ? { _po_id: id }
        : rpc === "post_credit_note" ? { _credit_note_id: id }
        : { _bill_id: id };
      const { data, error } = await supabase.rpc(rpc as any, args);
      if (error) throw error;
      return data as string;
    },
    onSuccess: (newId, rpc) => {
      qc.invalidateQueries();
      if (rpc === "convert_quote_to_order") { toast.success("Converted to order"); nav({ to: `/sales/orders/${newId}` as any }); }
      else if (rpc === "convert_order_to_invoice") { toast.success("Converted to invoice"); nav({ to: `/sales/invoices/${newId}` as any }); }
      else if (rpc === "convert_po_to_bill") { toast.success("Converted to bill"); nav({ to: `/purchasing/bills/${newId}` as any }); }
      else if (rpc === "post_bill") toast.success("Bill posted");
      else if (rpc === "post_credit_note") {
        toast.success("Credit note issued");
        if (tenant?.id) {
          void logDocumentEvent({
            tenantId: tenant.id, entityType: "credit_note", entityId: id, status: "Posted",
            note: "Journal entry and inventory returns recorded",
            actorId: user?.id ?? null, actorEmail: profile?.email ?? null,
          });
        }
      }
      else toast.success("Invoice posted");
    },
    onError: (e: any) => toast.error(e.message ?? "Action failed"),
  });

  const isReq = kind === "requisition";
  const canApprove = hasRole(["tenant_admin", "super_admin", "purchasing"] as any);
  const reqApproved = header.status === "Approved" || header.status === "Ordered";

  const setReqStatus = useMutation({
    mutationFn: async ({ status, note }: { status: string; note: string }) => {
      const { error } = await supabase.from(cfg.table as any).update({ status }).eq("id", id);
      if (error) throw error;
      if (tenant?.id) {
        await logDocumentEvent({
          tenantId: tenant.id, entityType: kind, entityId: id, status, note,
          actorId: user?.id ?? null, actorEmail: profile?.email ?? null,
        });
      }
      return status;
    },
    onSuccess: (status) => {
      setHeader((h: any) => ({ ...h, status }));
      toast.success(`Requisition ${status.toLowerCase()}`);
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  const convertReqToPo = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("No tenant");
      if (!reqApproved) throw new Error("Requisition must be approved first");
      if (!header.supplier_id) throw new Error("Select a preferred supplier before converting");
      const number = `PO-${Date.now().toString().slice(-8)}`;
      const { data: po, error } = await supabase.from("purchase_orders").insert({
        tenant_id: tenant.id,
        number,
        supplier_id: header.supplier_id,
        date: new Date().toISOString().slice(0, 10),
        expected_date: header.required_date || null,
        status: "Draft",
        currency: header.currency ?? "USD",
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        tax_total: totals.tax_total,
        grand_total: totals.grand_total,
        amount: totals.grand_total,
        notes: header.notes || null,
      } as any).select("id").single();
      if (error) throw error;
      const poId = (po as any).id as string;
      if (lines.length) {
        const { error: le } = await supabase.from("purchase_order_lines").insert(
          lines.map((l, i) => ({
            tenant_id: tenant.id,
            document_id: poId,
            line_no: i + 1,
            item_id: l.item_id || null,
            description: l.description,
            quantity: l.quantity,
            unit_price: l.unit_price,
            discount_pct: l.discount_pct || 0,
            tax_pct: l.tax_pct || 0,
            line_total: computeLine(l),
          })) as any,
        );
        if (le) throw le;
      }
      await supabase.from("purchase_requisitions").update({ status: "Ordered", converted_po_id: poId } as any).eq("id", id);
      await logDocumentEvent({
        tenantId: tenant.id, entityType: kind, entityId: id, status: "Ordered",
        note: `Converted to purchase order ${number}`,
        actorId: user?.id ?? null, actorEmail: profile?.email ?? null,
      });
      return poId;
    },
    onSuccess: (poId) => {
      toast.success("Converted to purchase order");
      qc.invalidateQueries();
      nav({ to: `/purchasing/orders/${poId}` as any });
    },
    onError: (e: any) => toast.error(e.message ?? "Conversion failed"),
  });

  const partyId = header[cfg.partyField] || null;
  const { data: party } = useQuery({
    queryKey: [cfg.partyTable, "detail", partyId],
    enabled: !!partyId,
    queryFn: async () => {
      const { data, error } = await supabase.from(cfg.partyTable).select("id,name,email").eq("id", partyId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: packages = [] } = useQuery({
    queryKey: ["packages", "by-order", id],
    enabled: kind === "order" && !isNew,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packages" as any)
        .select("id,number,date,status,tracking,carrier,posted_at")
        .eq("sales_order_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: shipments = [] } = useQuery({
    queryKey: ["shipments", "by-order", id],
    enabled: kind === "order" && !isNew,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shipments" as any)
        .select("id,number,ship_date,delivery_date,status,tracking,carrier,posted_at")
        .eq("sales_order_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: linkOptions = [] } = useQuery({
    queryKey: [cfg.linkFk?.table, "link-options", header[cfg.partyField]],
    enabled: !!cfg.linkFk,
    queryFn: async () => {
      let q = supabase.from(cfg.linkFk!.table as any).select(`id, ${cfg.linkFk!.labelKey}`).is("deleted_at", null);
      if (header[cfg.partyField]) q = q.eq(cfg.partyField, header[cfg.partyField]);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });



  const buildPdf = (): PdfDocInput => ({
    title: cfg.label,
    number: header.number ?? "",
    companyName: tenant?.name ?? "Company",
    partyLabel: cfg.partyLabel,
    partyName: party?.name ?? "—",
    currency: header.currency ?? "USD",
    meta: [
      { label: "Date", value: header[cfg.dateField] ?? "" },
      ...(cfg.extraDate ? [{ label: cfg.extraDate.label, value: header[cfg.extraDate.field] ?? "" }] : []),
      { label: "Status", value: header.status ?? "" },
    ],
    lines: lines.map((l) => ({
      description: l.description || "",
      quantity: l.quantity,
      unit_price: l.unit_price,
      discount_pct: l.discount_pct,
      tax_pct: l.tax_pct,
      line_total: computeLine(l),
    })),
    totals,
    branding,
    notes: header.notes ?? null,

  });

  if (!isNew && isLoading) {
    return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }

  const showRecordPayment = !isNew && (kind === "invoice" || kind === "bill") && doc?.posted_at && Number(doc?.balance_due ?? doc?.balance ?? 0) > 0.001;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 w-full">

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => nav({ to: cfg.listPath as any })}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h1 className="text-xl font-semibold truncate">{isNew ? `New ${cfg.label}` : header.number || cfg.label}</h1>
              {header.status && <Badge variant="secondary">{header.status}</Badge>}
            </div>
            {!isNew && <p className="text-xs text-muted-foreground mt-0.5">Grand total {header.currency ?? "USD"} {money(totals.grand_total)}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {!isNew && <EmailStatus entityType={kind} entityId={id} />}
          {!isNew && (
            <>
              <Button variant="outline" size="sm" onClick={() => downloadDocumentPdf(buildPdf())}><Printer className="h-4 w-4 mr-1.5" /> Print PDF</Button>
              <Button variant="outline" size="sm" onClick={() => setEmailOpen(true)}><Mail className="h-4 w-4 mr-1.5" /> Email</Button>
            </>
          )}
          {!isNew && (doc?.posted_at || kind === "credit_note") && (
            <Button variant="outline" size="sm" onClick={() => setPostOpen(true)}>
              <Receipt className="h-4 w-4 mr-1.5" /> {kind === "credit_note" ? "Inventory movements" : "Post details"}
            </Button>
          )}

          {canWrite && kind === "order" && !isNew && (
            <Button variant="outline" size="sm" asChild>
              <Link to={"/sales/packages/new" as any} search={{ order: id } as any}><PackageIcon className="h-4 w-4 mr-1.5" /> New Package</Link>
            </Button>
          )}
          {canWrite && kind === "quote" && !isNew && (

            <Button variant="outline" size="sm" disabled={runRpc.isPending} onClick={() => runRpc.mutate("convert_quote_to_order")}><Send className="h-4 w-4 mr-1.5" /> Convert to Order</Button>
          )}
          {canWrite && kind === "order" && !isNew && (
            <Button variant="outline" size="sm" disabled={runRpc.isPending} onClick={() => runRpc.mutate("convert_order_to_invoice")}><Send className="h-4 w-4 mr-1.5" /> Convert to Invoice</Button>
          )}
          {isReq && !isNew && canWrite && header.status === "Draft" && (
            <Button variant="outline" size="sm" disabled={setReqStatus.isPending} onClick={() => setReqStatus.mutate({ status: "Submitted", note: "Submitted for approval" })}>
              <Send className="h-4 w-4 mr-1.5" /> Submit for Approval
            </Button>
          )}
          {isReq && !isNew && canApprove && header.status === "Submitted" && (
            <>
              <Button variant="outline" size="sm" disabled={setReqStatus.isPending} onClick={() => setReqStatus.mutate({ status: "Rejected", note: "Rejected by approver" })}>
                Reject
              </Button>
              <Button variant="default" size="sm" disabled={setReqStatus.isPending} onClick={() => setReqStatus.mutate({ status: "Approved", note: "Approved" })}>
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve
              </Button>
            </>
          )}
          {isReq && !isNew && canWrite && (
            <Button variant="outline" size="sm" disabled={!reqApproved || convertReqToPo.isPending} title={reqApproved ? undefined : "Requires approval"} onClick={() => convertReqToPo.mutate()}>
              <Send className="h-4 w-4 mr-1.5" /> Convert to PO
            </Button>
          )}
          {canWrite && kind === "po" && !isNew && (
            <Button variant="outline" size="sm" disabled={runRpc.isPending} onClick={() => runRpc.mutate("convert_po_to_bill")}><Send className="h-4 w-4 mr-1.5" /> Convert to Bill</Button>
          )}
          {canWrite && kind === "invoice" && !isNew && !doc?.posted_at && (
            <Button variant="default" size="sm" disabled={runRpc.isPending} onClick={() => runRpc.mutate("post_invoice")}><DollarSign className="h-4 w-4 mr-1.5" /> Post Invoice</Button>
          )}
          {canWrite && kind === "bill" && !isNew && !doc?.posted_at && (
            <Button variant="default" size="sm" disabled={runRpc.isPending} onClick={() => runRpc.mutate("post_bill")}><DollarSign className="h-4 w-4 mr-1.5" /> Post Bill</Button>
          )}
          {canWrite && kind === "credit_note" && !isNew && !doc?.posted_at && (
            <Button variant="default" size="sm" disabled={runRpc.isPending} onClick={() => runRpc.mutate("post_credit_note")}><DollarSign className="h-4 w-4 mr-1.5" /> Post Credit Note</Button>
          )}
          {canWrite && showRecordPayment && (
            <Button variant="secondary" size="sm" onClick={() => setPayOpen(true)}><DollarSign className="h-4 w-4 mr-1.5" /> Record Payment</Button>
          )}
          {canWrite && (
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save
            </Button>
          )}
        </div>
      </div>

      <Card className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="grid gap-1.5">
          <Label>Number</Label>
          <Input value={header.number ?? ""} onChange={(e) => setHeader({ ...header, number: e.target.value })} placeholder="Auto" disabled={!canWrite} />
        </div>
        <div className="grid gap-1.5">
          <Label>{cfg.partyLabel}</Label>
          <Select value={header[cfg.partyField] ?? ""} onValueChange={(v) => setHeader({ ...header, [cfg.partyField]: v })} disabled={!canWrite}>
            <SelectTrigger><SelectValue placeholder={`Select ${cfg.partyLabel.toLowerCase()}…`} /></SelectTrigger>
            <SelectContent>
              {parties.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Date</Label>
          <Input type="date" value={header[cfg.dateField] ?? ""} onChange={(e) => setHeader({ ...header, [cfg.dateField]: e.target.value })} disabled={!canWrite} />
        </div>
        {cfg.extraDate && (
          <div className="grid gap-1.5">
            <Label>{cfg.extraDate.label}</Label>
            <Input type="date" value={header[cfg.extraDate.field] ?? ""} onChange={(e) => setHeader({ ...header, [cfg.extraDate!.field]: e.target.value })} disabled={!canWrite} />
          </div>
        )}
        {cfg.linkFk && (
          <div className="grid gap-1.5">
            <Label>{cfg.linkFk.label}</Label>
            <Select value={header[cfg.linkFk.field] ?? ""} onValueChange={(v) => setHeader({ ...header, [cfg.linkFk!.field]: v })} disabled={!canWrite}>
              <SelectTrigger><SelectValue placeholder="Select invoice…" /></SelectTrigger>
              <SelectContent>
                {linkOptions.map((o: any) => <SelectItem key={o.id} value={o.id}>{o[cfg.linkFk!.labelKey] ?? o.id.slice(0, 8)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label>Currency</Label>
          <Select value={header.currency ?? "USD"} onValueChange={(v) => setHeader({ ...header, currency: v })} disabled={!canWrite}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["USD","EUR","GBP","KES","AED","EGP","INR","ZAR"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Status</Label>
          <Select value={header.status ?? cfg.statuses[0]} onValueChange={(v) => setHeader({ ...header, status: v })} disabled={!canWrite}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{cfg.statuses.filter(s => !(isReq && !canApprove && (s === "Approved" || s === "Rejected"))).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5 md:col-span-2">
          <Label>Notes</Label>
          <Textarea rows={1} value={header.notes ?? ""} onChange={(e) => setHeader({ ...header, notes: e.target.value })} disabled={!canWrite} />
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
          <div className="text-sm font-medium">Line items</div>
          {canWrite && <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" /> Add line</Button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/10 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="text-left px-3 py-2 w-8">#</th>
                <th className="text-left px-3 py-2 min-w-[200px]">Item</th>
                <th className="text-left px-3 py-2 min-w-[220px]">Description</th>
                <th className="text-right px-3 py-2 w-20">Qty</th>
                <th className="text-right px-3 py-2 w-28">Unit Price</th>
                <th className="text-right px-3 py-2 w-20">Disc %</th>
                <th className="text-right px-3 py-2 w-20">Tax %</th>
                <th className="text-right px-3 py-2 w-28">Total</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr><td colSpan={9} className="text-center text-sm text-muted-foreground py-10">No lines yet. {canWrite && "Click Add line to begin."}</td></tr>
              )}
              {lines.map((l, idx) => (
                <tr key={idx} className="border-b hover:bg-muted/20">
                  <td className="px-3 py-1.5 text-muted-foreground">{idx + 1}</td>
                  <td className="px-2 py-1.5">
                    <Select value={l.item_id ?? ""} onValueChange={(v) => {
                      const it = items.find((i: any) => i.id === v);
                      const price = kind === "po" || kind === "bill" ? Number(it?.cost ?? 0) : Number(it?.price ?? 0);
                      updateLine(idx, { item_id: v, description: l.description || it?.name || "", unit_price: l.unit_price || price });
                    }} disabled={!canWrite}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Pick item…" /></SelectTrigger>
                      <SelectContent>
                        {items.map((i: any) => <SelectItem key={i.id} value={i.id}>{i.sku ? `${i.sku} — ` : ""}{i.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1.5"><Input className="h-8" value={l.description} onChange={(e) => updateLine(idx, { description: e.target.value })} disabled={!canWrite} /></td>
                  <td className="px-2 py-1.5"><Input className="h-8 text-right" type="number" step="any" value={l.quantity} onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })} disabled={!canWrite} /></td>
                  <td className="px-2 py-1.5"><Input className="h-8 text-right" type="number" step="any" value={l.unit_price} onChange={(e) => updateLine(idx, { unit_price: Number(e.target.value) })} disabled={!canWrite} /></td>
                  <td className="px-2 py-1.5"><Input className="h-8 text-right" type="number" step="any" value={l.discount_pct} onChange={(e) => updateLine(idx, { discount_pct: Number(e.target.value) })} disabled={!canWrite} /></td>
                  <td className="px-2 py-1.5"><Input className="h-8 text-right" type="number" step="any" value={l.tax_pct} onChange={(e) => updateLine(idx, { tax_pct: Number(e.target.value) })} disabled={!canWrite} /></td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{money(computeLine(l))}</td>
                  <td className="px-2 py-1.5">
                    {canWrite && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLine(idx)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end border-t bg-muted/10 px-4 py-3">
          <div className="w-72 space-y-1 text-sm">
            <Row label="Subtotal" v={totals.subtotal} />
            <Row label="Discount" v={-totals.discount_total} />
            <Row label="Tax" v={totals.tax_total} />
            <div className="border-t mt-1 pt-1 flex justify-between font-semibold text-base">
              <span>Grand Total</span>
              <span className="font-mono tabular-nums">{header.currency ?? "USD"} {money(totals.grand_total)}</span>
            </div>
            {(kind === "invoice" || kind === "bill") && Number(doc?.amount_paid ?? 0) > 0 && (
              <>
                <Row label="Paid" v={-Number(doc.amount_paid)} />
                <div className="flex justify-between font-medium"><span>Balance Due</span><span className="font-mono tabular-nums">{money(totals.grand_total - Number(doc.amount_paid || 0))}</span></div>
              </>
            )}
          </div>
        </div>
      </Card>

      {kind === "order" && !isNew && (
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
            <div className="text-sm font-medium flex items-center gap-2"><PackageIcon className="h-4 w-4 text-muted-foreground" /> Fulfillment · Packages</div>
            {canWrite && (
              <Button size="sm" variant="outline" asChild>
                <Link to={"/sales/packages/new" as any} search={{ order: id } as any}><Plus className="h-3.5 w-3.5 mr-1" /> New Package</Link>
              </Button>
            )}
          </div>
          {packages.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">No packages for this order yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/10 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="text-left px-3 py-2">Package #</th>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Carrier</th>
                  <th className="text-left px-3 py-2">Tracking</th>
                  <th className="text-left px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {packages.map((p: any) => (
                  <tr key={p.id} className="border-b hover:bg-muted/20 cursor-pointer" onClick={() => nav({ to: `/sales/packages/${p.id}` as any })}>
                    <td className="px-3 py-2 font-medium">{p.number}</td>
                    <td className="px-3 py-2">{p.date ?? "—"}</td>
                    <td className="px-3 py-2">{p.carrier || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.tracking || "—"}</td>
                    <td className="px-3 py-2"><Badge variant="secondary">{p.posted_at ? "Confirmed" : p.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {kind === "order" && !isNew && (
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
            <div className="text-sm font-medium flex items-center gap-2"><Truck className="h-4 w-4 text-muted-foreground" /> Fulfillment · Shipments</div>
            {canWrite && (
              <Button size="sm" variant="outline" asChild>
                <Link to={"/sales/shipments/new" as any} search={{ order: id } as any}><Plus className="h-3.5 w-3.5 mr-1" /> New Shipment</Link>
              </Button>
            )}
          </div>
          {shipments.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">No shipments for this order yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/10 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="text-left px-3 py-2">Shipment #</th>
                  <th className="text-left px-3 py-2">Ship Date</th>
                  <th className="text-left px-3 py-2">Carrier</th>
                  <th className="text-left px-3 py-2">Tracking</th>
                  <th className="text-left px-3 py-2">Delivered</th>
                  <th className="text-left px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s: any) => (
                  <tr key={s.id} className="border-b hover:bg-muted/20 cursor-pointer" onClick={() => nav({ to: `/sales/shipments/${s.id}` as any })}>
                    <td className="px-3 py-2 font-medium">{s.number}</td>
                    <td className="px-3 py-2">{s.ship_date ?? "—"}</td>
                    <td className="px-3 py-2">{s.carrier || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{s.tracking || "—"}</td>
                    <td className="px-3 py-2">{s.delivery_date ?? "—"}</td>
                    <td className="px-3 py-2"><Badge variant="secondary">{s.posted_at ? "Confirmed" : s.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}



      {kind === "order" && !isNew && <FulfillmentTimeline orderId={id} />}

      {showRecordPayment && (
        <RecordPaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          kind={kind === "invoice" ? "receive" : "pay"}
          docId={id}
          docNumber={header.number ?? ""}
          partyId={header[cfg.partyField]}
          balanceDue={Number(doc?.balance_due ?? doc?.balance ?? totals.grand_total)}
          currency={header.currency ?? "USD"}
        />
      )}

      {!isNew && (
        <DocumentTimeline
          entityType={kind}
          entityId={id}
          stages={cfg.timelineStages ?? [...cfg.statuses]}
          currentStage={
            cfg.timelineStages
              ? doc?.posted_at ? "Posted" : (header.status ?? "Draft") === "Draft" ? "Draft" : "Confirmed"
              : header.status ?? null
          }
        />
      )}

      {!isNew && (
        <PostingDetailsDrawer
          open={postOpen}
          onOpenChange={setPostOpen}
          refType={kind}
          refId={id}
          title={`${cfg.label.toLowerCase()} ${header.number ?? ""}`}
          sources={
            kind === "credit_note" && header.invoice_id
              ? [{ label: `Invoice ${linkOptions.find((o: any) => o.id === header.invoice_id)?.number ?? ""}`, to: `/sales/invoices/${header.invoice_id}` }]
              : []
          }
        />
      )}

      {!isNew && (
        <EmailDocumentDialog
          open={emailOpen}
          onOpenChange={setEmailOpen}
          defaultTo={party?.email ?? ""}
          defaultSubject={`${cfg.label} ${header.number ?? ""}`}
          defaultMessage={`Dear ${party?.name ?? "Customer"},\n\nPlease find attached ${cfg.label.toLowerCase()} ${header.number ?? ""} for ${header.currency ?? "USD"} ${money(totals.grand_total)}.\n\nKind regards,\n${tenant?.name ?? ""}`}
          pdf={buildPdf}
          entityType={kind}
          entityId={id}
        />
      )}


    </div>
  );
}

function Row({ label, v }: { label: string; v: number }) {
  return <div className="flex justify-between text-muted-foreground"><span>{label}</span><span className="font-mono tabular-nums">{(v).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>;
}
