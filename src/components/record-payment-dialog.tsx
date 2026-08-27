import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Loader2, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "receive" = customer payment (invoice), "pay" = supplier payment (bill) */
  kind: "receive" | "pay";
  docId: string;
  docNumber: string | number | null | undefined;
  partyId: string | number | null | undefined;
  balanceDue: number;
  currency: string;
}

const PAYMENT_MODES = ["Cash", "Bank Transfer", "Card", "Cheque", "Mobile Money"] as const;

export function RecordPaymentDialog({
  open,
  onOpenChange,
  kind,
  docId,
  docNumber,
  partyId,
  balanceDue,
  currency,
}: RecordPaymentDialogProps) {
  const { tenant } = useAuth();
  const qc = useQueryClient();

  const [amount, setAmount] = useState<string>(balanceDue.toFixed(2));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<string>("Bank Transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const table = kind === "receive" ? "payments_received" : "payments_made";
  const docField = kind === "receive" ? "invoice_id" : "bill_id";
  const partyField = kind === "receive" ? "customer_id" : "supplier_id";

  const record = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("No workspace selected");
      const amt = parseFloat(amount);
      if (isNaN(amt) || amt <= 0) throw new Error("Enter a valid amount greater than zero");

      const payload: Record<string, unknown> = {
        tenant_id: tenant.id,
        amount: amt,
        payment_date: date,
        mode,
        reference: reference || null,
        notes: notes || null,
        [docField]: docId,
        [partyField]: partyId ?? null,
        status: "Posted",
      };

      const { error } = await supabase.from(table as any).insert(payload as any);
      if (error) throw error;

      // Update the document's amount_paid and balance_due
      const roundedAmt = Math.round(amt * 100) / 100;
      if (kind === "receive") {
        const { data: inv } = await supabase
          .from("invoices")
          .select("amount_paid, grand_total, balance_due")
          .eq("id", docId)
          .single();
        if (inv) {
          const newPaid = Math.round(((inv.amount_paid ?? 0) + roundedAmt) * 100) / 100;
          const newBalance = Math.max(0, Math.round(((inv.grand_total ?? 0) - newPaid) * 100) / 100);
          await supabase
            .from("invoices")
            .update({
              amount_paid: newPaid,
              balance_due: newBalance,
              balance: newBalance,
              status: newBalance <= 0.001 ? "Paid" : "Posted",
            })
            .eq("id", docId);
        }
      } else {
        const { data: bill } = await supabase
          .from("bills")
          .select("amount_paid, grand_total, balance_due")
          .eq("id", docId)
          .single();
        if (bill) {
          const newPaid = Math.round(((bill.amount_paid ?? 0) + roundedAmt) * 100) / 100;
          const newBalance = Math.max(0, Math.round(((bill.grand_total ?? 0) - newPaid) * 100) / 100);
          await supabase
            .from("bills")
            .update({
              amount_paid: newPaid,
              balance_due: newBalance,
              balance: newBalance,
              status: newBalance <= 0.001 ? "Paid" : "Posted",
            })
            .eq("id", docId);
        }
      }
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      qc.invalidateQueries({ queryKey: [kind === "receive" ? "invoices" : "bills", docId] });
      qc.invalidateQueries({ queryKey: [table, "list"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed to record payment"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Record {kind === "receive" ? "Payment Received" : "Payment Made"}
          </DialogTitle>
          <DialogDescription>
            {kind === "receive" ? "Record a customer payment against" : "Record a supplier payment against"}{" "}
            <span className="font-medium">{docNumber}</span>. Balance due:{" "}
            <span className="font-mono font-medium">
              {currency} {balanceDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="pay-amount">Amount ({currency})</Label>
            <Input
              id="pay-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pay-date">Payment Date</Label>
            <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pay-mode">Payment Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger id="pay-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pay-ref">Reference / Cheque No.</Label>
            <Input
              id="pay-ref"
              placeholder="Optional"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pay-notes">Notes</Label>
            <Textarea
              id="pay-notes"
              rows={2}
              placeholder="Optional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={record.isPending}>
            Cancel
          </Button>
          <Button onClick={() => record.mutate()} disabled={record.isPending}>
            {record.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
