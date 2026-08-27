import { createFileRoute } from "@tanstack/react-router";
import { DocumentViewWindow } from "@/components/document-view-window";
import { invoiceFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/sales/invoices/")({
  component: () => (
    <DocumentViewWindow
      kind="invoice"
      title="Invoices"
      description="Customer invoices, taxes, and payment status."
      table="invoices"
      fields={invoiceFields}
      searchColumn="number"
      filters={[
        { key: "status", label: "Status", options: invoiceFields.find((f) => f.key === "status")?.options ?? [] },
        { key: "currency", label: "Currency", options: ["USD", "EUR", "GBP", "KES", "AED", "EGP", "INR", "ZAR"] },
      ]}
    />
  ),
});
