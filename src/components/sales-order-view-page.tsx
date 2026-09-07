import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentEvents } from "@/lib/document-events";
import { useDocumentBranding } from "@/hooks/use-document-branding";
import { downloadDocumentPdf, type PdfDocInput } from "@/lib/document-pdf";
import { DocumentEditor } from "@/components/document-editor";
import { FulfillmentTimeline } from "@/components/fulfillment-timeline";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { ArrowLeft, Download, Pencil, ShoppingCart, Trash2, Truck, Wallet } from "lucide-react";
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
                <th className="px-3 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
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
                    <td className="px-3 py-3 text-right font-mono">
                      {money(line.line_total, currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="space-y-2 border-t p-4">
          <Total label="Subtotal" value={money(order.subtotal, currency)} />
          <Total label="Discount" value={money(order.discount_total, currency)} />
          <Total label="Tax" value={money(order.tax_total, currency)} />
          <Total label="Grand Total" value={money(order.grand_total, currency)} bold />
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
  const paid = invoices.reduce((sum, invoice) => sum + Number(invoice.amount_paid ?? 0), 0);
  const outstanding = Math.max(0, Number(order.grand_total ?? 0) - paid);
  const canDelete = can(["sales.delete", "admin"]);
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
              <p className="mt-1 text-sm text-muted-foreground">
                {customer?.name ?? "No customer"} · Order Date: {dateFmt(order.date)}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {can(["sales.create", "sales.update"]) && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="mr-1.5 h-4 w-4" /> Edit
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => downloadDocumentPdf(pdf)}>
              <Download className="mr-1.5 h-4 w-4" /> PDF
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={!canDelete}
              onClick={() => setDeleteOpen(true)}
              aria-label="Delete order"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Order Total", value: money(order.grand_total, currency), icon: ShoppingCart },
            { label: "Outstanding", value: money(outstanding, currency), icon: Wallet },
            { label: "Fulfillment", value: `${Math.round(progress)}%`, icon: Truck },
            { label: "Payments", value: money(paid, currency), icon: Wallet },
            { label: "Order Date", value: dateFmt(order.date), icon: CalendarDays },
          ].map((kpi) => (
            <Card key={kpi.label} className="p-4">
              <div className="flex justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className="mt-1 font-mono text-lg font-semibold">{kpi.value}</p>
                </div>
                <kpi.icon className="h-4 w-4 text-primary" />
              </div>
            </Card>
          ))}
        </div>
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
                <CardTitle className="text-sm">Customer</CardTitle>
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
                <Info label="Shipping Address" value={customer?.shipping_address} />
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
          </TabsContent>
          <TabsContent value="invoices" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Invoices</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {invoices.length
                    ? `${invoices.length} invoice(s) linked to this order.`
                    : "No invoices have been created for this order."}
                </p>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="payments" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {payments.length
                    ? `${payments.length} payment(s) recorded.`
                    : "No payments recorded."}
                </p>
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
        </Tabs>
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
            <SideCard title="Order Status & Fulfillment">
              <p className="text-sm text-muted-foreground">
                Current status: {order.status ?? "Draft"}
              </p>
              <div className="mt-4 h-2 rounded-full bg-muted">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {fulfilled} / {ordered} units fulfilled
              </p>
            </SideCard>
            <SideCard title="Activity">
              {events.length ? (
                events.slice(-5).map((event) => (
                  <p key={event.id} className="border-b py-2 text-xs">
                    {event.note ?? event.status}
                    <br />
                    <span className="text-muted-foreground">{dateTimeFmt(event.created_at)}</span>
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
      </div>
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
