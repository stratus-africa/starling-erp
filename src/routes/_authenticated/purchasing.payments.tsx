import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { paymentMadeFields } from "@/lib/module-schemas";

export const Route = createFileRoute("/purchasing/payments")({
  component: () => (
    <DataModulePage
      title="Payments Made"
      description="Outgoing payments to suppliers."
      table="payments_made"
      fields={paymentMadeFields}
      entityLabel="Payment"
      attachments={false}
    />
  ),
});
