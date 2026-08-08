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
import { ArrowLeft, CheckCircle2, Loader2, Mail, Package, Plus, Printer, Receipt, Save, Trash2 } from "lucide-react";
import { downloadDocumentPdf, type PdfDocInput } from "@/lib/document-pdf";
import { EmailDocumentDialog } from "@/components/email-document-dialog";
import { EmailStatus } from "@/components/email-status";
import { DocumentTimeline } from "@/components/document-timeline";
import { PostingDetailsDrawer } from "@/components/posting-details-drawer";
import { useDocumentBranding } from "@/hooks/use-document-branding";
import { logDocumentEvent } from "@/lib/document-events";


const STATUSES = ["Draft", "Packed", "Shipped", "Delivered", "Cancelled"] as const;

interface Line {
  line_no: number;
  item_id: string | null;
  description: string;
  quantity: number;
}

export function PackageEditor({ id }: { id: string }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const search = useSearch({ strict: false }) as { order?: string };
  const { tenant, user, profile, hasRole } = useAuth();
  const canWrite = hasRole(["tenant_admin", "super_admin", "sales"] as any);
  const isNew = id === "new";
  const [emailOpen, setEmailOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const { branding } = useDocumentBranding("package");


  const { data: doc, isLoading } = useQuery({
    queryKey: ["packages", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await supabase.from("packages" as any).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: linesData } = useQuery({
    queryKey: ["package_lines", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await supabase.from("package_lines" as any).select("*").eq("document_id", id).is("deleted_at", null).order("line_no");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["sales_orders", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales_orders").select("id,number,customer_id").is("deleted_at", null).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name,email").is("deleted_at", null).order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("id,name").is("deleted_at", null).order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const { data: items = [] } = useQuery({
    queryKey: ["items", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("id,name,sku").is("deleted_at", null).order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const [header, setHeader] = useState<any>({
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
  });
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => { if (doc) setHeader(doc); }, [doc]);
  useEffect(() => { if (linesData) setLines(linesData.map((l: any) => ({ line_no: l.line_no, item_id: l.item_id, description: l.description ?? "", quantity: Number(l.quantity) }))); }, [linesData]);

  const sourceOrderId = header.sales_order_id || null;

  // Prefill customer + lines from the originating sales order for a brand-new package
  const { data: sourceLines } = useQuery({
    queryKey: ["sales_order_lines", "for-package", sourceOrderId],
    enabled: isNew && !!sourceOrderId,
    queryFn: async () => {
      const { data, error } = await supabase.from("sales_order_lines").select("line_no,item_id,description,quantity").eq("document_id", sourceOrderId!).is("deleted_at", null).order("line_no");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  useEffect(() => {
    if (!isNew || !sourceOrderId) return;
    const so = orders.find((o: any) => o.id === sourceOrderId);
    if (so?.customer_id) setHeader((h: any) => (h.customer_id ? h : { ...h, customer_id: so.customer_id }));
  }, [isNew, sourceOrderId, orders]);

  useEffect(() => {
    if (!isNew || !sourceLines?.length) return;
    setLines((prev) => (prev.length ? prev : sourceLines.map((l: any, i: number) => ({ line_no: i + 1, item_id: l.item_id, description: l.description ?? "", quantity: Number(l.quantity) }))));
  }, [isNew, sourceLines]);

  const addLine = () => setLines((p) => [...p, { line_no: p.length + 1, item_id: null, description: "", quantity: 1 }]);
  const updateLine = (idx: number, patch: Partial<Line>) =>
    setLines((p) => p.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const removeLine = (idx: number) =>
    setLines((p) => p.filter((_, i) => i !== idx).map((l, i) => ({ ...l, line_no: i + 1 })));

  const totalQty = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  const posted = !!doc?.posted_at;
  const editable = canWrite && !posted;
  const customer = customers.find((c: any) => c.id === header.customer_id) as any;
  const order = orders.find((o: any) => o.id === header.sales_order_id) as any;

  const save = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("No tenant");
      if (!header.customer_id) throw new Error("Please select a customer");

      const payload: any = { ...header, tenant_id: tenant.id };
      payload.sales_order_id = header.sales_order_id || null;
      payload.warehouse_id = header.warehouse_id || null;
      payload.weight = Number(header.weight) || 0;
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;
      delete payload.posted_at;

      let docId: string | null = isNew ? null : id;
      if (isNew) {
        if (!payload.number) payload.number = `PKG-${Date.now().toString().slice(-8)}`;
        const { data, error } = await supabase.from("packages" as any).insert(payload).select("id").single();
        if (error) throw error;
        docId = (data as any).id;
      } else {
        const { error } = await supabase.from("packages" as any).update(payload).eq("id", id);
        if (error) throw error;
      }

      await supabase.from("package_lines" as any).update({ deleted_at: new Date().toISOString() }).eq("document_id", docId!);
      if (lines.length) {
        const { error } = await supabase.from("package_lines" as any).insert(
          lines.map((l, i) => ({
            tenant_id: tenant.id,
            document_id: docId,
            line_no: i + 1,
            item_id: l.item_id || null,
            description: l.description,
            quantity: Number(l.quantity) || 0,
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
      if (isNew && docId) nav({ to: `/sales/packages/${docId}` as any });
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  const confirmPackage = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("post_package" as any, { _package_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Package confirmed — stock and journal entry recorded");
      qc.invalidateQueries();
      setPostOpen(true);
    },
    onError: (e: any) => toast.error(e.message ?? "Confirm failed"),
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
      { label: "Status", value: posted ? "Confirmed" : header.status ?? "" },
    ],
    lines: lines.map((l) => ({ description: l.description || "", quantity: l.quantity })),
    totals: null,
    notes: header.notes ?? null,
    quantityOnly: true,
    branding,
  });


  if (!isNew && isLoading) {
    return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 w-full">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => nav({ to: "/sales/packages" as any })}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <h1 className="text-xl font-semibold truncate">{isNew ? "New Package" : header.number || "Package"}</h1>
              <Badge variant="secondary">{posted ? "Confirmed" : header.status}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lines.length} line{lines.length === 1 ? "" : "s"} · {totalQty} unit{totalQty === 1 ? "" : "s"} packed
              {order && <> · from <Link className="underline hover:text-foreground" to={`/sales/orders/${order.id}` as any}>{order.number}</Link></>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {!isNew && <EmailStatus entityType="package" entityId={id} />}
          {!isNew && (
            <>
              <Button variant="outline" size="sm" onClick={() => downloadDocumentPdf(buildPdf())}><Printer className="h-4 w-4 mr-1.5" /> Print PDF</Button>
              <Button variant="outline" size="sm" onClick={() => setEmailOpen(true)}><Mail className="h-4 w-4 mr-1.5" /> Email</Button>
            </>
          )}
          {!isNew && posted && (
            <Button variant="outline" size="sm" onClick={() => setPostOpen(true)}><Receipt className="h-4 w-4 mr-1.5" /> Post details</Button>
          )}
          {canWrite && !isNew && !posted && (
            <Button variant="default" size="sm" disabled={confirmPackage.isPending} onClick={() => confirmPackage.mutate()}>
              {confirmPackage.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />} Confirm &amp; Post
            </Button>
          )}

          {editable && (
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save
            </Button>
          )}
        </div>
      </div>

      <Card className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="grid gap-1.5">
          <Label>Package #</Label>
          <Input value={header.number ?? ""} onChange={(e) => setHeader({ ...header, number: e.target.value })} placeholder="Auto" disabled={!editable} />
        </div>
        <div className="grid gap-1.5">
          <Label>Sales Order</Label>
          <Select
            value={header.sales_order_id ?? ""}
            onValueChange={(v) => {
              const so = orders.find((o: any) => o.id === v);
              setHeader({ ...header, sales_order_id: v, customer_id: header.customer_id || so?.customer_id || "" });
            }}
            disabled={!editable}
          >
            <SelectTrigger><SelectValue placeholder="Select order…" /></SelectTrigger>
            <SelectContent>
              {orders.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.number}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Customer</Label>
          <Select value={header.customer_id ?? ""} onValueChange={(v) => setHeader({ ...header, customer_id: v })} disabled={!editable}>
            <SelectTrigger><SelectValue placeholder="Select customer…" /></SelectTrigger>
            <SelectContent>
              {customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Packed Date</Label>
          <Input type="date" value={header.date ?? ""} onChange={(e) => setHeader({ ...header, date: e.target.value })} disabled={!editable} />
        </div>
        <div className="grid gap-1.5">
          <Label>Ship From Warehouse</Label>
          <Select value={header.warehouse_id ?? ""} onValueChange={(v) => setHeader({ ...header, warehouse_id: v })} disabled={!editable}>
            <SelectTrigger><SelectValue placeholder="Default warehouse" /></SelectTrigger>
            <SelectContent>
              {warehouses.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Weight (kg)</Label>
          <Input type="number" step="any" value={header.weight ?? 0} onChange={(e) => setHeader({ ...header, weight: Number(e.target.value) })} disabled={!editable} />
        </div>
        <div className="grid gap-1.5">
          <Label>Carrier</Label>
          <Input value={header.carrier ?? ""} onChange={(e) => setHeader({ ...header, carrier: e.target.value })} placeholder="DHL, FedEx…" disabled={!editable} />
        </div>
        <div className="grid gap-1.5">
          <Label>Tracking #</Label>
          <Input value={header.tracking ?? ""} onChange={(e) => setHeader({ ...header, tracking: e.target.value })} disabled={!editable} />
        </div>
        <div className="grid gap-1.5">
          <Label>Status</Label>
          <Select value={header.status ?? "Draft"} onValueChange={(v) => setHeader({ ...header, status: v })} disabled={!editable}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5 md:col-span-3">
          <Label>Notes</Label>
          <Textarea rows={1} value={header.notes ?? ""} onChange={(e) => setHeader({ ...header, notes: e.target.value })} disabled={!editable} />
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
          <div className="text-sm font-medium">Packed items</div>
          {editable && <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" /> Add line</Button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/10 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="text-left px-3 py-2 w-8">#</th>
                <th className="text-left px-3 py-2 min-w-[220px]">Item</th>
                <th className="text-left px-3 py-2 min-w-[240px]">Description</th>
                <th className="text-right px-3 py-2 w-24">Qty</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr><td colSpan={5} className="text-center text-sm text-muted-foreground py-10">No items packed yet. {editable && "Click Add line to begin."}</td></tr>
              )}
              {lines.map((l, idx) => (
                <tr key={idx} className="border-b hover:bg-muted/20">
                  <td className="px-3 py-1.5 text-muted-foreground">{idx + 1}</td>
                  <td className="px-2 py-1.5">
                    <Select
                      value={l.item_id ?? ""}
                      onValueChange={(v) => {
                        const it = items.find((i: any) => i.id === v);
                        updateLine(idx, { item_id: v, description: l.description || it?.name || "" });
                      }}
                      disabled={!editable}
                    >
                      <SelectTrigger className="h-8"><SelectValue placeholder="Pick item…" /></SelectTrigger>
                      <SelectContent>
                        {items.map((i: any) => <SelectItem key={i.id} value={i.id}>{i.sku ? `${i.sku} — ` : ""}{i.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1.5"><Input className="h-8" value={l.description} onChange={(e) => updateLine(idx, { description: e.target.value })} disabled={!editable} /></td>
                  <td className="px-2 py-1.5"><Input className="h-8 text-right" type="number" step="any" value={l.quantity} onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })} disabled={!editable} /></td>
                  <td className="px-2 py-1.5">
                    {editable && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLine(idx)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
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
        <EmailDocumentDialog
          open={emailOpen}
          onOpenChange={setEmailOpen}
          defaultTo={customer?.email ?? ""}
          defaultSubject={`Packing slip ${header.number ?? ""}`}
          defaultMessage={`Dear ${customer?.name ?? "Customer"},\n\nPlease find attached the packing slip ${header.number ?? ""} for your shipment.\n\nKind regards,\n${tenant?.name ?? ""}`}
          pdf={buildPdf}
        />
      )}
    </div>
  );
}
