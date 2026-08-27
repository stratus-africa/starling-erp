import { createFileRoute } from "@tanstack/react-router";
import { OrdersListPage } from "@/components/orders-list-page";

export const Route = createFileRoute("/_authenticated/sales/orders/")({
  component: () => <OrdersListPage kind="sales" />,
});
