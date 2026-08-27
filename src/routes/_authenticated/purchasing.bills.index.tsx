import { createFileRoute } from "@tanstack/react-router";
import { InvoicesListPage } from "@/components/invoices-list-page";

export const Route = createFileRoute("/_authenticated/purchasing/bills/")({
  component: () => <InvoicesListPage kind="bill" />,
});
