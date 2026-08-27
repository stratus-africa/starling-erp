import { createFileRoute } from "@tanstack/react-router";
import { DataModulePage } from "@/components/data-module-page";
import { customerFields } from "@/lib/module-schemas";

export const Route = createFileRoute("/_authenticated/crm/customers/")({
  component: () => (
    <DataModulePage
      title="Customers"
      description="Manage customer accounts, contacts and credit terms."
      table="customers"
      fields={customerFields}
      entityLabel="Customer"
      attachments={false}
      rowHref={(r) => `/crm/customers/${r.id}`}
      createHref="/crm/customers/new"
      filterFields={[
        { key: "status", label: "Status", options: ["Active", "Inactive", "Overdue"] },
        { key: "currency", label: "Currency", options: ["USD", "EUR", "GBP", "KES", "AED", "EGP", "INR", "ZAR"] },
      ]}
    />
  ),
});
