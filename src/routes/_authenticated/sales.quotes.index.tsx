import { createFileRoute } from "@tanstack/react-router";
import { DocumentViewWindow } from "@/components/document-view-window";

export const Route = createFileRoute("/_authenticated/sales/quotes/")({
  component: () => (
    <DocumentViewWindow
      kind="quote"
      title="Quotes"
      description="Prepare and send price quotes to customers."
      table="sales_quotes"
      fields={[]}
      searchColumn="number"
      filters={[
        {
          key: "status",
          label: "Status",
          options: ["Draft", "Sent", "Accepted", "Rejected", "Expired"],
        },
      ]}
    />
  ),
});
