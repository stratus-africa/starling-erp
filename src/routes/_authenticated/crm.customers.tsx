import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { customerFields } from "@/lib/module-schemas";

export const Route = createFileRoute("/crm/customers")({
  component: () => (
    <DataModulePage
      title="Customers"
      description="Manage customer accounts, contacts and credit terms."
      table="customers"
      fields={customerFields}
      entityLabel="Customer"
      attachments={false}
    />
  ),
});
