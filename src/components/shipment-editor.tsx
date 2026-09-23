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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mail,
  Printer,
  Receipt,
  Save,
  Truck,
} from "lucide-react";
import { downloadDocumentPdf, type PdfDocInput } from "@/lib/document-pdf";
import { EmailDocumentDialog } from "@/components/email-document-dialog";
import { EmailStatus } from "@/components/email-status";
import { DocumentTimeline } from "@/components/document-timeline";
import { PostingDetailsDrawer } from "@/components/posting-details-drawer";
import { useDocumentBranding } from "@/hooks/use-document-branding";
import { logDocumentEvent } from "@/lib/document-events";
import { fetchRow, insertRow, updateRow, db, type Row } from "@/lib/typed-db";
import type { ShipmentInsert } from "@/lib/db-types";
import { QueryError, QueryLoading } from "@/components/query-state";

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
  const [salesOrderIds, setSalesOrderIds] = useState<string[]>(search?.order ? [search.order] : []);
  const { branding } = useDocumentBranding("shipment");

  const {
    data: doc,
    isLoading,
    isError: isDocError,
    error: docError,
    refetch: refetchDoc,
  } = useQuery({
    queryKey: ["shipments", "record", id],
    enabled: !isNew,
    queryFn: async () => {
      return fetchRow("shipments", id);
    },
  });

  const {
    data: shipmentOrderRows = [],
    isLoading: ordersLoading,
    isError: isOrdersError,
    error: ordersError,
    refetch: refetchOrders,
  } = useQuery({
    queryKey: ["shipments", "sales-orders", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await db
        .from("shipment_sales_orders")
        .select("sales_order_id")
        .eq("shipment_id", id);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const {
    data: orders = [],
    isLoading: ordersPickerLoading,
    isError: isOrdersPickerError,
    error: ordersPickerError,
    refetch: refetchOrdersPicker,
  } = useQuery({
    queryKey: ["sales_orders", "picker"],
    queryFn: async () => {
      const { data, error } = await db
        .from("sales_orders")
        .select("id,number,customer_id")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const {
    data: packages = [],
    isLoading: packagesPickerLoading,
    isError: isPackagesPickerError,
    error: packagesPickerError,
    refetch: refetchPackagesPicker,
  } = useQuery({
    queryKey: ["packages", "picker"],
    queryFn: async () => {
      const { data, error } = await db
        .from("packages")
        .select("id,number,sales_order_id,customer_id")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const {
    data: customers = [],
    isLoading: customersPickerLoading,
    isError: isCustomersPickerError,
    error: customersPickerError,
    refetch: refetchCustomersPicker,
  } = useQuery({
    queryKey: ["customers", "picker"],
    queryFn: async () => {
      const { data, error } = await db
        .from("customers")
        .select("id,name,email")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const [header, setHeader] = useState<Row>({
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

  useEffect(() => {
    if (isNew) return;
    const ids = shipmentOrderRows.map((row) => row.sales_order_id).filter(Boolean);
    setSalesOrderIds(ids.length ? ids : doc?.sales_order_id ? [doc.sales_order_id] : []);
  }, [isNew, shipmentOrderRows, doc?.sales_order_id]);

  // Prefill customer from the originating order/package on a brand-new shipment
  useEffect(() => {
    if (!isNew) return;
    const pk = packages.find((p) => p.id === header.package_id);
    const so = orders.find(
      (o) => o.id === (salesOrderIds[0] || header.sales_order_id || pk?.sales_order_id),
    );
    const customer = so?.customer_id ?? pk?.customer_id;
    if (customer && !header.customer_id)
      setHeader((h) => ({
        ...h,
        customer_id: customer,
        sales_order_id: h.sales_order_id || salesOrderIds[0] || pk?.sales_order_id || "",
      }));
  }, [
    isNew,
    packages,
    orders,
    header.package_id,
    header.sales_order_id,
    header.customer_id,
    salesOrderIds,
  ]);

  const customer = customers.find((c) => c.id === header.customer_id);
  const linkedOrders = orders.filter((o) => salesOrderIds.includes(o.id));
  const order = linkedOrders[0] ?? orders.find((o) => o.id === header.sales_order_id);
  const pkg = packages.find((p) => p.id === header.package_id);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("No workspace");
      if (!salesOrderIds.length)
        throw new Error("Select at least one sales order to load on this shipment");
      const selectedOrders = orders.filter((row) => salesOrderIds.includes(row.id));
      if (selectedOrders.length !== salesOrderIds.length)
        throw new Error("One or more selected sales orders are unavailable");
      const customerIds = [
        ...new Set(selectedOrders.map((row) => row.customer_id).filter(Boolean)),
      ];
      if (customerIds.length > 1)
        throw new Error("A shipment can only combine sales orders for the same customer");
      if (header.customer_id && customerIds[0] && header.customer_id !== customerIds[0])
        throw new Error("Shipment customer must match the selected sales orders");
      const selectedPackage = packages.find((row) => row.id === header.package_id);
      if (
        selectedPackage?.sales_order_id &&
        !salesOrderIds.includes(selectedPackage.sales_order_id)
      )
        throw new Error(
          "Selected package does not belong to a sales order loaded on this shipment",
        );
      const payload: ShipmentInsert = {
        tenant_id: tenant.id,
        number: header.number || `SHP-${Date.now().toString().slice(-8)}`,
        // Legacy column retains the first order; shipment_sales_orders is authoritative.
        sales_order_id: salesOrderIds[0] || null,
        package_id: header.package_id || null,
        customer_id: customerIds[0] || header.customer_id || null,
        carrier: header.carrier || null,
        service_level: header.service_level || null,
        tracking: header.tracking || null,
        ship_date: header.ship_date || null,
        delivery_date: header.delivery_date || null,
        cost: header.cost === "" || header.cost == null ? null : Number(header.cost),
        status: header.status || "Draft",
        notes: header.notes || null,
      };
      let shipmentId: string;
      if (isNew) {
        const data = await insertRow("shipments", { ...payload, tenant_id: tenant.id });
        shipmentId = data.id;
      } else {
        await updateRow("shipments", id, payload);
        shipmentId = id;
      }
      const { error } = await db.rpc("replace_shipment_sales_orders", {
        _shipment_id: shipmentId,
        _sales_order_ids: salesOrderIds,
      });
      if (error) throw error;
      return shipmentId;
    },
    onSuccess: (newId) => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["shipments"] });
      qc.invalidateQueries({ queryKey: ["sales_orders"] });
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
      { label: "Sales Orders", value: linkedOrders.map((row) => row.number).join(", ") || "—" },
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

  if (
    (!isNew && (isLoading || ordersLoading)) ||
    ordersPickerLoading ||
    packagesPickerLoading ||
    customersPickerLoading
  )
    return (
      <div className="p-8">
        <QueryLoading label="Loading shipment…" />
      </div>
    );
  if (
    (!isNew && (isDocError || isOrdersError)) ||
    isOrdersPickerError ||
    isPackagesPickerError ||
    isCustomersPickerError
  )
    return (
      <div className="p-8">
        <QueryError
          error={
            docError ??
            ordersError ??
            ordersPickerError ??
            packagesPickerError ??
            customersPickerError
          }
          retry={() => {
            refetchDoc();
            refetchOrders();
            refetchOrdersPicker();
            refetchPackagesPicker();
            refetchCustomersPicker();
          }}
          label="Could not load this shipment."
        />
      </div>
    );

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 w-full">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => nav({ to: "/sales/shipments" as never })}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground" />
              <h1 className="text-xl font-semibold truncate">
                {isNew ? "New Shipment" : header.number || "Shipment"}
              </h1>
              <Badge variant="secondary">{doc?.posted_at ? "Confirmed" : header.status}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {linkedOrders.length ? (
                <>
                  Loading{" "}
                  {linkedOrders.map((linkedOrder, index) => (
                    <span key={linkedOrder.id}>
                      {index > 0 && ", "}
                      <Link
                        className="underline hover:text-foreground"
                        to={`/sales/orders/${linkedOrder.id}` as never}
                      >
                        {linkedOrder.number}
                      </Link>
                    </span>
                  ))}
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
        <div className="grid gap-1.5 md:col-span-4">
          <Label>Sales Orders being loaded</Label>
          <div className="grid max-h-40 grid-cols-1 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-3">
            {orders.map((o) => (
              <label className="flex items-center gap-2 text-sm" key={o.id}>
                <input
                  type="checkbox"
                  checked={salesOrderIds.includes(o.id)}
                  disabled={!canWrite || !!doc?.posted_at}
                  onChange={() => {
                    const next = salesOrderIds.includes(o.id)
                      ? salesOrderIds.filter((orderId) => orderId !== o.id)
                      : [...salesOrderIds, o.id];
                    const nextCustomers = orders
                      .filter((row) => next.includes(row.id))
                      .map((row) => row.customer_id)
                      .filter(Boolean);
                    if (new Set(nextCustomers).size > 1) {
                      toast.error("Select sales orders for the same customer");
                      return;
                    }
                    setSalesOrderIds(next);
                    setHeader((h) => ({
                      ...h,
                      sales_order_id: next[0] ?? "",
                      customer_id: nextCustomers[0] ?? h.customer_id,
                    }));
                  }}
                />
                <span>{o.number ?? "Sales Order"}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            One shipment can load multiple sales orders for the same customer.
          </p>
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
                .filter((p) => salesOrderIds.includes(p.sales_order_id))
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
          currentStage={
            doc?.posted_at ? "Posted" : header.status === "Draft" ? "Draft" : "Confirmed"
          }
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
            ...linkedOrders.map((linkedOrder) => ({
              label: `Sales Order ${linkedOrder.number}`,
              to: `/sales/orders/${linkedOrder.id}`,
            })),
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
