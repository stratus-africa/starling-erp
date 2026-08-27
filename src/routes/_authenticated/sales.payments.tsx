import { createFileRoute } from "@tanstack/react-router";
import { PaymentsListPage } from "@/components/payments-list-page";

export const Route = createFileRoute("/_authenticated/sales/payments")({
  component: () => <PaymentsListPage kind="received" />,
});
