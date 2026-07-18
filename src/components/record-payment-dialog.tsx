import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const MODES = ["Cash", "Bank Transfer", "Cheque", "Credit Card", "Mobile Money"];

export function RecordPaymentDialog({
  open, onOpenChange, kind, docId, docNumber, partyId, balanceDue, currency,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: "receive" | "pay";
  docId: string;
  docNumber: string;
  partyId: string;
  balanceDue: number;
  currency: string;
}) {
  const qc = useQueryClient();
  const { tenant } = useAuth();
  const [amount, setAmount] = useState<number>(Math.max(0, balanceDue));
  const [mode, setMode] = useState("Bank Transfer");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const submit = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("No tenant");
      if (!amount || amount <= 0) throw new Error("Enter an amount");
      const prefix = kind === "receive" ? "RCPT" : "PAY";
      const number = `${prefix}-${Date.now().toString().slice(-8)}`;
      const table = kind === "receive" ? "payments_received" : "payments_made";
      const partyField = kind === "receive" ? "customer_id" : "supplier_id";
      const payload: any = { tenant_id: tenant.id, number, [partyField]: partyId, date, mode, reference, amount };

      const { data: pay, error } = await supabase.from(table as any).insert(payload).select("id").single();
      if (error) throw error;

      const rpcName = kind === "receive" ? "apply_payment" : "apply_payment_made";
      const allocKey = kind === "receive" ? "invoice_id" : "bill_id";
      const { error: rpcErr } = await supabase.rpc(rpcName as any, {
        _payment_id: (pay as any).id,
        _allocations: [{ [allocKey]: docId, amount }],
      } as any);
      if (rpcErr) throw rpcErr;
      return (pay as any).id as string;
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      qc.invalidateQueries();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to record payment"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record {kind === "receive" ? "Payment Received" : "Payment Made"}</DialogTitle>
          <DialogDescription>
            {kind === "receive" ? "Apply a customer payment to" : "Pay supplier bill"} {docNumber} · Balance {currency} {balanceDue.toFixed(2)}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Amount ({currency})</Label>
            <Input type="number" step="any" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </div>
          <div className="grid gap-1.5">
            <Label>Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction reference" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
            {submit.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
