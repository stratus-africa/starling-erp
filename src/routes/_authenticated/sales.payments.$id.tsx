import { createFileRoute } from "@tanstack/react-router";
import { PaymentDetailPage } from "@/components/payment-detail-page";

export const Route = createFileRoute("/_authenticated/sales/payments/$id")({
  component: PaymentDetailRoute,
});

function PaymentDetailRoute() {
  const { id } = Route.useParams();
  return <PaymentDetailPage id={id} />;
}
