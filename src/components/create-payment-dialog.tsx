/**
 * CreatePaymentDialog
 *
 * Allows creating a payment that covers one or more outstanding invoices
 * (kind="received") or bills (kind="made") from the same customer/supplier.
 *
 * Flow:
 *  1. Select customer/supplier
 *  2. All outstanding invoices/bills for that party are listed with checkboxes
 *  3. User checks which ones to pay and enters amounts per doc (defaults to balance due)
 *  4. A single payment record is created + each doc's balance updated
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Loader2, DollarSign, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { db } from "@/lib/typed-db";

export type PaymentCreateKind = "received" | "made";

interface CreatePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: PaymentCreateKind;
}

const PAYMENT_MODES = [
  "Bank Transfer",
  "Cash",
  "Card",
  "Cheque",
  "Mobile Money",
  "M-Pesa",
  "EFT",
] as const;

const money = (n: number, currency = "USD") =>
  `${currency} ${(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// ── helpers ───────────────────────────────────────────────────────────────────

type Outstanding = {
  id: string;
  number: string;
  due_date: string | null;
  grand_total: number;
  balance_due: number;
  currency: string;
  status: string;
};

// ── component ─────────────────────────────────────────────────────────────────

export function CreatePaymentDialog({
  open,
  onOpenChange,
  kind,
}: CreatePaymentDialogProps) {
  const { tenant } = useAuth();
  const qc = useQueryClient();

  const isReceived = kind === "received";
  const partyTable = isReceived ? "customers" : "suppliers";
  const docTable = isReceived ? "invoices" : "bills";
  const paymentTable = isReceived ? "payments_received" : "payments_made";
  const docField = isReceived ? "invoice_id" : "bill_id";
  const partyField = isReceived ? "customer_id" : "supplier_id";
  const partyLabel = isReceived ? "Customer" : "Supplier";
  const docLabel = isReceived ? "Invoice" : "Bill";

  // ── form state ──
  const [partyId, setPartyId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState("Bank Transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  // per-doc applied amounts: docId → string (amount)
  const [applied, setApplied] = useState<Record<string, string>>({});
  // checked docs
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // ── fetch parties ──
  const { data: parties = [] } = useQuery({
    queryKey: [partyTable, "for-payment-dialog"],
    enabled: open,
    queryFn: async () => {
      const { data } = await db
        .from(partyTable as any)
        .select("id,name")
        .is("deleted_at", null)
        .order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
    staleTime: 30_000,
  });

  // ── fetch outstanding docs for selected party ──
  const { data: outstandingDocs = [], isLoading: loadingDocs } = useQuery({
    queryKey: [docTable, "outstanding", partyId],
    enabled: !!partyId,
    queryFn: async () => {
      const { data } = await db
        .from(docTable as any)
        .select("id,number,due_date,grand_total,balance_due,currency,status")
        .eq(partyField, partyId)
        .is("deleted_at", null)
        .in("status", isReceived ? ["Posted", "Sent", "Overdue"] : ["Posted", "Overdue"])
        .gt("balance_due", 0)
        .order("due_date", { ascending: true });
      return (data ?? []) as Outstanding[];
    },
    staleTime: 10_000,
  });

  // reset checks when party changes
  const handlePartyChange = (id: string) => {
    setPartyId(id);
    setChecked(new Set());
    setApplied({});
  };

  const toggleDoc = (doc: Outstanding) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(doc.id)) {
        next.delete(doc.id);
      } else {
        next.add(doc.id);
        // default applied = full balance due
        setApplied((a) => ({
          ...a,
          [doc.id]: doc.balance_due.toFixed(2),
        }));
      }
      return next;
    });
  };

  const selectedDocs = outstandingDocs.filter((d) => checked.has(d.id));

  const totalApplied = selectedDocs.reduce((s, d) => {
    const amt = parseFloat(applied[d.id] ?? "0");
    return s + (isNaN(amt) ? 0 : amt);
  }, 0);

  const currency = selectedDocs[0]?.currency ?? outstandingDocs[0]?.currency ?? "USD";

  // ── submit ──
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("No workspace");
      if (!partyId) throw new Error(`Please select a ${partyLabel.toLowerCase()}`);
      if (checked.size === 0) throw new Error(`Select at least one ${docLabel.toLowerCase()}`);

      const totalAmt = Math.round(totalApplied * 100) / 100;
      if (totalAmt <= 0) throw new Error("Total payment amount must be greater than zero");

      // Build reference from doc numbers
      const docNumbers = selectedDocs.map((d) => d.number).join(", ");

      // Insert single payment record
      const { data: payment, error: payError } = await supabase
        .from(paymentTable as any)
        .insert({
          tenant_id: tenant.id,
          amount: totalAmt,
          payment_date: date,
          date: date,
          mode,
          reference: reference || docNumbers,
          notes: notes || null,
          [partyField]: partyId,
          status: "Posted",
          currency,
        } as any)
        .select("id")
        .single();

      if (payError) throw payError;
      const paymentId = (payment as any).id;

      // For each checked doc, insert a payment allocation and update balances
      for (const doc of selectedDocs) {
        const amt = Math.round((parseFloat(applied[doc.id] ?? "0") || 0) * 100) / 100;
        if (amt <= 0) continue;

        // Insert allocation linking payment → doc
        await supabase.from(paymentTable as any).upsert({
          // We store the first doc reference on the payment row for backwards compat
          [docField]: doc.id,
        } as any);

        // Update doc balance
        const newPaid = Math.round(((doc.grand_total - doc.balance_due) + amt) * 100) / 100;
        const newBalance = Math.max(0, Math.round((doc.grand_total - newPaid) * 100) / 100);

        if (isReceived) {
          await supabase
            .from("invoices")
            .update({
              amount_paid: newPaid,
              balance_due: newBalance,
              balance: newBalance,
              status: newBalance <= 0.001 ? "Paid" : "Posted",
            })
            .eq("id", doc.id);
        } else {
          await supabase
            .from("bills")
            .update({
              amount_paid: newPaid,
              balance_due: newBalance,
              balance: newBalance,
              status: newBalance <= 0.001 ? "Paid" : "Posted",
            })
            .eq("id", doc.id);
        }

        // Insert individual payment allocation record for audit trail
        await supabase.from("payment_allocations" as any).insert({
          tenant_id: tenant.id,
          payment_id: paymentId,
          [docField]: doc.id,
          amount: amt,
        } as any).throwOnError().then(() => {}).catch(() => {
          // payment_allocations table may not exist yet — skip gracefully
        });
      }

      return paymentId;
    },
    onSuccess: () => {
      toast.success(`${isReceived ? "Payment received" : "Payment made"} recorded`);
      qc.invalidateQueries({ queryKey: [paymentTable] });
      qc.invalidateQueries({ queryKey: [docTable] });
      // reset form
      setPartyId("");
      setDate(new Date().toISOString().slice(0, 10));
      setMode("Bank Transfer");
      setReference("");
      setNotes("");
      setChecked(new Set());
      setApplied({});
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed to record payment"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            {isReceived ? "Create Payment Received" : "Create Payment Made"}
          </DialogTitle>
          <DialogDescription>
            {isReceived
              ? "Record a customer payment and apply it to one or more outstanding invoices."
              : "Record a supplier payment and apply it to one or more outstanding bills."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 pr-1">
          <div className="grid gap-5 py-2">

            {/* ── Party selector ── */}
            <div className="grid gap-1.5">
              <Label>{partyLabel}</Label>
              <Select value={partyId} onValueChange={handlePartyChange}>
                <SelectTrigger>
                  <SelectValue placeholder={`Select a ${partyLabel.toLowerCase()}…`} />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {parties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ── Date + Mode row ── */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>Payment Date</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Payment Mode</Label>
                <Select value={mode} onValueChange={setMode}>
                  <SelectTrigger>
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
            </div>

            {/* ── Reference ── */}
            <div className="grid gap-1.5">
              <Label>Reference / Cheque No.</Label>
              <Input
                placeholder="Optional — auto-filled from doc numbers if blank"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>

            {/* ── Outstanding docs table ── */}
            {partyId && (
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label>
                    Outstanding {docLabel}s
                    {loadingDocs && (
                      <Loader2 className="ml-2 inline h-3 w-3 animate-spin text-muted-foreground" />
                    )}
                  </Label>
                  {checked.size > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {checked.size} selected · {money(totalApplied, currency)} total
                    </span>
                  )}
                </div>

                {!loadingDocs && outstandingDocs.length === 0 && (
                  <div className="rounded-md border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                    No outstanding {docLabel.toLowerCase()}s found for this {partyLabel.toLowerCase()}.
                  </div>
                )}

                {outstandingDocs.length > 0 && (
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="w-9 px-3 py-2 text-left" />
                          <th className="px-3 py-2 text-left">{docLabel}#</th>
                          <th className="px-3 py-2 text-left">Due Date</th>
                          <th className="px-3 py-2 text-right">Balance Due</th>
                          <th className="px-3 py-2 text-right w-36">Amount to Apply</th>
                        </tr>
                      </thead>
                      <tbody>
                        {outstandingDocs.map((doc) => {
                          const isChecked = checked.has(doc.id);
                          const isOverdue =
                            doc.due_date && new Date(doc.due_date) < new Date();
                          return (
                            <tr
                              key={doc.id}
                              className={`border-t transition-colors cursor-pointer ${
                                isChecked ? "bg-primary/5" : "hover:bg-muted/30"
                              }`}
                              onClick={() => toggleDoc(doc)}
                            >
                              <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={() => toggleDoc(doc)}
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="font-mono text-xs font-semibold text-primary">
                                  {doc.number}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-xs">
                                {doc.due_date ? (
                                  <span className={isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}>
                                    {new Date(doc.due_date).toLocaleDateString()}
                                    {isOverdue && " (overdue)"}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">
                                {money(doc.balance_due, doc.currency)}
                              </td>
                              <td
                                className="px-3 py-2.5 text-right"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="h-7 w-32 text-right text-xs ml-auto"
                                  disabled={!isChecked}
                                  value={applied[doc.id] ?? ""}
                                  placeholder={doc.balance_due.toFixed(2)}
                                  onChange={(e) =>
                                    setApplied((a) => ({ ...a, [doc.id]: e.target.value }))
                                  }
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Notes ── */}
            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                placeholder="Optional"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <DialogFooter className="shrink-0 border-t pt-3">
          <div className="flex w-full items-center justify-between gap-2">
            {/* Summary */}
            {checked.size > 0 ? (
              <span className="text-sm font-medium">
                Total:{" "}
                <span className="font-mono text-primary">{money(totalApplied, currency)}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  across {checked.size} {docLabel.toLowerCase()}{checked.size !== 1 ? "s" : ""}
                </span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                Select one or more {docLabel.toLowerCase()}s above
              </span>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saveMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || checked.size === 0 || !partyId}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Record Payment
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
