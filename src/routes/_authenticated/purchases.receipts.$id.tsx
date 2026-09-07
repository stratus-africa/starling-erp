import { createFileRoute } from "@tanstack/react-router";
import { PurchaseReceiptDetailPage } from "@/components/purchase-receipt-detail-page";

export const Route = createFileRoute("/_authenticated/purchases/receipts/$id")({ component: () => <PurchaseReceiptDetailPage id={Route.useParams().id} /> });