import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { paymentReceivedFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/sales/payments")({
  component: () => (
    <DataModulePage
      title="Payments Received"
      description="Customer payments across all channels."
      table="payments_received"
      fields={paymentReceivedFields}
      entityLabel="Receipt"
      attachments={false}
      voidAction={{ entityType: "payment_received", permission: "payments.void" }}
    />
  ),
});
