import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { paymentReceivedFields } from "@/lib/module-schemas";

export const Route = createFileRoute("/sales/payments")({
  component: () => (
    <DataModulePage
      title="Payments Received"
      description="Customer payments across all channels."
      table="payments_received"
      fields={paymentReceivedFields}
      entityLabel="Receipt"
      attachments={false}
    />
  ),
});
