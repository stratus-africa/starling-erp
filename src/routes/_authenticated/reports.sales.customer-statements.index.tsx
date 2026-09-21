import { createFileRoute } from "@tanstack/react-router";
import { CustomerStatementsIndexPage } from "@/components/customer-statements-index-page";

export const Route = createFileRoute("/_authenticated/reports/sales/customer-statements")({
  component: CustomerStatementsIndexPage,
});
