import { createFileRoute } from "@tanstack/react-router";
import { DocumentViewWindow } from "@/components/document-view-window";
import { salesQuoteFields } from "@/lib/module-validation-schemas";

export const Route = createFileRoute("/_authenticated/sales/quotes/")({
  component: () => (
    <DocumentViewWindow
      kind="quote"
      title="Quotes"
      description="Prepare and send price quotes to customers."
      table="sales_quotes"
      fields={salesQuoteFields}
      searchColumn="number"
      filters={[
        { key: "status", label: "Status", options: salesQuoteFields.find((f) => f.key === "status")?.options ?? [] },
        { key: "currency", label: "Currency", options: ["USD", "EUR", "GBP", "KES", "AED", "EGP", "INR", "ZAR"] },
      ]}
    />
  ),
});
