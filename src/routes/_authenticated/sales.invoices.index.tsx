import { createFileRoute } from "@tanstack/react-router";
import { DocumentViewWindow } from "@/components/document-view-window";

export const Route = createFileRoute("/_authenticated/sales/invoices/")({
  component: () => (
    <DocumentViewWindow
      kind="invoice"
      title="Invoices"
      description="Customer invoices, payments and outstanding balances."
      table="invoices"
      fields={[]}
      searchColumn="number"
      filters={[
        {
          key: "status",
          label: "Status",
          options: ["Draft", "Sent", "Posted", "Paid", "Overdue", "Cancelled"],
        },
      ]}
    />
  ),
});
