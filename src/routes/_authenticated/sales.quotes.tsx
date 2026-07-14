import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { salesQuoteFields } from "@/lib/module-schemas";

export const Route = createFileRoute("/sales/quotes")({
  component: () => (
    <DataModulePage
      title="Quotes"
      description="Prepare and send price quotes to customers."
      table="sales_quotes"
      fields={salesQuoteFields}
      entityLabel="Quote"
      attachments={true}
    />
  ),
});
