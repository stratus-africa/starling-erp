import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { invoiceFields } from "@/lib/module-schemas";

export const Route = createFileRoute("/sales/invoices")({
  component: () => (
    <DataModulePage
      title="Invoices"
      description="Customer invoices, taxes, and payment status."
      table="invoices"
      fields={invoiceFields}
      entityLabel="Invoice"
      attachments={true}
    />
  ),
});
