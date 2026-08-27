import { createFileRoute } from "@tanstack/react-router";
import { PaymentsListPage } from "@/components/payments-list-page";

export const Route = createFileRoute("/_authenticated/purchasing/payments")({
  component: () => <PaymentsListPage kind="made" />,
});
