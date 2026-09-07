import { createFileRoute } from "@tanstack/react-router";
import { PurchaseReceiptsListPage } from "@/components/purchase-receipts-list-page";

export const Route = createFileRoute("/_authenticated/purchases/receipts/")({ component: PurchaseReceiptsListPage });