import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { db } from "@/lib/typed-db";
import { toast } from "sonner";
import { ArrowLeft, FileText, Loader2, Printer, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { AccountingAuditTrail } from "@/components/accounting-audit-trail";
import { BusinessEventTimeline } from "@/components/business-event-timeline";
import { PaymentAllocationDialog } from "@/components/payment-allocation-dialog";
import { useAuth } from "@/hooks/use-auth";
import { usePaymentAllocations } from "@/hooks/use-payment-allocations";
import { SalesDocumentLineage } from "@/components/sales-document-lineage";
import { SalesNextAction } from "@/components/sales-next-action";
import { AllocationSummary } from "@/components/payment-allocation-summary";

type PaymentRow = {
  id: string;
  number: string | null;
  customer_id: string;
  amount: number | null;
  currency: string | null;
  date: string | null;
  mode: string | null;
  reference: string | null;
  posted_at: string | null;
  voided_at: string | null;
};
type CustomerRow = { id: string; name: string; currency: string | null };
type AllocationRow = {
  id: string;
  invoice_id: string;
  amount: number;
  allocation_date: string;
  created_at: string;
  deleted_at: string | null;
};
type AllocationSummary = {
  allocated_amount: number;
  unallocated_amount: number;
  allocation_status: string;
};

export function PaymentDetailPage({ id }: { id: string }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { unallocate } = usePaymentAllocations();
  const { data: payment, isLoading } = useQuery({
    queryKey: ["payments_received", id],
    queryFn: async () => {
      const { data, error } = await db
        .from("payments_received")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return data as PaymentRow;
    },
  });
  const { data: customer } = useQuery({
    queryKey: ["customers", payment?.customer_id],
    enabled: !!payment?.customer_id,
    queryFn: async () => {
      const { data, error } = await db
        .from("customers")
        .select("id,name,currency")
        .eq("id", payment.customer_id)
        .single();
      if (error) throw error;
      return data as CustomerRow;
    },
  });
  const { data: summary } = useQuery({
    queryKey: ["payments_received", id, "allocation-summary"],
    enabled: !!payment,
    queryFn: async () => {
      const { data, error } = await db.rpc("get_payment_allocation_summary", {
        _payment_id: id,
      });
      if (error) throw error;
      return (data?.[0] ?? data) as AllocationSummary;
    },
  });
  const { data: allocations = [], isLoading: allocationsLoading } = useQuery({
    queryKey: ["payment_allocations", id],
    enabled: !!payment,
    queryFn: async () => {
      const { data, error } = await db
        .from("payment_allocations")
        .select("id,invoice_id,amount,allocation_date,created_at,deleted_at")
        .eq("payment_id", id)
        .is("deleted_at", null)
        .order("allocation_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AllocationRow[];
    },
  });
  const post = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("post_payment_received", { _payment_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment posted");
      queryClient.invalidateQueries({ queryKey: ["payments_received", id] });
      queryClient.invalidateQueries({ queryKey: ["payments_received"] });
    },
    onError: (error: Error) => toast.error(error.message || "Posting failed"),
  });
  const voidPayment = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("void_posted_document", {
        _entity_type: "payment_received",
        _entity_id: id,
        _permission: "payments.void",
        _reason: "Payment voided",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment voided");
      queryClient.invalidateQueries({ queryKey: ["payments_received", id] });
      queryClient.invalidateQueries({ queryKey: ["payments_received"] });
    },
    onError: (error: Error) => toast.error(error.message || "Void failed"),
  });
  const deletePayment = useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from("payments_received")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment deleted");
      queryClient.invalidateQueries({ queryKey: ["payments_received"] });
      window.location.assign("/sales/payments");
    },
    onError: (error: Error) => toast.error(error.message || "Delete failed"),
  });

  if (isLoading)
    return (
      <div className="p-6">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  if (!payment) return <div className="p-6 text-sm text-muted-foreground">Payment not found.</div>;

  const currency = payment.currency ?? customer?.currency ?? "USD";
  const allocatedAmount = Number(summary?.allocated_amount ?? 0);
  const unallocatedAmount = Number(
    summary?.unallocated_amount ?? Number(payment.amount ?? 0) - allocatedAmount,
  );
  const isDraft = !payment.posted_at && !payment.voided_at;

  return (
    <div className="h-full overflow-auto bg-background p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/sales/payments">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <div className="text-xs text-muted-foreground">Payment received</div>
              <h1 className="text-xl font-semibold">{payment.number ?? id.slice(0, 8)}</h1>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print / PDF
            </Button>
            {isDraft && can("payments.post") && (
              <Button size="sm" onClick={() => post.mutate()} disabled={post.isPending}>
                <Wallet className="mr-2 h-4 w-4" />
                Post Payment
              </Button>
            )}
            {payment.posted_at && !payment.voided_at && can("payments.update") && (
              <Button size="sm" onClick={() => setAllocationOpen(true)}>
                <Wallet className="mr-2 h-4 w-4" />
                Allocate Payment
              </Button>
            )}
            {payment.posted_at && !payment.voided_at && can("payments.void") && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => voidPayment.mutate()}
                disabled={voidPayment.isPending}
              >
                Void Payment
              </Button>
            )}
            {!payment.voided_at && can("payments.delete") && (
              <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Payment
              </Button>
            )}
          </div>
        </div>
        <Card className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Customer" value={customer?.name ?? "—"} />
          <Field label="Date" value={payment.date ?? "—"} />
          <Field label="Payment method" value={payment.mode ?? "—"} />
          <Field label="Reference" value={payment.reference ?? "—"} />
          <Field label="Amount" value={formatMoney(payment.amount, currency)} />
          <Field label="Allocated" value={formatMoney(allocatedAmount, currency)} />
          <Field label="Unallocated" value={formatMoney(unallocatedAmount, currency)} />
          <Field
            label="Allocation status"
            value={<Badge variant="outline">{summary?.allocation_status ?? "Unallocated"}</Badge>}
          />
        </Card>
        <SalesNextAction
          state={{
            kind: "payment",
            status: payment.posted_at ? "Posted" : "Draft",
            unallocated: unallocatedAmount,
            currency,
          }}
          onAction={() => setAllocationOpen(true)}
        />
        <AllocationSummary
          amount={Number(payment.amount ?? 0)}
          allocated={allocatedAmount}
          unallocated={unallocatedAmount}
          currency={currency}
          status={summary?.allocation_status}
        />
        <SalesDocumentLineage
          nodes={[
            {
              type: "Payment",
              number: payment.number,
              status: payment.posted_at ? "Posted" : "Draft",
              amount: payment.amount,
              currency,
              date: payment.date,
              href: `/sales/payments/${id}`,
            },
            ...allocations.map((allocation) => ({
              type: "Invoice",
              number: allocation.invoice_id,
              status: "Allocated",
              amount: allocation.amount,
              currency,
              date: allocation.allocation_date,
              href: `/sales/invoices/${allocation.invoice_id}`,
            })),
          ]}
        />
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4" />
            Related invoices
          </h2>
          {allocationsLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : allocations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices allocated.</p>
          ) : (
            <div className="divide-y">
              {allocations.map((allocation) => (
                <div className="flex items-center justify-between py-3 text-sm" key={allocation.id}>
                  <Link
                    className="text-primary hover:underline"
                    to="/sales/invoices/$id"
                    params={{ id: allocation.invoice_id }}
                  >
                    {allocation.invoice_id}
                  </Link>
                  <span className="font-mono">{formatMoney(allocation.amount, currency)}</span>
                  {can("payments.update") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        unallocate.mutate(allocation.id, {
                          onSuccess: () => toast.success("Allocation removed"),
                          onError: (error: Error) =>
                            toast.error(error.message || "Unallocation failed"),
                        })
                      }
                    >
                      Unallocate
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
        <div className="grid gap-5 lg:grid-cols-2">
          <AttachmentsPanel entityType="payment_received" entityId={id} />
          <BusinessEventTimeline entityType="payment_received" entityId={id} />
        </div>
        <AccountingAuditTrail entityType="payment_received" entityId={id} />
        <PaymentAllocationDialog
          open={allocationOpen}
          onOpenChange={setAllocationOpen}
          paymentId={id}
          customerId={payment.customer_id}
          currency={currency}
          paymentAmount={Number(payment.amount ?? 0)}
          allocatedAmount={allocatedAmount}
        />
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete payment?</AlertDialogTitle>
              <AlertDialogDescription>
                A payment reconciled in the bank must be unreconciled before it can be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground"
                onClick={() => deletePayment.mutate()}
                disabled={deletePayment.isPending}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
function formatMoney(value: number | null | undefined, currency: string) {
  return `${currency} ${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
