import { createFileRoute } from "@tanstack/react-router";
import { SupplierBillListPage } from "@/components/supplier-bill-list-page";

export const Route = createFileRoute("/_authenticated/purchasing/bills/")({
  component: SupplierBillListPage,
});
