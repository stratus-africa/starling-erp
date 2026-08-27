import { createFileRoute } from "@tanstack/react-router";
import { InvoicesListPage } from "@/components/invoices-list-page";

export const Route = createFileRoute("/_authenticated/sales/invoices/")({
  component: () => <InvoicesListPage kind="invoice" />,
});
