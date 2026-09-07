import { Button } from "@/components/ui/button";
import { BillOutstandingBadge } from "@/components/bill-outstanding-badge";

export function SupplierPaymentAllocationTable({ allocations, bills, currency, canUnallocate, onUnallocate }: { allocations: Record<string, any>[]; bills: Record<string, any>[]; currency: string; canUnallocate: boolean; onUnallocate: (id: string) => void }) {
  const billMap = Object.fromEntries(bills.map((bill) => [bill.id, bill]));
  return <div className="divide-y">{allocations.map((allocation) => { const bill = billMap[allocation.bill_id]; return <div className="flex items-center justify-between py-3 text-sm" key={allocation.id}><div><div className="font-medium">{bill?.number ?? allocation.bill_id}</div><div className="text-xs text-muted-foreground">{bill?.date ?? "—"} · Due {bill?.due_date ?? "—"}</div></div><div className="flex items-center gap-3"><BillOutstandingBadge outstanding={Number(allocation.amount)} currency={currency} />{canUnallocate && <Button size="sm" variant="ghost" onClick={() => onUnallocate(allocation.id)}>Unallocate</Button>}</div></div>; })}</div>;
}