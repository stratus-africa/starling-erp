import { createFileRoute } from "@tanstack/react-router";
import { SupplierPaymentDetailPage } from "@/components/supplier-payment-detail-page";

export const Route = createFileRoute("/_authenticated/purchases/payments/$id")({
  component: () => <SupplierPaymentDetailPage id={Route.useParams().id} />,
});