import { useEffect, useState } from "react";
import { useNavigate, useSearch, Link } from "@tanstack/react-router";
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
import { ArrowLeft, CheckCircle2, Loader2, Mail, Printer, Receipt, Save, Truck } from "lucide-react";
import { downloadDocumentPdf, type PdfDocInput } from "@/lib/document-pdf";
import { EmailDocumentDialog } from "@/components/email-document-dialog";
import { EmailStatus } from "@/components/email-status";
import { DocumentTimeline } from "@/components/document-timeline";
import { PostingDetailsDrawer } from "@/components/posting-details-drawer";
import { useDocumentBranding } from "@/hooks/use-document-branding";
import { logDocumentEvent } from "@/lib/document-events";
import { fetchRow, insertRow, updateRow, db, type Row } from "@/lib/typed-db";
import type { ShipmentInsert } from "@/lib/db-types";

const STATUSES = ["Draft", "In Transit", "Delivered", "Cancelled"] as const;
const FULFILLMENT_STAGES = ["Draft", "Confirmed", "Posted"];

export function ShipmentEditor({ id }: { id: string }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { tenant, user, profile, can } = useAuth();
  const canWrite = can(["sales.create", "sales.update", "inventory.create", "inventory.update"]);
  const isNew = id === "new";
  const search = useSearch({ strict: false }) as { order?: string; package?: string };
  const [emailOpen, setEmailOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const { branding } = useDocumentBranding("shipment");

  const { data: doc, isLoading } = useQuery({
    queryKey: ["shipments", "record", id],
    enabled: !isNew,
    queryFn: async () => {
      return fetchRow("shipments", id);
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["sales_orders", "picker"],
    queryFn: async () => {
      const { data, error } = await db.from("sales_orders")
        .select("id,number,customer_id")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: packages = [] } = useQuery({
    queryKey: ["packages", "picker"],
    queryFn: async () => {
      const { data, error } = await db.from("packages")
        .select("id,number,sales_order_id,customer_id")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers", "picker"],
    queryFn: async () => {
      const { data, error } = await db.from("customers")
        .select("id,name,email")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const [header, setHeader] = useState<ShipmentInsert>({
    number: "",
    sales_order_id: search?.order ?? "",
    package_id: search?.package ?? "",
    customer_id: "",
    carrier: "",
    service_level: "",
    tracking: "",
    ship_date: new Date().toISOString().slice(0, 10),
    delivery_date: "",
    cost: 0,
    status: "Draft",
    notes: "",
  });

  useEffect(() => {
    if (doc) setHeader(doc);
  }, [doc]);

  // Prefill customer from the originating order/package on a brand-new shipment
  useEffect(() => {
    if (!isNew) return;
    const pk = packages.find((p) => p.id === header.package_id);
    const so = orders.find((o) => o.id === (header.sales_order_id || pk?.sales_order_id));
    const customer = so?.customer_id ?? pk?.customer_id;
    if (customer && !header.customer_id)
      setHeader((h) => ({ ...h, customer_id: customer, sales_order_id: h.sales_order_id || pk?.sales_order_id || "" }));
  }, [isNew, packages, orders, header.package_id, header.sales_order_id, header.customer_id]);

  const customer = customers.find((c) => c.id === header.customer_id);
  const order = orders.find((o) => o.id === header.sales_order_id);
  const pkg = packages.find((p) => p.id === header.package_id);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("No workspace");
      const payload: ShipmentInsert = {
        number: header.number || `SHP-${Date.now().toString().slice(-8)}`,
        sales_order_id: header.sales_order_id || null,
        package_id: header.package_id || null,
        customer_id: header.customer_id || null,
        carrier: header.carrier || null,
        service_level: header.service_level || null,
        tracking: header.tracking || null,
        ship_date: header.ship_date || null,
        delivery_date: header.delivery_date || null,
        cost: header.cost === "" || header.cost == null ? null : Number(header.cost),
        status: header.status || "Draft",
        notes: header.notes || null,
      };
      if (isNew) {
        const data = await insertRow("shipments", { ...payload, tenant_id: tenant.id });
        return data.id;
      }
      await updateRow("shipments", id, payload);
      return id;
    },
    onSuccess: (newId) => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["shipments"] });
      if (isNew) nav({ to: `/sales/shipments/${newId}` as never });
    },
    onError: (e: Error) => toast.error(e.message ?? "Save failed"),
  });

  const post = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("post_shipment", { _shipment_id: id });
      if (error) throw error;
      if (tenant?.id) {
        await logDocumentEvent({
          tenantId: tenant.id,
          entityType: "shipment",
          entityId: id,
          status: "Posted",
          note: "Inventory movements and journal entry recorded",
          actorId: user?.id ?? null,
          actorEmail: profile?.email ?? null,
        });
      }
    },
    onSuccess: () => {
      toast.success("Shipment confirmed");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message ?? "Confirm failed"),
  });

  const buildPdf = (): PdfDocInput => ({
    title: "Shipment",
    number: header.number ?? "",
    companyName: tenant?.name ?? "Company",
    partyLabel: "Customer",
    partyName: customer?.name ?? "—",
    currency: "USD",
    meta: [
      { label: "Ship Date", value: header.ship_date ?? "" },
      { label: "Sales Order", value: order?.number ?? "—" },
      { label: "Package", value: pkg?.number ?? "—" },
      { label: "Carrier", value: header.carrier ?? "—" },
      { label: "Tracking", value: header.tracking ?? "—" },
      { label: "Status", value: header.status ?? "" },
    ],
    lines: [],
    totals: null,
    quantityOnly: true,
    notes: header.notes ?? null,
    branding,
  });

  if (!isNew && isLoading) {
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 w-full">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => nav({ to: "/sales/shipments" as never })}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground" />
              <h1 className="text-xl font-semibold truncate">{isNew ? "New Shipment" : header.number || "Shipment"}</h1>
              <Badge variant="secondary">{doc?.posted_at ? "Confirmed" : header.status}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {order ? (
                <>
                  Fulfilling{" "}
                  <Link className="underline hover:text-foreground" to={`/sales/orders/${order.id}` as never}>
                    {order.number}
                  </Link>
                </>
              ) : (
                "Not linked to a sales order"
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {!isNew && <EmailStatus entityType="shipment" entityId={id} />}
          {!isNew && (
            <>
              <Button variant="outline" size="sm" onClick={() => downloadDocumentPdf(buildPdf())}>
                <Printer className="h-4 w-4 mr-1.5" /> Print PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEmailOpen(true)}>
                <Mail className="h-4 w-4 mr-1.5" /> Email
              </Button>
            </>
          )}
          {!isNew && (
            <Button variant="outline" size="sm" onClick={() => setPostOpen(true)}>
              <Receipt className="h-4 w-4 mr-1.5" /> Inventory movements
            </Button>
          )}

          {canWrite && !isNew && !doc?.posted_at && (
            <Button size="sm" disabled={post.isPending} onClick={() => post.mutate()}>
              {post.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
              )}{" "}
              Confirm Shipment
            </Button>
          )}
          {canWrite && (
            <Button
              size="sm"
              variant={doc?.posted_at ? "default" : "secondary"}
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1.5" />
              )}{" "}
              Save
            </Button>
          )}
        </div>
      </div>

      <Card className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="grid gap-1.5">
          <Label>Shipment #</Label>
          <Input
            value={header.number ?? ""}
            onChange={(e) => setHeader({ ...header, number: e.target.value })}
            placeholder="Auto"
            disabled={!canWrite}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Sales Order</Label>
          <Select
            value={header.sales_order_id ?? ""}
            onValueChange={(v) => setHeader({ ...header, sales_order_id: v })}
            disabled={!canWrite}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select order…" />
            </SelectTrigger>
            <SelectContent>
              {orders.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.number}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Package</Label>
          <Select
            value={header.package_id ?? ""}
            onValueChange={(v) => setHeader({ ...header, package_id: v })}
            disabled={!canWrite}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select package…" />
            </SelectTrigger>
            <SelectContent>
              {packages
                .filter((p) => !header.sales_order_id || p.sales_order_id === header.sales_order_id)
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.number}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Customer</Label>
          <Select
            value={header.customer_id ?? ""}
            onValueChange={(v) => setHeader({ ...header, customer_id: v })}
            disabled={!canWrite}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select customer…" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Ship Date</Label>
          <Input
            type="date"
            value={header.ship_date ?? ""}
            onChange={(e) => setHeader({ ...header, ship_date: e.target.value })}
            disabled={!canWrite}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Delivery Date</Label>
          <Input
            type="date"
            value={header.delivery_date ?? ""}
            onChange={(e) => setHeader({ ...header, delivery_date: e.target.value })}
            disabled={!canWrite}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Carrier</Label>
          <Input
            value={header.carrier ?? ""}
            onChange={(e) => setHeader({ ...header, carrier: e.target.value })}
            disabled={!canWrite}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Service Level</Label>
          <Input
            value={header.service_level ?? ""}
            onChange={(e) => setHeader({ ...header, service_level: e.target.value })}
            disabled={!canWrite}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Tracking</Label>
          <Input
            value={header.tracking ?? ""}
            onChange={(e) => setHeader({ ...header, tracking: e.target.value })}
            disabled={!canWrite}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Cost</Label>
          <Input
            type="number"
            step="any"
            value={header.cost ?? 0}
            onChange={(e) => setHeader({ ...header, cost: e.target.value })}
            disabled={!canWrite}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Status</Label>
          <Select
            value={header.status ?? "Draft"}
            onValueChange={(v) => setHeader({ ...header, status: v })}
            disabled={!canWrite}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Notes</Label>
          <Textarea
            rows={1}
            value={header.notes ?? ""}
            onChange={(e) => setHeader({ ...header, notes: e.target.value })}
            disabled={!canWrite}
          />
        </div>
      </Card>

      {!isNew && (
        <DocumentTimeline
          entityType="shipment"
          entityId={id}
          stages={FULFILLMENT_STAGES}
          currentStage={doc?.posted_at ? "Posted" : header.status === "Draft" ? "Draft" : "Confirmed"}
        />
      )}

      {!isNew && (
        <PostingDetailsDrawer
          open={postOpen}
          onOpenChange={setPostOpen}
          refType="shipment"
          refIds={[id, header.package_id]}
          title={`shipment ${header.number ?? ""}`}
          sources={[
            ...(order ? [{ label: `Sales Order ${order.number}`, to: `/sales/orders/${order.id}` }] : []),
            ...(pkg ? [{ label: `Package ${pkg.number}`, to: `/sales/packages/${pkg.id}` }] : []),
          ]}
        />
      )}

      {!isNew && (
        <EmailDocumentDialog
          open={emailOpen}
          onOpenChange={setEmailOpen}
          defaultTo={customer?.email ?? ""}
          defaultSubject={`Shipment ${header.number ?? ""}`}
          defaultMessage={`Dear ${customer?.name ?? "Customer"},\n\nYour shipment ${header.number ?? ""} is on its way${header.carrier ? ` with ${header.carrier}` : ""}${header.tracking ? ` (tracking ${header.tracking})` : ""}.\n\nKind regards,\n${tenant?.name ?? ""}`}
          pdf={buildPdf}
          entityType="shipment"
          entityId={id}
        />
      )}
    </div>
  );
}
