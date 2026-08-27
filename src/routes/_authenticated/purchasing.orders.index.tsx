import { createFileRoute } from "@tanstack/react-router";
import { OrdersListPage } from "@/components/orders-list-page";

export const Route = createFileRoute("/_authenticated/purchasing/orders/")({
  component: () => <OrdersListPage kind="purchase" />,
});
