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
  Package,
  Plus,
  Printer,
  Receipt,
  Save,
  Trash2,
} from "lucide-react";
import { downloadDocumentPdf, type PdfDocInput } from "@/lib/document-pdf";
import { EmailDocumentDialog } from "@/components/email-document-dialog";
import { EmailStatus } from "@/components/email-status";
import { DocumentTimeline } from "@/components/document-timeline";
import { PostingDetailsDrawer } from "@/components/posting-details-drawer";
import { useDocumentBranding } from "@/hooks/use-document-branding";
import { logDocumentEvent } from "@/lib/document-events";
import { fetchRow, insertRow, updateRow, db, type Row } from "@/lib/typed-db";
import type {
  PackageInsert,
  PackageLine,
  PackageLineInsert,
  SalesOrder,
  Customer,
} from "@/lib/db-types";
import { getPackagePickerItems } from "./package-editor-utils";

const STATUSES = ["Draft", "Packed", "Shipped", "Delivered", "Cancelled"] as const;

interface Line {
  line_no: number;
  item_id: string | null;
  description: string;
  quantity: number;
  sales_order_line_id: string | null;
  location_id: string | null;
}

const NO_LOCATION = "__none__";


interface RpcClient {
  rpc: <T>(
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: { message?: string } | null }>;
}

const rpcClient: RpcClient = db as RpcClient;


export function PackageEditor({ id }: { id: string }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const search = useSearch({ strict: false }) as { order?: string };
  const { tenant, user, profile, can } = useAuth();
  const canWrite = can(["sales.create", "sales.update"]);
  const isNew = id === "new";
  const [emailOpen, setEmailOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const { branding } = useDocumentBranding("package");

  const { data: doc, isLoading } = useQuery({
    queryKey: ["packages", id],
    enabled: !isNew,
    queryFn: async () => {
      return fetchRow("packages", id);
    },
  });

  const { data: linesData } = useQuery({
    queryKey: ["package_lines", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await db
        .from("package_lines")
        .select("*")
        .eq("document_id", id)
        .is("deleted_at", null)
        .order("line_no");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: orders = [] } = useQuery({
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
    staleTime: 30_000,
  });

  const { data: customers = [] } = useQuery({
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
    staleTime: 30_000,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses", "picker"],
    queryFn: async () => {
      const { data, error } = await db
        .from("warehouses")
        .select("id,name")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    staleTime: 30_000,
  });

  const { data: items = [] } = useQuery({
    queryKey: ["items", "picker"],
    queryFn: async () => {
      const { data, error } = await db
        .from("items")
        .select("id,name,sku")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    staleTime: 30_000,
  });

  const [header, setHeader] = useState<Row>({
    number: "",
    sales_order_id: search?.order ?? "",
    customer_id: "",
    warehouse_id: "",
    date: new Date().toISOString().slice(0, 10),
    weight: 0,
    carrier: "",
    tracking: "",
    status: "Draft",
    notes: "",
    length: 0,
    width: 0,
    height: 0,
    packing_status: "Draft",
    shipment_status: "Not Shipped",
  });
  const [lines, setLines] = useState<Line[]>([]);

  const shipFromWarehouse = (header.warehouse_id as string) || null;

  // Stock available per bin/location for the selected ship-from warehouse
  const { data: binStock = [] } = useQuery({
    queryKey: ["inventory_location_stock", "for-package", shipFromWarehouse],
    enabled: !!shipFromWarehouse,
    queryFn: async () => {
      const { data, error } = await db
        .from("inventory_location_stock")
        .select("item_id,location_id,location_code,zone_name,on_hand")
        .eq("warehouse_id", shipFromWarehouse!)
        .order("location_code");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const binsForItem = (itemId: string | null) =>
    itemId ? binStock.filter((b) => b.item_id === itemId && Number(b.on_hand || 0) > 0) : [];
  const binLabel = (locationId: string | null) => {
    const bin = binStock.find((b) => b.location_id === locationId);
    if (!bin) return "Any bin";
    return `${bin.location_code}${bin.zone_name ? ` · ${bin.zone_name}` : ""}`;
  };
  const binOnHand = (itemId: string | null, locationId: string | null) =>
    Number(
      binStock.find((b) => b.item_id === itemId && b.location_id === locationId)?.on_hand ?? 0,
    );


  useEffect(() => {
    if (doc) setHeader(doc);
  }, [doc]);
  useEffect(() => {
    if (linesData)
      setLines(
        linesData.map(
          (l): Line => ({
            line_no: l.line_no,
            item_id: l.item_id,
            description: l.description ?? "",
            quantity: Number(l.quantity),
            sales_order_line_id: null,
            location_id: (l.location_id as string | null) ?? null,
          }),
        ),
      );
  }, [linesData]);


  const sourceOrderId = header.sales_order_id || null;

  // The originating sales order defines what may be packed (new and edit mode)
  const { data: orderLines = [] } = useQuery({
    queryKey: ["sales_order_lines", "for-package", sourceOrderId],
    enabled: !!sourceOrderId,
    queryFn: async () => {
      const { data, error } = await db
        .from("sales_order_lines")
        .select("id,line_no,item_id,description,quantity")
        .eq("document_id", sourceOrderId!)
        .is("deleted_at", null)
        .order("line_no");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  // Quantities already packed on the order's other (non-cancelled) packages
  const { data: packedElsewhere = {} } = useQuery({
    queryKey: ["package_lines", "packed-for-order", sourceOrderId, id],
    enabled: !!sourceOrderId,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data: pkgs, error: pkgErr } = await db
        .from("packages")
        .select("id,status")
        .eq("sales_order_id", sourceOrderId!)
        .is("deleted_at", null);
      if (pkgErr) throw pkgErr;
      const ids = ((pkgs ?? []) as Row[])
        .filter((p) => p.status !== "Cancelled" && p.id !== id)
        .map((p) => p.id as string);
      if (!ids.length) return {};
      const { data, error } = await db
        .from("package_lines")
        .select("item_id,quantity")
        .in("document_id", ids)
        .is("deleted_at", null);
      if (error) throw error;
      const acc: Record<string, number> = {};
      for (const l of (data ?? []) as Row[]) {
        if (!l.item_id) continue;
        acc[l.item_id as string] = (acc[l.item_id as string] ?? 0) + Number(l.quantity || 0);
      }
      return acc;
    },
  });

  const packagePickerItems = getPackagePickerItems(
    items as Array<{ id: string; name?: string; sku?: string }>,
    orderLines,
    sourceOrderId,
  );

  const orderLineFor = (itemId: string | null) => orderLines.find((o) => o.item_id === itemId);
  const remainingQty = (itemId: string | null, excludeIdx?: number) => {
    if (!itemId) return 0;
    const ordered = Number(orderLineFor(itemId)?.quantity ?? 0);
    const packedHere = lines.reduce(
      (s, l, i) => (i === excludeIdx || l.item_id !== itemId ? s : s + (Number(l.quantity) || 0)),
      0,
    );
    return ordered - (packedElsewhere[itemId] ?? 0) - packedHere;
  };

  useEffect(() => {
    if (!isNew || !sourceOrderId) return;
    const so = orders.find((o) => o.id === sourceOrderId);
    if (so?.customer_id)
      setHeader((h) => (h.customer_id ? h : { ...h, customer_id: so.customer_id }));
  }, [isNew, sourceOrderId, orders]);

  // Seed a new package with whatever is still outstanding on the order
  useEffect(() => {
    if (!isNew || !orderLines.length) return;
    setLines((prev) =>
      prev.length
        ? prev
        : orderLines
            .map(
              (l): Line => ({
                line_no: 0,
                item_id: (l.item_id as string) ?? null,
                description: (l.description as string) ?? "",
                quantity: Number(l.quantity || 0) - (packedElsewhere[l.item_id as string] ?? 0),
                sales_order_line_id: l.id as string,
                location_id: null,
              }),
            )
            .filter((l) => l.quantity > 0)
            .map((l, i): Line => ({ ...l, line_no: i + 1 })),
    );
  }, [isNew, orderLines, packedElsewhere]);

  // Default each line to the fullest bin holding that item, once bin stock is known
  useEffect(() => {
    if (!binStock.length) return;
    setLines((prev) => {
      let changed = false;
      const next = prev.map((l) => {
        if (l.location_id) return l;
        const best = binsForItem(l.item_id).sort(
          (a, b) => Number(b.on_hand || 0) - Number(a.on_hand || 0),
        )[0];
        if (!best) return l;
        changed = true;
        return { ...l, location_id: best.location_id as string };
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binStock]);

  const addLine = () => {
    const open = orderLines.find((o) => remainingQty(o.item_id) > 0);
    const bestBin = binsForItem((open?.item_id as string) ?? null).sort(
      (a, b) => Number(b.on_hand || 0) - Number(a.on_hand || 0),
    )[0];
    setLines((p) => [
      ...p,
      {
        line_no: p.length + 1,
        item_id: (open?.item_id as string) ?? null,
        description: (open?.description as string) ?? "",
        quantity: open ? remainingQty(open.item_id) : 1,
        sales_order_line_id: (open?.id as string) ?? null,
        location_id: (bestBin?.location_id as string) ?? null,
      },
    ]);
  };

  const updateLine = (idx: number, patch: Partial<Line>) =>
    setLines((p) => p.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const removeLine = (idx: number) =>
    setLines((p) => p.filter((_, i) => i !== idx).map((l, i) => ({ ...l, line_no: i + 1 })));

  const totalQty = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  const posted = !!doc?.posted_at;
  const editable = canWrite && !posted;
  const customer = customers.find((c) => c.id === header.customer_id);
  const order = orders.find((o) => o.id === header.sales_order_id);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("No tenant");
      if (!header.customer_id) throw new Error("Please select a customer");

      const payload: PackageInsert = { ...header, tenant_id: tenant.id };
      payload.sales_order_id = header.sales_order_id || null;
      payload.warehouse_id = header.warehouse_id || null;
      payload.weight = Number(header.weight) || 0;
      const {
        id: _id,
        created_at: _createdAt,
        updated_at: _updatedAt,
        posted_at: _postedAt,
        ...editablePayload
      } = payload;

      if (!lines.length) throw new Error("Add at least one item to pack");
      if (lines.some((l) => !l.item_id)) throw new Error("Every packed line needs an item");
      if (lines.some((l) => !(Number(l.quantity) > 0)))
        throw new Error("Every packed line needs a quantity greater than zero");
      const over = lines.findIndex((l, i) => remainingQty(l.item_id, i) < Number(l.quantity));
      if (over >= 0) {
        const name =
          items.find((i) => i.id === lines[over]!.item_id)?.name ??
          lines[over]!.description ??
          "this item";
        throw new Error(
          `Packed quantity for ${name} is more than the sales order still has outstanding`,
        );
      }
      const shortBin = lines.findIndex(
        (l) =>
          l.location_id &&
          binOnHand(l.item_id, l.location_id) <
            lines
              .filter((x) => x.item_id === l.item_id && x.location_id === l.location_id)
              .reduce((s, x) => s + (Number(x.quantity) || 0), 0),
      );
      if (shortBin >= 0) {
        throw new Error(
          `${binLabel(lines[shortBin]!.location_id)} does not hold enough stock for ${
            lines[shortBin]!.description || "this item"
          }`,
        );
      }

      let docId: string | null = isNew ? null : id;
      if (isNew) {
        if (!payload.sales_order_id) throw new Error("Please select a Sales Order");
        if (!payload.warehouse_id) throw new Error("Please select a warehouse");
        const { data, error } = await rpcClient.rpc<string>("create_package_from_sales_order", {
          _sales_order_id: payload.sales_order_id,
          _warehouse_id: payload.warehouse_id,
          _lines: lines.map((line, index) => ({
            sales_order_line_id: line.sales_order_line_id ?? orderLineFor(line.item_id)?.id,
            line_no: index + 1,
            quantity: Number(line.quantity) || 0,
            location_id: line.location_id,
          })),

          _weight: payload.weight,
          _length: payload.length,
          _width: payload.width,
          _height: payload.height,
          _notes: payload.notes,
        });
        if (error) throw error;
        docId = data as string;
      } else {
        await updateRow("packages", id, editablePayload);

        // Replace the package's lines: retire the current ones, then write the edited set
        const { error: retireError } = await db
          .from("package_lines")
          .update({ deleted_at: new Date().toISOString() })
          .eq("document_id", docId!)
          .is("deleted_at", null);
        if (retireError) throw retireError;

        const { error } = await db.from("package_lines").insert(
          lines.map((l, i): PackageLineInsert => ({
            tenant_id: tenant.id,
            document_id: docId!,
            line_no: i + 1,
            item_id: l.item_id || null,
            description: l.description,
            quantity: Number(l.quantity) || 0,
            location_id: l.location_id || null,
          })),

        );
        if (error) throw error;
      }
      if (tenant?.id && docId) {
        await logDocumentEvent({
          tenantId: tenant.id,
          entityType: "package",
          entityId: docId,
          status: isNew ? "Draft" : header.status || "Draft",
          note: isNew ? "Package created" : `Saved as ${header.status || "Draft"}`,
          actorId: user?.id ?? null,
          actorEmail: profile?.email ?? null,
        });
      }
      return docId;
    },
    onSuccess: (docId) => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["packages"] });
      qc.invalidateQueries({ queryKey: ["package_lines"] });
      qc.invalidateQueries({ queryKey: ["document_events"] });
      if (isNew && docId) nav({ to: `/sales/packages/${docId}` as never });
    },
    onError: (e: Error) => toast.error(e.message ?? "Save failed"),
  });

  const confirmPackage = useMutation({
    mutationFn: async () => {
      const { error } = await rpcClient.rpc<null>("post_package", { _package_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Package confirmed — stock and journal entry recorded");
      qc.invalidateQueries();
      setPostOpen(true);
    },
    onError: (e: Error) => toast.error(e.message ?? "Confirm failed"),
  });

  const transition = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await rpcClient.rpc<null>("transition_package", {
        _package_id: id,
        _new_status: status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Package status updated");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message ?? "Unable to update package"),
  });

  const buildPdf = (): PdfDocInput => ({
    title: "Packing Slip",
    number: header.number ?? "",
    companyName: tenant?.name ?? "Company",
    partyLabel: "Ship To",
    partyName: customer?.name ?? "—",
    currency: "",
    meta: [
      { label: "Date", value: header.date ?? "" },
      { label: "Sales Order", value: order?.number ?? "—" },
      { label: "Carrier", value: header.carrier || "—" },
      { label: "Tracking", value: header.tracking || "—" },
      { label: "Status", value: posted ? "Confirmed" : (header.status ?? "") },
    ],
    lines: lines.map((l) => ({ description: l.description || "", quantity: l.quantity })),
    totals: null,
    notes: header.notes ?? null,
    quantityOnly: true,
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
          <Button variant="ghost" size="sm" onClick={() => nav({ to: "/sales/packages" as never })}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <h1 className="text-xl font-semibold truncate">
                {isNew ? "New Package" : header.number || "Package"}
              </h1>
              <Badge variant="secondary">{posted ? "Confirmed" : header.status}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lines.length} line{lines.length === 1 ? "" : "s"} · {totalQty} unit
              {totalQty === 1 ? "" : "s"} packed
              {order && (
                <>
                  {" "}
                  · from{" "}
                  <Link
                    className="underline hover:text-foreground"
                    to={`/sales/orders/${order.id}` as never}
                  >
                    {order.number}
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {!isNew && <EmailStatus entityType="package" entityId={id} />}
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
          {!isNew && posted && (
            <Button variant="outline" size="sm" onClick={() => setPostOpen(true)}>
              <Receipt className="h-4 w-4 mr-1.5" /> Post details
            </Button>
          )}
          {!isNew && canWrite && header.status === "Draft" && (
            <Button
              size="sm"
              onClick={() => transition.mutate("Packed")}
              disabled={transition.isPending}
            >
              Pack
            </Button>
          )}
          {!isNew && canWrite && ["Packed", "Ready to Ship"].includes(header.status) && (
            <Button
              size="sm"
              onClick={() => transition.mutate("Shipped")}
              disabled={transition.isPending}
            >
              Ship
            </Button>
          )}
          {!isNew && canWrite && header.status === "Shipped" && (
            <Button
              size="sm"
              onClick={() => transition.mutate("Delivered")}
              disabled={transition.isPending}
            >
              Mark Delivered
            </Button>
          )}
          {canWrite && !isNew && !posted && (
            <Button
              variant="default"
              size="sm"
              disabled={confirmPackage.isPending}
              onClick={() => confirmPackage.mutate()}
            >
              {confirmPackage.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
              )}{" "}
              Confirm &amp; Post
            </Button>
          )}

          {editable && (
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
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
          <Label>Package #</Label>
          <Input
            value={header.number ?? ""}
            onChange={(e) => setHeader({ ...header, number: e.target.value })}
            placeholder="Auto"
            disabled={!editable}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Sales Order</Label>
          <Select
            value={header.sales_order_id ?? ""}
            onValueChange={(v) => {
              const so = orders.find((o) => o.id === v);
              setHeader({
                ...header,
                sales_order_id: v,
                customer_id: header.customer_id || so?.customer_id || "",
              });
            }}
            disabled={!editable}
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
          <Label>Customer</Label>
          <Select
            value={header.customer_id ?? ""}
            onValueChange={(v) => setHeader({ ...header, customer_id: v })}
            disabled={!editable}
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
          <Label>Packed Date</Label>
          <Input
            type="date"
            value={header.date ?? ""}
            onChange={(e) => setHeader({ ...header, date: e.target.value })}
            disabled={!editable}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Ship From Warehouse</Label>
          <Select
            value={header.warehouse_id ?? ""}
            onValueChange={(v) => setHeader({ ...header, warehouse_id: v })}
            disabled={!editable}
          >
            <SelectTrigger>
              <SelectValue placeholder="Default warehouse" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Weight (kg)</Label>
          <Input
            type="number"
            step="any"
            value={header.weight ?? 0}
            onChange={(e) => setHeader({ ...header, weight: Number(e.target.value) })}
            disabled={!editable}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Carrier</Label>
          <Input
            value={header.carrier ?? ""}
            onChange={(e) => setHeader({ ...header, carrier: e.target.value })}
            placeholder="DHL, FedEx…"
            disabled={!editable}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Tracking #</Label>
          <Input
            value={header.tracking ?? ""}
            onChange={(e) => setHeader({ ...header, tracking: e.target.value })}
            disabled={!editable}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Status</Label>
          <Select
            value={header.status ?? "Draft"}
            onValueChange={(v) => setHeader({ ...header, status: v })}
            disabled={!editable}
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
        <div className="grid gap-1.5 md:col-span-3">
          <Label>Notes</Label>
          <Textarea
            rows={1}
            value={header.notes ?? ""}
            onChange={(e) => setHeader({ ...header, notes: e.target.value })}
            disabled={!editable}
          />
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
          <div className="text-sm font-medium">Packed items</div>
          {editable && (
            <Button size="sm" variant="outline" onClick={addLine}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add line
            </Button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/10 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="text-left px-3 py-2 w-8">#</th>
                <th className="text-left px-3 py-2 min-w-[220px]">Item</th>
                <th className="text-left px-3 py-2 min-w-[200px]">Pick from bin</th>
                <th className="text-left px-3 py-2 min-w-[200px]">Description</th>
                <th className="text-right px-3 py-2 w-24">Qty</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-sm text-muted-foreground py-10">
                    No items packed yet. {editable && "Click Add line to begin."}
                  </td>
                </tr>
              )}

              {lines.map((l, idx) => (
                <tr key={idx} className="border-b hover:bg-muted/20">
                  <td className="px-3 py-1.5 text-muted-foreground">{idx + 1}</td>
                  <td className="px-2 py-1.5">
                    <Select
                      value={l.item_id ?? ""}
                      onValueChange={(v) => {
                        const it = items.find((i) => i.id === v);
                        updateLine(idx, {
                          item_id: v,
                          description: l.description || it?.name || "",
                        });
                      }}
                      disabled={!editable}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Pick item…" />
                      </SelectTrigger>
                      <SelectContent>
                        {packagePickerItems.map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.sku ? `${i.sku} — ` : ""}
                            {i.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8"
                      value={l.description}
                      onChange={(e) => updateLine(idx, { description: e.target.value })}
                      disabled={!editable}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 text-right"
                      type="number"
                      step="any"
                      value={l.quantity}
                      onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })}
                      disabled={!editable}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    {editable && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removeLine(idx)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end border-t bg-muted/10 px-4 py-3 text-sm">
          <div className="flex gap-8">
            <span className="text-muted-foreground">Total quantity</span>
            <span className="font-mono tabular-nums font-semibold">{totalQty}</span>
          </div>
        </div>
      </Card>

      {!isNew && (
        <DocumentTimeline
          entityType="package"
          entityId={id}
          stages={["Draft", "Confirmed", "Posted"]}
          currentStage={posted ? "Posted" : header.status === "Draft" ? "Draft" : "Confirmed"}
        />
      )}

      {!isNew && (
        <PostingDetailsDrawer
          open={postOpen}
          onOpenChange={setPostOpen}
          refType="package"
          refId={id}
          title={`package ${header.number ?? ""}`}
        />
      )}

      {!isNew && (
        <EmailDocumentDialog
          open={emailOpen}
          onOpenChange={setEmailOpen}
          defaultTo={customer?.email ?? ""}
          defaultSubject={`Packing slip ${header.number ?? ""}`}
          defaultMessage={`Dear ${customer?.name ?? "Customer"},\n\nPlease find attached the packing slip ${header.number ?? ""} for your shipment.\n\nKind regards,\n${tenant?.name ?? ""}`}
          pdf={buildPdf}
          entityType="package"
          entityId={id}
        />
      )}
    </div>
  );
}
