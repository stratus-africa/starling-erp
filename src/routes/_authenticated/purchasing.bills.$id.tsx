import { createFileRoute } from "@tanstack/react-router";
import { SupplierBillDetailPage } from "@/components/supplier-bill-detail-page";

export const Route = createFileRoute("/_authenticated/purchasing/bills/$id")({ component: () => <SupplierBillDetailPage id={Route.useParams().id} /> });
