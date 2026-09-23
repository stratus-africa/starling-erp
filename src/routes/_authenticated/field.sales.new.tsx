import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Search, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSalesSettings, useSalespeople } from "@/hooks/use-sales-settings";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { FieldHeader, StickyFooter, NoAccess, CustomerPicker, SearchBar, Loading, useFieldAccess } from "@/components/field/field-ui";
import { enqueue, newClientId } from "@/lib/field-sync";
import { toMinor, fromMinor, formatMoney, lineMinor, docTotals, dbMinor } from "@/lib/field-money";

type Kind = "quote" | "order";
export const Route = createFileRoute("/_authenticated/field/sales/new")({
  validateSearch: (s: Record<string, unknown>): { kind?: Kind; customer?: string; edit?: string } => ({
    ...(s.kind === "order" || s.kind === "quote" ? { kind: s.kind } : {}),
    ...(typeof s.customer === "string" ? { customer: s.customer } : {}),
    ...(typeof s.edit === "string" ? { edit: s.edit } : {}),
  }),
  head: () => ({ meta: [{ title: "New sale — Field Sales" }] }),
  component: SalesWizard,
});

type Line = { key: string; item_id: string | null; description: string; qty: string; price: string; discount_pct: string; tax_pct: string; stock?: number | null; track?: boolean };
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

function SalesWizard() {
  const s = Route.useSearch();
  const kind: Kind = s.kind ?? "quote";
  const label = kind === "quote" ? "Quote" : "Sales Order";
  const a = useFieldAccess();
  const { tenant, user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { salespersonRequired } = useSalesSettings();
  const { data: people = [] } = useSalespeople();
  const draftKey = `field-draft-${kind}-${s.edit ?? "new"}`;

  const [step, setStep] = useState(0);
  const [customerId, setCustomerId] = useState(s.customer ?? "");
  const [currency, setCurrency] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [date, setDate] = useState(today());
  const [extra, setExtra] = useState(kind === "quote" ? plusDays(30) : "");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [salesperson, setSalesperson] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "draft" | "final">(null);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Load existing draft document (edit) or local device draft
  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: [kind, "field-edit", s.edit], enabled: !!s.edit,
    queryFn: async () => {
      const t = kind === "quote" ? "sales_quotes" : "sales_orders";
      const lt = kind === "quote" ? "sales_quote_lines" : "sales_order_lines";
      const [{ data: h }, { data: ls }] = await Promise.all([
        (supabase as any).from(t).select("*").eq("id", s.edit).maybeSingle(),
        (supabase as any).from(lt).select("*, items(stock,track_inventory)").eq("document_id", s.edit).is("deleted_at", null).order("line_no"),
      ]);
      return { h, ls: ls ?? [] };
    },
  });
  useEffect(() => {
    if (hydrated) return;
    if (s.edit) {
      if (!existing) return;
      const h = existing.h;
      if (h && (h.status ?? "Draft") !== "Draft") { toast.error("Only draft documents can be edited"); nav({ to: "/field/sales/$kind/$id", params: { kind, id: s.edit }, replace: true }); return; }
      if (h) {
        setCustomerId(h.customer_id ?? ""); setCurrency(h.currency ?? ""); setDate(h.date ?? today());
        setExtra((kind === "quote" ? h.expiry : h.promised_date) ?? ""); setNotes(h.notes ?? ""); setTerms(h.payment_terms ?? ""); setSalesperson(h.salesperson_id ?? "");
        setLines(existing.ls.map((l: any) => ({ key: l.id, item_id: l.item_id, description: l.description ?? "", qty: String(l.quantity ?? 1), price: String(l.unit_price ?? 0), discount_pct: String(l.discount_pct ?? 0), tax_pct: String(l.tax_pct ?? 0), stock: l.items?.stock, track: l.items?.track_inventory })));
      }
    } else {
      try {
        const d = JSON.parse(localStorage.getItem(draftKey) ?? "null");
        if (d) { setCustomerId(s.customer ?? d.customerId); setCurrency(d.currency); setLines(d.lines); setDate(d.date); setExtra(d.extra); setNotes(d.notes); setTerms(d.terms); setSalesperson(d.salesperson); }
      } catch { /* ignore */ }
    }
    setHydrated(true);
  }, [existing, hydrated, s.edit, s.customer, draftKey, kind, nav]);
  useEffect(() => { if (!salesperson && user && hydrated) setSalesperson(user.id); }, [user, hydrated, salesperson]);
  // autosave device draft for new docs
  useEffect(() => {
    if (!hydrated || s.edit) return;
    localStorage.setItem(draftKey, JSON.stringify({ customerId, currency, lines, date, extra, notes, terms, salesperson }));
  }, [hydrated, s.edit, draftKey, customerId, currency, lines, date, extra, notes, terms, salesperson]);

  const { data: taxRates = [] } = useQuery({
    queryKey: ["tax_rates", "field"],
    queryFn: async () => ((await (supabase as any).from("tax_rates").select("id,name,rate").is("deleted_at", null).order("name")).data ?? []) as { id: string; name: string; rate: number }[],
  });

  const parsed = lines.map((l) => ({ quantity: Number(l.qty) || 0, priceMinor: toMinor(l.price) ?? 0, discount_pct: Number(l.discount_pct) || 0, tax_pct: Number(l.tax_pct) || 0 }));
  const totals = docTotals(parsed);
  const cur = currency || tenant?.currency || "KES";

  if (!(s.edit ? a.salesEdit : a.salesCreate)) return <><FieldHeader title={label} back="/field/sales" /><NoAccess what={`creating ${label.toLowerCase()}s`} /></>;
  if (s.edit && loadingExisting) return <><FieldHeader title={label} back="/field/sales" /><Loading /></>;

  const errors = (): string | null => {
    if (!customerId) return "Choose a customer";
    if (lines.length === 0) return "Add at least one item";
    for (const [i, l] of lines.entries()) {
      if (!l.description.trim()) return `Line ${i + 1}: description is required`;
      if (!(Number(l.qty) > 0)) return `Line ${i + 1}: quantity must be greater than zero`;
      const p = toMinor(l.price);
      if (p === null || p < 0) return `Line ${i + 1}: enter a valid price`;
      const d = Number(l.discount_pct); if (d < 0 || d > 100) return `Line ${i + 1}: discount must be 0–100%`;
    }
    if (salespersonRequired && !salesperson) return "Choose a salesperson";
    if (kind === "quote" && extra && extra < date) return "Expiry date must be after the quote date";
    if (kind === "order" && extra && extra < date) return "Delivery date must be after the order date";
    return null;
  };
  const stockWarnings = kind === "order" ? lines.filter((l) => l.track && l.stock != null && Number(l.qty) > Number(l.stock)) : [];

  const next = () => {
    if (step === 0 && !customerId) return toast.error("Choose a customer");
    if (step === 1) {
      if (lines.length === 0) return toast.error("Add at least one item");
      const e = errors(); if (e && e.startsWith("Line")) return toast.error(e);
    }
    setStep((x) => Math.min(3, x + 1));
  };

  const save = async (final: boolean) => {
    const e = errors(); if (e) { toast.error(e); return; }
    if (!tenant) return;
    setSaving(true);
    const header: Record<string, unknown> = {
      tenant_id: tenant.id, customer_id: customerId, date, currency: cur, notes: [notes, terms && kind === "order" ? `Terms: ${terms}` : ""].filter(Boolean).join("\n\n") || null,
      subtotal: fromMinor(totals.subtotal), discount_total: fromMinor(totals.discount), tax_total: fromMinor(totals.tax), grand_total: fromMinor(totals.total), amount: fromMinor(totals.total),
      salesperson_id: salesperson || null,
    };
    if (kind === "quote") { header.expiry = extra || null; header.payment_terms = terms || null; }
    else { header.promised_date = extra || null; header.items_count = lines.length; }
    if (!s.edit) { header.status = "Draft"; header.number = `${kind === "quote" ? "QT" : "SO"}-${Date.now().toString().slice(-8)}`; }
    const payloadLines = lines.map((l, i) => {
      const p = parsed[i];
      return { line_no: i + 1, item_id: l.item_id, description: l.description, quantity: p.quantity, unit_price: fromMinor(p.priceMinor), discount_pct: p.discount_pct, tax_pct: p.tax_pct, line_total: fromMinor(lineMinor(p.quantity, p.priceMinor, p.discount_pct, p.tax_pct)) };
    });
    const id = s.edit ?? newClientId();
    const res = await enqueue({
      id: s.edit ? newClientId() : id, kind, label: `${label} for ${header.customer_id ? "customer" : ""} ${formatMoney(totals.total, cur)}`,
      payload: { docId: s.edit, header, lines: payloadLines, finalize: final ? (kind === "quote" ? "Sent" : "Confirmed") : null },
    });
    setSaving(false);
    qc.invalidateQueries({ queryKey: [kind === "quote" ? "sales_quotes" : "sales_orders"] });
    if (res.status === "synced") {
      localStorage.removeItem(draftKey);
      toast.success(final ? `${label} created` : "Draft saved");
      nav({ to: "/field/sales/$kind/$id", params: { kind, id: res.serverId ?? id }, replace: true });
    } else if (res.status === "failed") {
      toast.error(res.error ?? "Could not save");
      if (res.error?.startsWith("Saved as draft")) { localStorage.removeItem(draftKey); nav({ to: "/field/sales/$kind/$id", params: { kind, id }, replace: true }); }
    } else {
      localStorage.removeItem(draftKey);
      toast.message("Saved offline — will sync when you reconnect");
      nav({ to: "/field/sales", search: { tab: kind } });
    }
  };

  const setLine = (key: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const steps = ["Customer", "Items", "Details", "Review"];
  const sel = "h-12 w-full rounded-md border bg-background px-3 text-base";

  return (
    <div className="pb-24">
      <FieldHeader title={s.edit ? `Edit ${label}` : `New ${label}`} back="/field/sales" />
      <div className="flex gap-1 px-4 pt-3">
        {steps.map((t, i) => (
          <button key={t} onClick={() => i <= step && setStep(i)} className="flex-1 text-center">
            <div className={`h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
            <div className={`mt-1 text-[11px] ${i === step ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{t}</div>
          </button>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-3 p-4">
          <Label>Customer *</Label>
          <CustomerPicker value={customerId} allowCreate={a.customersCreate} onChange={(c) => { setCustomerId(c.id); if (!currency) setCurrency(c.currency ?? ""); }} />
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3 p-4">
          {lines.map((l, i) => {
            const p = parsed[i];
            const over = kind === "order" && l.track && l.stock != null && p.quantity > Number(l.stock);
            return (
              <div key={l.key} className="space-y-2 rounded-xl border p-3">
                <div className="flex items-start gap-2">
                  <Input className="h-11 flex-1 text-base" value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} placeholder="Description" />
                  <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Qty</Label><Input className="h-11 text-base" inputMode="decimal" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} /></div>
                  <div><Label className="text-xs">Rate</Label><Input className="h-11 text-base" inputMode="decimal" value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })} /></div>
                  <div><Label className="text-xs">Discount %</Label><Input className="h-11 text-base" inputMode="decimal" value={l.discount_pct} onChange={(e) => setLine(l.key, { discount_pct: e.target.value })} /></div>
                  <div><Label className="text-xs">Tax</Label>
                    <select className="h-11 w-full rounded-md border bg-background px-2 text-base" value={l.tax_pct} onChange={(e) => setLine(l.key, { tax_pct: e.target.value })}>
                      <option value="0">No tax</option>
                      {taxRates.map((t) => <option key={t.id} value={String(t.rate)}>{t.name} ({t.rate}%)</option>)}
                      {!["0", ...taxRates.map((t) => String(t.rate))].includes(l.tax_pct) && <option value={l.tax_pct}>{l.tax_pct}%</option>}
                    </select>
                  </div>
                </div>
                {over && <p className="flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="h-3 w-3" /> Only {l.stock} in stock</p>}
                <div className="text-right text-sm font-semibold tabular-nums">{formatMoney(lineMinor(p.quantity, p.priceMinor, p.discount_pct, p.tax_pct), cur)}</div>
              </div>
            );
          })}
          <Button variant="outline" className="h-12 w-full text-base" onClick={() => setPickOpen(true)}><Plus className="mr-2 h-5 w-5" /> Add item</Button>
          <div className="flex justify-between border-t pt-3 text-base font-semibold"><span>Total</span><span className="tabular-nums">{formatMoney(totals.total, cur)}</span></div>
          <ItemSheet open={pickOpen} onOpenChange={setPickOpen} onPick={(it) => {
            setLines((ls) => [...ls, { key: newClientId(), item_id: it?.id ?? null, description: it ? it.name : "", qty: "1", price: it ? fromMinor(dbMinor(it.price)) : "0", discount_pct: "0", tax_pct: "0", stock: it?.stock, track: it?.track_inventory }]);
          }} />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>{kind === "quote" ? "Quote date" : "Order date"}</Label><Input type="date" className="h-12 text-base" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{kind === "quote" ? "Expiry date" : "Delivery date"}</Label><Input type="date" className="h-12 text-base" value={extra} onChange={(e) => setExtra(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Currency</Label><Input className="h-12 text-base uppercase" maxLength={3} value={cur} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></div>
          <div className="space-y-1.5"><Label>Salesperson{salespersonRequired ? " *" : ""}</Label>
            <select className={sel} value={salesperson} onChange={(e) => setSalesperson(e.target.value)}>
              <option value="">Not assigned</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={3} className="text-base" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Terms and conditions</Label><Textarea rows={3} className="text-base" value={terms} onChange={(e) => setTerms(e.target.value)} /></div>
        </div>
      )}

      {step === 3 && <Review customerId={customerId} lines={lines} parsed={parsed} totals={totals} cur={cur} date={date} extra={extra} kind={kind} stockWarnings={stockWarnings.length} />}

      <StickyFooter>
        {step > 0 && <Button variant="outline" className="h-12 px-5 text-base" onClick={() => setStep(step - 1)}>Back</Button>}
        {step < 3 ? (
          <>
            <Button variant="ghost" className="h-12 px-4 text-base" disabled={saving || !customerId} onClick={() => setConfirm("draft")}>Save draft</Button>
            <Button className="h-12 flex-1 text-base" onClick={next}>Next</Button>
          </>
        ) : (
          <>
            <Button variant="outline" className="h-12 flex-1 text-base" disabled={saving} onClick={() => setConfirm("draft")}>Save draft</Button>
            <Button className="h-12 flex-1 text-base" disabled={saving} onClick={() => setConfirm("final")}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create {kind === "quote" ? "quote" : "order"}</Button>
          </>
        )}
      </StickyFooter>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "final" ? `Create this ${label.toLowerCase()}?` : "Save as draft?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "final" ? `Total ${formatMoney(totals.total, cur)}. It will be marked ${kind === "quote" ? "Sent" : "Confirmed"}. No accounting entries are posted.` : "You can finish it later from the Sales tab."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { const f = confirm === "final"; setConfirm(null); void save(f); }}>Confirm</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Review({ customerId, lines, parsed, totals, cur, date, extra, kind, stockWarnings }: any) {
  const { data: c } = useQuery({ queryKey: ["customers", "name", customerId], enabled: !!customerId, queryFn: async () => (await supabase.from("customers").select("name").eq("id", customerId).maybeSingle()).data });
  return (
    <div className="space-y-4 p-4 text-sm">
      <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Customer</div><div className="font-medium">{c?.name ?? "—"}</div>
        <div className="mt-1 text-xs text-muted-foreground">{date}{extra ? ` · ${kind === "quote" ? "expires" : "deliver"} ${extra}` : ""}</div></div>
      <div className="divide-y rounded-xl border">
        {lines.map((l: Line, i: number) => (
          <div key={l.key} className="flex justify-between gap-2 p-3">
            <div className="min-w-0"><div className="truncate font-medium">{l.description}</div><div className="text-xs text-muted-foreground">{parsed[i].quantity} × {formatMoney(parsed[i].priceMinor, cur)}{parsed[i].discount_pct ? ` −${parsed[i].discount_pct}%` : ""}{parsed[i].tax_pct ? ` +${parsed[i].tax_pct}% tax` : ""}</div></div>
            <div className="shrink-0 tabular-nums">{formatMoney(lineMinor(parsed[i].quantity, parsed[i].priceMinor, parsed[i].discount_pct, parsed[i].tax_pct), cur)}</div>
          </div>
        ))}
      </div>
      <dl className="space-y-1 rounded-xl border p-3">
        {[["Subtotal", totals.subtotal], ["Discount", -totals.discount], ["Tax", totals.tax]].map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-muted-foreground">{k}</dt><dd className="tabular-nums">{formatMoney(v, cur)}</dd></div>)}
        <div className="flex justify-between border-t pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(totals.total, cur)}</dd></div>
      </dl>
      {stockWarnings > 0 && <p className="flex items-center gap-2 rounded-lg bg-amber-500/10 p-3 text-amber-700 dark:text-amber-300"><AlertTriangle className="h-4 w-4" /> {stockWarnings} line(s) exceed current stock. Stock is reserved and checked when the order is fulfilled.</p>}
    </div>
  );
}

function ItemSheet({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (it: any | null) => void }) {
  const [q, setQ] = useState("");
  const { data = [], isLoading } = useQuery({
    queryKey: ["items", "field-picker"], enabled: open,
    queryFn: async () => ((await supabase.from("items").select("id,name,sku,price,stock,uom,type,track_inventory,status").is("deleted_at", null).order("name").limit(1000)).data ?? []),
  });
  const list = useMemo(() => { const s = q.toLowerCase(); return data.filter((i: any) => (i.status ?? "Active") !== "Inactive" && (!s || [i.name, i.sku].some((v) => v?.toLowerCase().includes(s)))).slice(0, 80); }, [data, q]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85dvh] p-0">
        <SheetHeader className="border-b p-4"><SheetTitle>Add item or service</SheetTitle></SheetHeader>
        <div className="space-y-2 p-4">
          <SearchBar value={q} onChange={setQ} placeholder="Search name or SKU" />
          <button className="flex h-11 items-center gap-2 text-sm font-medium text-primary" onClick={() => { onPick(null); onOpenChange(false); }}><Plus className="h-4 w-4" /> Custom line</button>
        </div>
        <div className="h-[calc(85dvh-150px)] overflow-y-auto">
          {isLoading ? <Loading /> : list.map((i: any) => (
            <button key={i.id} onClick={() => { onPick(i); onOpenChange(false); }} className="flex min-h-14 w-full items-center gap-3 border-b px-4 py-2 text-left active:bg-muted">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1"><div className="truncate font-medium">{i.name}</div><div className="truncate text-xs text-muted-foreground">{[i.sku, i.track_inventory ? `${i.stock ?? 0} ${i.uom ?? ""} in stock` : i.type].filter(Boolean).join(" · ")}</div></div>
              <div className="text-sm tabular-nums">{formatMoney(dbMinor(i.price))}</div>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
