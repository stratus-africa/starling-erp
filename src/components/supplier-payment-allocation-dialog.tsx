import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSupplierPaymentAllocations } from "@/hooks/use-supplier-payments";

export function SupplierPaymentAllocationDialog({ open, onOpenChange, paymentId, supplierId, currency, paymentAmount, allocatedAmount }: {
  open: boolean; onOpenChange: (open: boolean) => void; paymentId: string; supplierId: string; currency: string; paymentAmount: number; allocatedAmount: number;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const { allocate } = useSupplierPaymentAllocations(paymentId);
  const remaining = Math.max(0, paymentAmount - allocatedAmount);
  const { data: bills = [], isLoading } = useQuery({
    queryKey: ["bills", "allocatable", supplierId, currency],
    enabled: open && Boolean(supplierId),
    queryFn: async () => {
      const { data, error } = await db.from("bills").select("id,number,date,due_date,grand_total,currency,status").eq("supplier_id", supplierId).eq("currency", currency).is("deleted_at", null).is("voided_at", null).gt("grand_total", 0).not("status", "in", "(Cancelled,Voided)").order("due_date", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Record<string, any>[];
      const enriched = await Promise.all(rows.map(async (bill) => {
        const result = await db.rpc("get_supplier_bill_payment_summary", { _bill_id: bill.id });
        if (result.error) throw result.error;
        return { ...bill, summary: result.data?.[0] ?? result.data };
      }));
      return enriched.filter((bill) => Number(bill.summary?.outstanding ?? 0) > 0) as Record<string, any>[];
    },
  });
  const selected = useMemo(() => bills.map((bill) => ({ bill_id: bill.id, amount: Math.round(Number(values[bill.id] ?? 0) * 100) / 100 })).filter((row) => row.amount > 0), [bills, values]);
  const selectedTotal = selected.reduce((sum, row) => sum + row.amount, 0);
  const submit = () => {
    if (!selected.length) return toast.error("Enter at least one allocation amount");
    if (selectedTotal > remaining) return toast.error("Allocations exceed the payment remaining balance");
    allocate.mutate({ paymentId, allocations: selected }, { onSuccess: () => { toast.success("Payment allocated"); setValues({}); onOpenChange(false); }, onError: (error: Error) => toast.error(error.message || "Allocation failed") });
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="h-4 w-4" />Allocate Supplier Payment</DialogTitle></DialogHeader>
    <div className="grid grid-cols-3 gap-3 rounded-md border bg-muted/30 p-3 text-sm"><Metric label="Payment Amount" value={paymentAmount} currency={currency} /><Metric label="Allocated" value={allocatedAmount} currency={currency} /><Metric label="Remaining" value={remaining} currency={currency} /></div>
    {isLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : bills.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No eligible supplier bills.</p> : <div className="max-h-[50vh] overflow-auto rounded-md border"><table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="p-2">Bill Number</th><th className="p-2">Bill Date</th><th className="p-2">Due Date</th><th className="p-2 text-right">Bill Total</th><th className="p-2 text-right">Already Paid</th><th className="p-2 text-right">Outstanding</th><th className="p-2 text-right">Amount to Allocate</th></tr></thead><tbody>{bills.map((bill) => <tr className="border-t" key={bill.id}><td className="p-2 font-mono text-xs">{bill.number ?? "—"}</td><td className="p-2 text-xs">{bill.date ?? "—"}</td><td className="p-2 text-xs">{bill.due_date ?? "—"}</td><td className="p-2 text-right font-mono text-xs">{formatMoney(bill.summary?.bill_total, currency)}</td><td className="p-2 text-right font-mono text-xs">{formatMoney(bill.summary?.amount_paid, currency)}</td><td className="p-2 text-right font-mono text-xs">{formatMoney(bill.summary?.outstanding, currency)}</td><td className="p-2 text-right"><Input className="ml-auto h-8 w-28 text-right" type="number" min="0" step="0.01" max={Math.min(Number(bill.summary?.outstanding ?? 0), remaining)} value={values[bill.id] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [bill.id]: event.target.value }))} /></td></tr>)}</tbody></table></div>}
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} disabled={allocate.isPending || !selected.length}>{allocate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Allocate</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function Metric({ label, value, currency }: { label: string; value: number; currency: string }) { return <div><div className="text-[10px] uppercase text-muted-foreground">{label}</div><div className="font-mono text-sm font-semibold">{formatMoney(value, currency)}</div></div>; }
function formatMoney(value: number | null | undefined, currency: string) { return `${currency} ${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }