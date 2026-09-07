import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";
import { toast } from "sonner";
import { Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSupplierPaymentActions } from "@/hooks/use-supplier-payments";

const PAYMENT_MODES = ["Cash", "Bank Transfer", "Card", "Cheque", "Mobile Money"];

export function SupplierPaymentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const actions = useSupplierPaymentActions();
  const [supplierId, setSupplierId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("KES");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState("Bank Transfer");
  const [bankAccountId, setBankAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", "payment-dialog"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db.from("suppliers").select("id,name,currency").is("deleted_at", null).order("name");
      if (error) throw error;
      return (data ?? []) as Record<string, any>[];
    },
  });
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bank_accounts", "payment-dialog"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db.from("bank_accounts").select("id,name,currency").is("deleted_at", null).eq("status", "Active").order("name");
      if (error) throw error;
      return (data ?? []) as Record<string, any>[];
    },
  });

  const submit = () => {
    const numericAmount = Number(amount);
    if (!supplierId) return toast.error("Select a supplier");
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return toast.error("Enter a valid amount greater than zero");
    actions.create.mutate({ supplierId, amount: numericAmount, date, currency, bankAccountId: bankAccountId || null, paymentMethod: mode, reference: reference || null, notes: notes || null }, {
      onSuccess: () => {
        toast.success("Draft supplier payment created");
        setAmount(""); setReference(""); setNotes(""); setSupplierId("");
        onOpenChange(false);
      },
      onError: (error: Error) => toast.error(error.message || "Payment creation failed"),
    });
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" />New Supplier Payment</DialogTitle></DialogHeader>
      <div className="grid gap-4 py-2">
        <div className="grid gap-1.5"><Label>Supplier</Label><Select value={supplierId} onValueChange={(value) => { setSupplierId(value); const supplier = suppliers.find((row) => row.id === value); if (supplier?.currency) setCurrency(supplier.currency); }}><SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger><SelectContent>{suppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid grid-cols-2 gap-3"><div className="grid gap-1.5"><Label>Amount</Label><Input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></div><div className="grid gap-1.5"><Label>Currency</Label><Input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} /></div></div>
        <div className="grid grid-cols-2 gap-3"><div className="grid gap-1.5"><Label>Payment Date</Label><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div><div className="grid gap-1.5"><Label>Payment Method</Label><Select value={mode} onValueChange={setMode}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_MODES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div></div>
        <div className="grid gap-1.5"><Label>Bank / Cash Account</Label><Select value={bankAccountId} onValueChange={setBankAccountId}><SelectTrigger><SelectValue placeholder="Default configured account" /></SelectTrigger><SelectContent>{bankAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}{account.currency ? ` (${account.currency})` : ""}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid gap-1.5"><Label>Reference</Label><Input value={reference} onChange={(event) => setReference(event.target.value)} /></div>
        <div className="grid gap-1.5"><Label>Notes</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} disabled={actions.create.isPending}>{actions.create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Draft</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}