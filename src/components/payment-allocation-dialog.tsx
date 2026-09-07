import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePaymentAllocations } from "@/hooks/use-payment-allocations";

type PaymentAllocationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentId: string;
  customerId: string;
  currency: string;
  paymentAmount: number;
  allocatedAmount: number;
};

type InvoiceRow = {
  id: string;
  number: string | null;
  date: string | null;
  due_date: string | null;
  grand_total: number;
  balance_due: number;
  currency: string;
  status: string | null;
};

export function PaymentAllocationDialog({
  open,
  onOpenChange,
  paymentId,
  customerId,
  currency,
  paymentAmount,
  allocatedAmount,
}: PaymentAllocationDialogProps) {
  const { allocate } = usePaymentAllocations();
  const [values, setValues] = useState<Record<string, string>>({});
  const remaining = Math.max(0, paymentAmount - allocatedAmount);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices", "allocatable", customerId, currency],
    enabled: open && !!customerId,
    queryFn: async () => {
      const { data, error } = await db
        .from("invoices")
        .select("id,number,date,due_date,grand_total,balance_due,currency,status")
        .eq("customer_id", customerId)
        .eq("currency", currency)
        .is("deleted_at", null)
        .is("voided_at", null)
        .gt("balance_due", 0)
        .not("status", "in", "(Cancelled,Voided)")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as InvoiceRow[];
    },
  });

  const selected = useMemo(
    () =>
      invoices
        .map((invoice) => ({
          invoice_id: invoice.id,
          amount: Math.round(Number(values[invoice.id] ?? 0) * 100) / 100,
        }))
        .filter((allocation: { amount: number }) => allocation.amount > 0),
    [invoices, values],
  );
  const selectedTotal = selected.reduce(
    (sum: number, row: { amount: number }) => sum + row.amount,
    0,
  );
  const stillUnallocated = Math.max(0, remaining - selectedTotal);

  const submit = () => {
    if (selected.length === 0) return toast.error("Enter at least one allocation amount");
    if (selectedTotal > remaining)
      return toast.error("Selected allocations exceed the available payment amount");
    allocate.mutate(
      { paymentId, allocations: selected },
      {
        onSuccess: () => {
          toast.success("Payment allocated");
          setValues({});
          onOpenChange(false);
        },
        onError: (error: Error) => toast.error(error.message || "Allocation failed"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Allocate Payment
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-4">
            <Summary label="Payment Amount" value={paymentAmount} currency={currency} />
            <Summary label="Already Allocated" value={allocatedAmount} currency={currency} />
            <Summary label="Remaining Available" value={remaining} currency={currency} />
            <Summary label="Still Unallocated" value={stillUnallocated} currency={currency} />
          </div>
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          ) : invoices.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No eligible outstanding invoices.
            </p>
          ) : (
            <div className="max-h-[45vh] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">Invoice</th>
                    <th className="p-2">Date</th>
                    <th className="p-2">Due</th>
                    <th className="p-2 text-right">Total</th>
                    <th className="p-2 text-right">Outstanding</th>
                    <th className="p-2 text-right">Allocate</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr className="border-t" key={invoice.id}>
                      <td className="p-2 font-mono text-xs">{invoice.number ?? "—"}</td>
                      <td className="p-2 text-xs">{invoice.date ?? "—"}</td>
                      <td className="p-2 text-xs">{invoice.due_date ?? "—"}</td>
                      <td className="p-2 text-right font-mono text-xs">
                        {formatMoney(invoice.grand_total, currency)}
                      </td>
                      <td className="p-2 text-right font-mono text-xs">
                        {formatMoney(invoice.balance_due, currency)}
                      </td>
                      <td className="p-2 text-right">
                        <Input
                          className="ml-auto h-8 w-28 text-right"
                          type="number"
                          min="0"
                          step="0.01"
                          max={Math.min(Number(invoice.balance_due), remaining)}
                          value={values[invoice.id] ?? ""}
                          onChange={(event) =>
                            setValues((current) => ({
                              ...current,
                              [invoice.id]: event.target.value,
                            }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={allocate.isPending || selected.length === 0}>
            {allocate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Allocate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Summary({ label, value, currency }: { label: string; value: number; currency: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-mono text-sm font-semibold">{formatMoney(value, currency)}</div>
    </div>
  );
}

function formatMoney(value: number | null | undefined, currency: string) {
  return `${currency} ${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
