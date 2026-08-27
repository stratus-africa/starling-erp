import { createFileRoute } from "@tanstack/react-router";
import { PackagesListPage } from "@/components/packages-list-page";

export const Route = createFileRoute("/_authenticated/sales/packages/")({
  component: PackagesListPage,
});
