import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useDocumentEvents } from "@/lib/document-events";
import { logDocumentEvent } from "@/lib/document-events";
import { callRpc } from "@/lib/db-rpc";
import { useDocumentBranding } from "@/hooks/use-document-branding";
import { buildDocumentPdf, downloadDocumentPdf, type PdfDocInput } from "@/lib/document-pdf";
import { DocumentEditor } from "@/components/document-editor";
import { EmailDocumentDialog } from "@/components/email-document-dialog";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { DocumentTimeline } from "@/components/document-timeline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  FileText,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  ShoppingCart,
  Trash2,
} from "lucide-react";

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
const statusClass: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700",
  Sent: "bg-blue-100 text-blue-700",
  Viewed: "bg-cyan-100 text-cyan-700",
  Accepted: "bg-emerald-100 text-emerald-700",
  Rejected: "bg-red-100 text-red-700",
  Expired: "bg-orange-100 text-orange-700",
  Cancelled: "bg-red-100 text-red-700",
};

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="break-words text-sm font-medium">{value || "Not set"}</span>
    </div>
  );
}
function SidebarCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}
function TotalRow({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={bold ? "font-semibold" : "text-sm text-muted-foreground"}>{label}</span>
      <span className={`font-mono tabular-nums ${bold ? "font-bold" : "text-sm"}`}>{value}</span>
    </div>
  );
}
function LineItems({
  lines,
  items,
  currency,
  subtotal,
  discount,
  tax,
  total,
  onEdit,
}: {
  lines: Row[];
  items: Row[];
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  onEdit: () => void;
}) {
  const quantity = lines.reduce((sum, line) => sum + Number(line.quantity ?? 0), 0);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Quote Line Items</CardTitle>
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Plus className="mr-1.5 h-4 w-4" /> Add Item
        </Button>
      </CardHeader>
      <Separator />
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Item / SKU</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Unit Price</th>
                <th className="px-4 py-3 text-right">Discount</th>
                <th className="px-4 py-3 text-right">Tax</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {lines.length ? (
                lines.map((line, index) => {
                  const item = items.find((candidate) => candidate.id === line.item_id);
                  return (
                    <tr key={line.id} className="border-b last:border-0">
                      <td className="px-4 py-3">{index + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{item?.name ?? line.description ?? "Item"}</p>
                        <p className="text-xs text-muted-foreground">{item?.sku ?? "No SKU"}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{line.description ?? "—"}</td>
                      <td className="px-4 py-3 text-right">{line.quantity ?? 0}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {money(line.unit_price, currency)}
                      </td>
                      <td className="px-4 py-3 text-right">{Number(line.discount_pct ?? 0)}%</td>
                      <td className="px-4 py-3 text-right">{Number(line.tax_pct ?? 0)}%</td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-medium">
                        {money(line.line_total, currency)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label="Quote line actions"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={onEdit}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit Items
                            </DropdownMenuItem>
                            {item?.id && (
                              <DropdownMenuItem asChild>
                                <a href={`/inventory/items/${item.id}`}>View Product</a>
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                    No line items yet. Add an item in Edit mode.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-4 border-t p-4 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Total Items: <span className="font-medium text-foreground">{lines.length}</span> · Total
            Quantity: <span className="font-medium text-foreground">{quantity}</span>
          </p>
          <div className="w-full max-w-sm space-y-2">
            <TotalRow label="Subtotal" value={money(subtotal, currency)} />
            <TotalRow label="Discount" value={money(discount, currency)} />
            <TotalRow label="Tax" value={money(tax, currency)} />
            <div className="border-t pt-2">
              <TotalRow label="Grand Total" value={money(total, currency)} bold />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function QuoteViewPage({ id }: { id: string }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { tenant, user, profile, can } = useAuth();
  const { branding } = useDocumentBranding("quote");
  const [editMode, setEditMode] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [tab, setTab] = useState("overview");
  const canWrite = can(["sales.create", "sales.update"]);
  const canDelete = can(["sales.delete", "admin"]);
  const { data: quote, isLoading } = useQuery({
    queryKey: ["sales_quotes", id, "quote-view"],
    queryFn: async () => {
      const { data, error } = await db.from("sales_quotes").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
  });
  const { data: lines = [] } = useQuery({
    queryKey: ["sales_quote_lines", id, "quote-view"],
    queryFn: async () => {
      const { data, error } = await db
        .from("sales_quote_lines")
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
    queryKey: ["items", "quote-lines", itemIds],
    enabled: itemIds.length > 0,
    queryFn: async () => {
      const { data, error } = await db.from("items").select("id,name,sku,cost").in("id", itemIds);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const { data: customer } = useQuery({
    queryKey: ["customers", "quote-view", quote?.customer_id],
    enabled: !!quote?.customer_id,
    queryFn: async () => {
      const { data, error } = await db
        .from("customers")
        .select("*")
        .eq("id", quote.customer_id)
        .maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
  });
  const { data: salesperson } = useQuery({
    queryKey: ["profiles", "quote-view", quote?.created_by],
    enabled: !!quote?.created_by,
    queryFn: async () => {
      const { data } = await db
        .from("profiles")
        .select("full_name,email")
        .eq("id", quote.created_by)
        .maybeSingle();
      return data as Row | null;
    },
  });
  const { data: events = [] } = useDocumentEvents("quote", id);
  const { data: audit = [] } = useQuery({
    queryKey: ["audit_logs", "sales_quotes", id],
    queryFn: async () => {
      const { data, error } = await db
        .from("audit_logs")
        .select("*")
        .eq("table_name", "sales_quotes")
        .eq("record_id", id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from("sales_quotes")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Quote deleted");
      nav({ to: "/sales/quotes" as never });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const setStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await db.from("sales_quotes").update({ status }).eq("id", id);
      if (error) throw error;
      if (tenant?.id)
        await logDocumentEvent({
          tenantId: tenant.id,
          entityType: "quote",
          entityId: id,
          status,
          note: `Quote ${status.toLowerCase()}`,
          actorId: user?.id ?? null,
          actorEmail: profile?.email ?? null,
        });
      return status;
    },
    onSuccess: (status) => {
      toast.success(`Quote ${status.toLowerCase()}`);
      qc.invalidateQueries({ queryKey: ["sales_quotes", id] });
      qc.invalidateQueries({ queryKey: ["sales_quotes", id, "quote-view"] });
      qc.invalidateQueries({ queryKey: ["document_events", "quote", id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const convertMutation = useMutation({
    mutationFn: () => callRpc("convert_quote_to_order", { _quote_id: id }),
    onSuccess: (orderId) => {
      toast.success("Converted to order");
      nav({ to: `/sales/orders/${orderId}` as never });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (editMode)
    return (
      <DocumentEditor
        kind="quote"
        id={id}
        onClose={() => setEditMode(false)}
        onSaved={() => {
          setEditMode(false);
          qc.invalidateQueries({ queryKey: ["sales_quotes", id] });
          qc.invalidateQueries({ queryKey: ["sales_quote_lines", id] });
        }}
      />
    );
  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading quote...</div>;
  if (!quote) return <div className="p-8 text-sm text-muted-foreground">Quote not found.</div>;

  const currency = quote.currency ?? tenant?.currency_symbol ?? tenant?.currency ?? "KES";
  const subtotal = Number(quote.subtotal ?? 0);
  const discount = Number(quote.discount_total ?? 0);
  const tax = Number(quote.tax_total ?? 0);
  const total = Number(quote.grand_total ?? quote.amount ?? 0);
  const cost = lines.reduce(
    (sum, line) =>
      sum +
      Number(line.quantity ?? 0) *
        Number(items.find((item) => item.id === line.item_id)?.cost ?? 0),
    0,
  );
  const margin = total > 0 && cost > 0 ? ((total - cost) / total) * 100 : null;
  const expiry = quote.expiry ? new Date(quote.expiry) : null;
  const daysToExpiry = expiry ? Math.ceil((expiry.getTime() - Date.now()) / 86400000) : null;
  const currentStatus = quote.status ?? "Draft";
  const workflow =
    currentStatus === "Rejected"
      ? ["Draft", "Sent", "Viewed", "Rejected"]
      : ["Draft", "Sent", "Viewed", "Accepted"];
  if (!["Draft", "Sent", "Viewed", "Accepted", "Rejected"].includes(currentStatus))
    workflow.push(currentStatus);
  const statusMessage =
    currentStatus === "Draft"
      ? "Send this quote to the customer to continue the sales process."
      : currentStatus === "Sent"
        ? "Waiting for the customer to review this quote."
        : currentStatus === "Viewed"
          ? "Customer has viewed this quote."
          : currentStatus === "Accepted"
            ? "Quote accepted. You can now convert it to an order."
            : currentStatus === "Rejected"
              ? "Quote rejected by the customer."
              : currentStatus === "Expired"
                ? "This quote has expired."
                : "Review the next available quote action.";
  const pdf = (): PdfDocInput => ({
    title: "Quote",
    number: String(quote.number ?? ""),
    companyName: tenant?.name ?? "Company",
    partyLabel: "Customer",
    partyName: customer?.name ?? "—",
    currency,
    meta: [
      { label: "Date", value: dateFmt(quote.date) },
      { label: "Valid Until", value: dateFmt(quote.expiry) },
      { label: "Status", value: currentStatus },
    ],
    lines: lines.map((line) => ({
      description: line.description ?? "",
      quantity: Number(line.quantity ?? 0),
      unit_price: Number(line.unit_price ?? 0),
      discount_pct: Number(line.discount_pct ?? 0),
      tax_pct: Number(line.tax_pct ?? 0),
      line_total: Number(line.line_total ?? 0),
    })),
    totals: { subtotal, discount_total: discount, tax_total: tax, grand_total: total },
    branding,
    notes: quote.notes,
  });
  const kpis = [
    {
      label: "Quote Total",
      value: money(total, currency),
      sub: `${lines.length} line items`,
      icon: FileText,
    },
    {
      label: "Valid Until",
      value: dateFmt(quote.expiry),
      sub:
        daysToExpiry == null
          ? "No expiry date"
          : daysToExpiry >= 0
            ? `Expires in ${daysToExpiry} days`
            : "Expired",
      icon: CalendarDays,
    },
    {
      label: "Payment Terms",
      value: quote.payment_terms ?? "Not set",
      sub: currency,
      icon: ShoppingCart,
    },
    {
      label: "Gross Margin",
      value: margin == null ? "Not available" : `${margin.toFixed(1)}%`,
      sub: cost ? "Based on item costs" : "Cost data unavailable",
      icon: CheckCircle2,
    },
    {
      label: "Last Updated",
      value: dateFmt(quote.updated_at),
      sub: salesperson?.full_name ? `by ${salesperson.full_name}` : "Updated by system",
      icon: History,
    },
  ];

  return (
    <div className="min-h-full bg-muted/20 p-4 md:p-6">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Button variant="ghost" size="sm" onClick={() => nav({ to: "/sales/quotes" as never })}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">{quote.number ?? "Quote"}</h1>
                <Badge className={statusClass[currentStatus] ?? ""}>{currentStatus}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {customer?.name ?? "No customer"} · Valid Until: {dateFmt(quote.expiry)} ·
                Salesperson: {salesperson?.full_name ?? "Not assigned"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {canWrite && ["Draft", "Sent", "Viewed"].includes(currentStatus) && (
              <Button
                size="sm"
                onClick={() => {
                  if (currentStatus === "Draft") setStatus.mutate("Sent");
                  setEmailOpen(true);
                }}
                disabled={setStatus.isPending}
              >
                <Send className="mr-1.5 h-4 w-4" />{" "}
                {currentStatus === "Draft" ? "Send Quote" : "Resend Quote"}
              </Button>
            )}
            {canWrite && currentStatus === "Accepted" && (
              <Button
                size="sm"
                onClick={() => convertMutation.mutate()}
                disabled={convertMutation.isPending}
              >
                <ShoppingCart className="mr-1.5 h-4 w-4" /> Convert to Order
              </Button>
            )}
            {canWrite && (
              <Button size="sm" variant="outline" onClick={() => setEditMode(true)}>
                <Pencil className="mr-1.5 h-4 w-4" /> Edit
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => downloadDocumentPdf(pdf())}>
              <Download className="mr-1.5 h-4 w-4" /> Download PDF
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="outline" aria-label="More quote actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => window.print()}>Print Quote</DropdownMenuItem>
                {canWrite && currentStatus === "Accepted" && (
                  <DropdownMenuItem onClick={() => convertMutation.mutate()}>
                    Convert to Order
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete Quote
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {kpis.map((kpi) => (
            <Card key={kpi.label} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className="mt-1 truncate font-mono text-lg font-semibold tabular-nums">
                    {kpi.value}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{kpi.sub}</p>
                </div>
                <kpi.icon className="h-4 w-4 shrink-0 text-primary" />
              </div>
            </Card>
          ))}
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="line-items">Line Items</TabsTrigger>
            <TabsTrigger value="customer">Customer</TabsTrigger>
            <TabsTrigger value="terms">Terms & Conditions</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="audit">Audit Trail</TabsTrigger>
          </TabsList>
          <TabsContent value="line-items" className="mt-4">
            <LineItems
              lines={lines}
              items={items}
              currency={currency}
              subtotal={subtotal}
              discount={discount}
              tax={tax}
              total={total}
              onEdit={() => setEditMode(true)}
            />
          </TabsContent>
          <TabsContent value="customer" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>Customer</span>
                  <Button variant="link" size="sm" className="h-auto px-0" asChild>
                    <a href={`/crm/customers/${customer?.id}`}>View Customer</a>
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Detail label="Name" value={customer?.name} />
                <Detail label="Customer Code" value={customer?.code} />
                <Detail label="Contact Person" value={customer?.contact_person} />
                <Detail
                  label="Email"
                  value={
                    customer?.email ? (
                      <a className="text-primary" href={`mailto:${customer.email}`}>
                        {customer.email}
                      </a>
                    ) : null
                  }
                />
                <Detail label="Phone" value={customer?.phone} />
                <Detail
                  label="Payment Terms"
                  value={quote.payment_terms ?? customer?.payment_terms}
                />
                <Detail label="Currency" value={currency} />
                <Detail label="Billing Address" value={customer?.billing_address} />
                <Detail label="Shipping Address" value={customer?.shipping_address} />
                <Detail label="Salesperson" value={salesperson?.full_name} />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="terms" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Terms & Conditions</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <Detail label="Payment Terms" value={quote.payment_terms} />
                <Detail
                  label="Validity Period"
                  value={quote.expiry ? `Valid until ${dateFmt(quote.expiry)}` : "Not set"}
                />
                <Detail label="Delivery Terms" value={quote.delivery_terms} />
                <Detail label="Tax Conditions" value={quote.tax_terms ?? quote.tax_conditions} />
                <Detail label="Discount Conditions" value={quote.discount_terms} />
                <Detail label="Special Terms / Notes" value={quote.notes} />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="documents" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <AttachmentsPanel entityType="quote" entityId={id} />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="activity" className="mt-4">
            <DocumentTimeline
              entityType="quote"
              entityId={id}
              stages={workflow}
              currentStage={currentStatus}
            />
          </TabsContent>
          <TabsContent value="audit" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Audit Trail</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {audit.length ? (
                  audit.map((entry) => (
                    <div key={entry.id} className="border-b pb-3">
                      <p className="text-sm font-medium">
                        {entry.action} · {entry.actor_email ?? "System"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {dateTimeFmt(entry.created_at)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No audit activity yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        <div
          className={
            tab === "overview"
              ? "grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]"
              : "hidden"
          }
        >
          <div>
            <LineItems
              lines={lines}
              items={items}
              currency={currency}
              subtotal={subtotal}
              discount={discount}
              tax={tax}
              total={total}
              onEdit={() => setEditMode(true)}
            />
          </div>
          <aside className="flex min-w-0 flex-col gap-4">
            <SidebarCard title="Status & Workflow">
              <div className="flex flex-wrap items-center gap-1 text-xs">
                {workflow.map((stage, index) => (
                  <span key={stage} className="flex items-center gap-1">
                    <span
                      className={`rounded-full px-2 py-1 font-medium ${stage === currentStatus ? "bg-primary text-primary-foreground" : workflow.indexOf(currentStatus) >= index ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}
                    >
                      {stage}
                    </span>
                    {index < workflow.length - 1 && <span>→</span>}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{statusMessage}</p>
              {daysToExpiry != null && currentStatus !== "Expired" && (
                <p
                  className={`mt-2 text-xs ${daysToExpiry < 0 ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {daysToExpiry >= 0
                    ? `Quote expires in ${daysToExpiry} days (${dateFmt(quote.expiry)})`
                    : `Quote expired on ${dateFmt(quote.expiry)}`}
                </p>
              )}
            </SidebarCard>
            <SidebarCard title="Activity">
              <div className="space-y-3">
                {events.length ? (
                  events
                    .slice(-5)
                    .reverse()
                    .map((event) => (
                      <div key={event.id} className="flex gap-2">
                        <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                        <div>
                          <p className="text-xs font-medium">
                            {event.note ?? `Quote ${event.status.toLowerCase()}`}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {dateTimeFmt(event.created_at)} · {event.actor_email ?? "System"}
                          </p>
                        </div>
                      </div>
                    ))
                ) : (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                )}
              </div>
              <Button
                variant="link"
                size="sm"
                className="mt-3 h-auto px-0"
                onClick={() => setTab("activity")}
              >
                View All
              </Button>
            </SidebarCard>
            <SidebarCard title="Notes">
              <div className="flex items-start justify-between gap-3">
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {quote.notes || "No notes added."}
                </p>
                {canWrite && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditMode(true)}
                    aria-label="Edit quote notes"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </SidebarCard>
          </aside>
        </div>
      </div>
      <EmailDocumentDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        defaultTo={customer?.email ?? ""}
        defaultSubject={`Quote ${quote.number ?? ""}`}
        defaultMessage={`Dear ${customer?.name ?? "Customer"},\n\nPlease find attached quote ${quote.number ?? ""}.\n\nKind regards,\n${tenant?.name ?? ""}`}
        pdf={pdf}
        entityType="quote"
        entityId={id}
      />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete quote?</AlertDialogTitle>
            <AlertDialogDescription>
              This will hide the quote from active lists.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteMutation.mutate()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
