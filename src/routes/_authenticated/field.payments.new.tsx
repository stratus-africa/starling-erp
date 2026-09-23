import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { FieldHeader, StickyFooter, NoAccess, CustomerPicker, Loading, useFieldAccess } from "@/components/field/field-ui";
import { enqueue, newClientId } from "@/lib/field-sync";
import { toMinor, fromMinor, formatMoney, dbMinor } from "@/lib/field-money";

export const Route = createFileRoute("/_authenticated/field/payments/new")({
  validateSearch: (s: Record<string, unknown>): { customer?: string } => (typeof s.customer === "string" ? { customer: s.customer } : {}),
  head: () => ({ meta: [{ title: "Receive payment — Field Sales" }] }),
  component: PaymentWizard,
});

const METHODS = ["Cash", "M-Pesa", "Bank Transfer", "Cheque", "Card"];

function PaymentWizard() {
  const s = Route.useSearch();
  const a = useFieldAccess();
  const { tenant } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [customerId, setCustomerId] = useState(s.customer ?? "");
  const [custCurrency, setCustCurrency] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("M-Pesa");
  const [bank, setBank] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: cust } = useQuery({
    queryKey: ["customers", "pay", customerId], enabled: !!customerId,
    queryFn: async () => (await supabase.from("customers").select("id,name,currency").eq("id", customerId).maybeSingle()).data,
  });
  useEffect(() => { if (cust) setCustCurrency(cust.currency); }, [cust]);
  const { data: invoices = [], isLoading: invLoading } = useQuery({
    queryKey: ["invoices", "open", customerId], enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("id,number,date,due_date,grand_total,balance_due,currency,status").eq("customer_id", customerId).is("deleted_at", null).gt("balance_due", 0).not("status", "in", "(Draft,Cancelled,Voided)").order("date");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: banks = [] } = useQuery({
    queryKey: ["bank_accounts", "field"],
    queryFn: async () => ((await supabase.from("bank_accounts").select("id,name,bank,currency,status,is_default_cash").is("deleted_at", null).order("name")).data ?? []).filter((b) => (b.status ?? "Active") === "Active"),
  });
  useEffect(() => {
    if (bank || banks.length === 0) return;
    const pref = method === "Cash" ? banks.find((b) => b.is_default_cash) : banks.find((b) => !b.is_default_cash);
    setBank((pref ?? banks[0]).id);
  }, [banks, bank, method]);

  const cur = custCurrency || invoices[0]?.currency || tenant?.currency || "KES";
  const outstanding = invoices.reduce((t, i) => t + dbMinor(i.balance_due), 0);
  const amountMinor = toMinor(amount) ?? 0;
  const allocMinor = useMemo(() => Object.fromEntries(invoices.map((i) => [i.id, toMinor(alloc[i.id] ?? "") ?? 0])), [alloc, invoices]);
  const allocated = Object.values(allocMinor).reduce((t, v) => t + v, 0);
  const unallocated = amountMinor - allocated;
  const invErrors = invoices.filter((i) => allocMinor[i.id] < 0 || allocMinor[i.id] > dbMinor(i.balance_due));
  const valid = amountMinor > 0 && !!bank && allocated <= amountMinor && invErrors.length === 0;

  if (!a.paymentsCreate) return <><FieldHeader title="Receive payment" back="/field/payments" /><NoAccess what="recording payments" /></>;

  const autoAllocate = () => {
    let left = amountMinor;
    const next: Record<string, string> = {};
    for (const i of invoices) {
      const take = Math.max(0, Math.min(left, dbMinor(i.balance_due)));
      next[i.id] = take ? fromMinor(take) : "";
      left -= take;
    }
    setAlloc(next);
  };

  const submit = async () => {
    if (!valid || !tenant) return;
    setSaving(true);
    const allocations = invoices.filter((i) => allocMinor[i.id] > 0).map((i) => ({ invoice_id: i.id, amount: Number(fromMinor(allocMinor[i.id])) }));
    const res = await enqueue({
      id: newClientId(), kind: "payment", label: `Payment ${formatMoney(amountMinor, cur)} from ${cust?.name ?? "customer"}`,
      payload: { _customer_id: customerId, _amount: Number(fromMinor(amountMinor)), _date: date, _payment_method: method, _reference: reference || null, _notes: notes || null, _currency: cur, _bank_account_id: bank, _allocations: allocations },
    });
    setSaving(false);
    ["payments_received", "invoices", "customers"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    if (res.status === "synced") {
      toast.success("Payment recorded");
      if (tenant) await supabase.from("notifications").insert({ tenant_id: tenant.id, user_id: (await supabase.auth.getUser()).data.user!.id, type: "payment_recorded", title: "Payment recorded", message: `${formatMoney(amountMinor, cur)} from ${cust?.name ?? "customer"}`, entity_type: "payments_received", entity_id: res.serverId ?? null, severity: "success" }).then(() => {}, () => {});
      nav({ to: "/field/customers/$id", params: { id: customerId }, replace: true });
    } else if (res.status === "failed") toast.error(res.error ?? "Payment was not recorded");
    else { toast.message("Saved offline. It is NOT recorded until it syncs."); nav({ to: "/field/payments" }); }
  };

  return (
    <div className="pb-24">
      <FieldHeader title="Receive payment" back="/field/payments" />
      <div className="flex gap-1 px-4 pt-3">
        {["Customer", "Payment", "Allocate"].map((t, i) => (
          <div key={t} className="flex-1 text-center"><div className={`h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} /><div className={`mt-1 text-[11px] ${i === step ? "font-semibold" : "text-muted-foreground"}`}>{t}</div></div>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-4 p-4">
          <CustomerPicker value={customerId} onChange={(c) => { setCustomerId(c.id); setCustCurrency(c.currency); setAlloc({}); }} />
          {customerId && (invLoading ? <Loading /> : (
            <div className="rounded-xl border p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Currency</span><span>{cur}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Outstanding balance</span><span className="font-semibold tabular-nums">{formatMoney(outstanding, cur)}</span></div>
              <div className="mt-2 divide-y">
                {invoices.length === 0 ? <p className="pt-2 text-muted-foreground">No open invoices. The payment will be recorded as unallocated credit.</p> : invoices.map((i) => (
                  <div key={i.id} className="flex justify-between py-2"><span>{i.number}<span className="block text-xs text-muted-foreground">due {i.due_date ?? i.date}</span></span><span className="tabular-nums">{formatMoney(dbMinor(i.balance_due), cur)}</span></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4 p-4">
          <div className="space-y-1.5"><Label>Amount ({cur}) *</Label><Input className="h-14 text-2xl font-semibold tabular-nums" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
          <div className="space-y-1.5"><Label>Payment date</Label><Input type="date" className="h-12 text-base" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Method</Label>
            <div className="flex flex-wrap gap-2">{METHODS.map((m) => <button key={m} onClick={() => setMethod(m)} className={`h-11 rounded-full border px-4 text-sm ${method === m ? "border-primary bg-primary text-primary-foreground" : ""}`}>{m}</button>)}</div>
          </div>
          <div className="space-y-1.5"><Label>Deposit to account *</Label>
            <select className="h-12 w-full rounded-md border bg-background px-3 text-base" value={bank} onChange={(e) => setBank(e.target.value)}>
              <option value="">Choose account</option>
              {banks.map((b) => <option key={b.id} value={b.id}>{b.name}{b.bank ? ` · ${b.bank}` : ""}</option>)}
            </select>
            {banks.length === 0 && <p className="text-xs text-destructive">No bank or cash accounts are set up. Ask your administrator.</p>}
          </div>
          <div className="space-y-1.5"><Label>Reference (e.g. M-Pesa code)</Label><Input className="h-12 text-base uppercase" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} className="text-base" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3 p-4">
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <Box label="Payment" v={formatMoney(amountMinor, cur)} />
            <Box label="Allocated" v={formatMoney(allocated, cur)} bad={allocated > amountMinor} />
            <Box label="Unallocated" v={formatMoney(unallocated, cur)} bad={unallocated < 0} />
          </div>
          {invoices.length > 0 && <Button variant="outline" className="h-11 w-full" onClick={autoAllocate}>Auto-allocate oldest first</Button>}
          {invoices.map((i) => {
            const bal = dbMinor(i.balance_due);
            const over = allocMinor[i.id] > bal;
            return (
              <div key={i.id} className={`rounded-xl border p-3 ${over ? "border-destructive" : ""}`}>
                <div className="flex justify-between text-sm"><span className="font-medium">{i.number}</span><span className="text-muted-foreground">Due {formatMoney(bal, cur)}</span></div>
                <div className="mt-2 flex gap-2">
                  <Input className="h-12 flex-1 text-base tabular-nums" inputMode="decimal" placeholder="0.00" value={alloc[i.id] ?? ""} onChange={(e) => setAlloc((p) => ({ ...p, [i.id]: e.target.value }))} />
                  <Button variant="ghost" className="h-12" onClick={() => setAlloc((p) => ({ ...p, [i.id]: fromMinor(Math.min(bal, Math.max(0, amountMinor - allocated + (allocMinor[i.id] ?? 0)))) }))}>Max</Button>
                </div>
                {over && <p className="mt-1 text-xs text-destructive">Cannot exceed the invoice balance.</p>}
                {allocMinor[i.id] > 0 && allocMinor[i.id] < bal && <p className="mt-1 text-xs text-muted-foreground">Remaining on invoice: {formatMoney(bal - allocMinor[i.id], cur)}</p>}
              </div>
            );
          })}
          {allocated > amountMinor && <p className="text-sm text-destructive">Allocations exceed the payment amount.</p>}
        </div>
      )}

      <StickyFooter>
        {step > 0 && <Button variant="outline" className="h-12 px-5 text-base" onClick={() => setStep(step - 1)}>Back</Button>}
        {step < 2 ? (
          <Button className="h-12 flex-1 text-base" onClick={() => {
            if (step === 0 && !customerId) return toast.error("Choose a customer");
            if (step === 1) { if (amountMinor <= 0) return toast.error("Amount must be greater than zero"); if (!bank) return toast.error("Choose the deposit account"); }
            setStep(step + 1);
          }}>Next</Button>
        ) : (
          <Button className="h-12 flex-1 text-base" disabled={!valid || saving} onClick={() => setConfirm(true)}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Record payment</Button>
        )}
      </StickyFooter>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Record {formatMoney(amountMinor, cur)}?</AlertDialogTitle>
            <AlertDialogDescription>From {cust?.name}. {formatMoney(allocated, cur)} applied to invoices{unallocated > 0 ? `, ${formatMoney(unallocated, cur)} kept as customer credit` : ""}. This posts to the books.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { setConfirm(false); void submit(); }}>Record</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Box({ label, v, bad }: { label: string; v: string; bad?: boolean }) {
  return <div className={`rounded-lg border p-2 ${bad ? "border-destructive text-destructive" : ""}`}><div className="text-[11px] text-muted-foreground">{label}</div><div className="truncate font-semibold tabular-nums">{v}</div></div>;
}
