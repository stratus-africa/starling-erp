import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type NextAction = { message: string; label: string; onClick?: () => void; href?: string };
export type SalesActionState = {
  kind: "quote" | "order" | "invoice" | "payment";
  status?: string | null;
  fulfillmentStatus?: string | null;
  invoiceStatus?: string | null;
  outstanding?: number;
  unallocated?: number;
  currency?: string;
};

function getSalesNextAction(state: SalesActionState): NextAction | null {
  const amount = formatMoney(state.outstanding ?? state.unallocated ?? 0, state.currency ?? "KES");
  if (state.kind === "quote") {
    if (state.status === "Draft")
      return { message: "Complete and send this quote.", label: "Send Quote" };
    if (state.status === "Accepted")
      return { message: "Customer accepted this quote.", label: "Create Sales Order" };
    if (["Sent", "Viewed"].includes(state.status ?? ""))
      return { message: "Waiting for customer response.", label: "Send Reminder" };
  }
  if (state.kind === "order") {
    if (state.status === "Confirmed" && state.fulfillmentStatus === "Not Started")
      return { message: "Order is ready for fulfillment.", label: "Fulfill Order" };
    if (
      state.invoiceStatus !== "Fully Invoiced" &&
      (state.status === "Confirmed" ||
        state.status === "Processing" ||
        state.fulfillmentStatus === "Fulfilled")
    )
      return { message: `${amount} remains uninvoiced.`, label: "Create Invoice" };
  }
  if (state.kind === "invoice" && state.status === "Overdue")
    return { message: `${amount} is overdue.`, label: "Send Reminder" };
  if (state.kind === "invoice" && ["Posted", "Sent"].includes(state.status ?? ""))
    return { message: "Invoice is ready to send.", label: "Send Invoice" };
  if (state.kind === "payment" && (state.unallocated ?? 0) > 0)
    return { message: `${amount} remains unallocated.`, label: "Allocate Payment" };
  return null;
}

export function SalesNextAction({
  state,
  onAction,
  actionContent,
}: {
  state: SalesActionState;
  onAction?: () => void;
  actionContent?: ReactNode;
}) {
  const action = getSalesNextAction(state);
  if (!action) return null;
  return (
    <Card className="border-primary/20 bg-primary/[0.03]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Next Best Action</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{action.message}</p>
        {actionContent ?? (
          <Button size="sm" onClick={onAction}>
            {action.label}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function formatMoney(value: number, currency: string) {
  return `${currency} ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
