import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";
import { ArrowLeft, Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { AccountingAuditTrail } from "@/components/accounting-audit-trail";
import { SupplierPaymentAllocationDialog } from "@/components/supplier-payment-allocation-dialog";
import { PaymentRemainingBadge } from "@/components/payment-remaining-badge";
import { SupplierPaymentTimeline } from "@/components/supplier-payment-timeline";
import { useAuth } from "@/hooks/use-auth";
import { useSupplierPayment, useSupplierPaymentActions, useSupplierPaymentAllocationSummary, useSupplierPaymentAllocations } from "@/hooks/use-supplier-payments";

export function SupplierPaymentDetailPage({ id }: { id: string }) {
  const { can } = useAuth();
  const [allocationOpen, setAllocationOpen] = useState(false);
  const paymentQuery = useSupplierPayment(id);
  const summaryQuery = useSupplierPaymentAllocationSummary(id);
  const allocationQuery = useSupplierPaymentAllocations(id);
  const actions = useSupplierPaymentActions();
  const payment = paymentQuery.data;
  const supplierId = payment?.supplier_id as string | undefined;
  const { data: supplier } = useQuery({ queryKey: ["suppliers", supplierId], enabled: Boolean(supplierId), queryFn: async () => { const { data, error } = await db.from("suppliers").select("id,name").eq("id", supplierId).single(); if (error) throw error; return data as Record<string, any>; } });
  const billIds = useMemo(() => (allocationQuery.data ?? []).map((row) => row.bill_id), [allocationQuery.data]);
  const { data: bills = [] } = useQuery({ queryKey: ["bills", "payment-detail", billIds], enabled: billIds.length > 0, queryFn: async () => { const { data, error } = await db.from("bills").select("id,number,date,due_date").in("id", billIds); if (error) throw error; return (data ?? []) as Record<string, any>[]; } });
  const billMap = Object.fromEntries(bills.map((bill) => [bill.id, bill]));
  if (paymentQuery.isLoading) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!payment) return <div className="p-6 text-sm text-muted-foreground">Payment not found.</div>;
  const currency = payment.currency ?? "KES";
  const allocated = Number(summaryQuery.data?.allocated_amount ?? 0);
  const remaining = Number(summaryQuery.data?.unallocated_amount ?? Number(payment.amount ?? 0) - allocated);
  const posted = Boolean(payment.posted_at) && !payment.voided_at;
  const run = (mutation: { mutate: (value: any, options?: any) => void }, value: any, success: string) => mutation.mutate(value, { onSuccess: () => { toast.success(success); }, onError: (error: Error) => toast.error(error.message || "Operation failed") });
  return <div className="h-full overflow-auto bg-background p-6"><div className="mx-auto max-w-6xl space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Link to="/purchasing/payments"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link><div><div className="text-xs text-muted-foreground">Supplier payment</div><h1 className="text-xl font-semibold">{payment.number ?? id.slice(0, 8)}</h1></div></div><div className="flex gap-2">{!payment.posted_at && !payment.voided_at && can("payments.post") && <Button onClick={() => run(actions.post, id, "Payment posted")} disabled={actions.post.isPending}><Wallet className="mr-2 h-4 w-4" />Post Payment</Button>}{posted && can("payments.allocate") && <Button variant="outline" onClick={() => setAllocationOpen(true)}>Allocate Payment</Button>}{posted && can("payments.void") && <Button variant="destructive" onClick={() => run(actions.voidPayment, { paymentId: id }, "Payment voided")} disabled={actions.voidPayment.isPending}>Void Payment</Button>}</div></div>
    <Tabs defaultValue="overview"><TabsList><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="allocations">Allocations</TabsTrigger><TabsTrigger value="accounting">Accounting</TabsTrigger><TabsTrigger value="attachments">Attachments</TabsTrigger><TabsTrigger value="activity">Activity</TabsTrigger><TabsTrigger value="audit">Audit</TabsTrigger></TabsList>
      <TabsContent value="overview"><Card className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4"><Field label="Supplier" value={supplier?.name ?? "—"} /><Field label="Payment Date" value={payment.date ?? "—"} /><Field label="Payment Method" value={payment.mode ?? "—"} /><Field label="Reference" value={payment.reference ?? "—"} /><Field label="Amount" value={money(payment.amount, currency)} /><Field label="Currency" value={currency} /><Field label="Allocated" value={money(allocated, currency)} /><Field label="Remaining" value={<PaymentRemainingBadge remaining={remaining} currency={currency} />} /><Field label="Status" value={<Badge variant="outline">{payment.voided_at ? "Voided" : payment.posted_at ? "Posted" : "Draft"}</Badge>} /></Card></TabsContent>
      <TabsContent value="allocations"><Card className="p-5"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Payment Allocations</h2><div className="font-mono text-sm">{money(allocated, currency)} allocated / {money(remaining, currency)} remaining</div></div>{allocationQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : allocationQuery.data?.length ? <div className="divide-y">{allocationQuery.data.map((allocation) => <div className="flex items-center justify-between py-3 text-sm" key={allocation.id}><div><Link className="text-primary hover:underline" to="/purchasing/bills/$id" params={{ id: allocation.bill_id }}>{billMap[allocation.bill_id]?.number ?? allocation.bill_id}</Link><div className="text-xs text-muted-foreground">{billMap[allocation.bill_id]?.date ?? "—"} · Due {billMap[allocation.bill_id]?.due_date ?? "—"}</div></div><div className="flex items-center gap-3"><span className="font-mono">{money(allocation.amount, currency)}</span>{can("payments.allocate") && <Button size="sm" variant="ghost" onClick={() => run(allocationQuery.unallocate, allocation.id, "Allocation removed")}>Unallocate</Button>}</div></div>)}</div> : <p className="text-sm text-muted-foreground">No bills allocated.</p>}</Card></TabsContent>
      <TabsContent value="accounting"><AccountingAuditTrail entityType="payment_made" entityId={id} /></TabsContent><TabsContent value="attachments"><AttachmentsPanel entityType="payment_made" entityId={id} /></TabsContent><TabsContent value="activity"><SupplierPaymentTimeline paymentId={id} /></TabsContent><TabsContent value="audit"><AccountingAuditTrail entityType="payment_made" entityId={id} /></TabsContent>
    </Tabs></div><SupplierPaymentAllocationDialog open={allocationOpen} onOpenChange={setAllocationOpen} paymentId={id} supplierId={payment.supplier_id} currency={currency} paymentAmount={Number(payment.amount ?? 0)} allocatedAmount={allocated} /></div>;
}

function Field({ label, value }: { label: string; value: ReactNode }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>; }
function money(value: number | null | undefined, currency: string) { return `${currency} ${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }