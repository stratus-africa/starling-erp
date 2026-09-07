import { createFileRoute } from "@tanstack/react-router";
import { SupplierStatementsReportIndexPage } from "@/components/supplier-statements-report-index-page";

export const Route = createFileRoute("/_authenticated/reports/purchases/supplier-statements")({
  component: SupplierStatementsReportIndexPage,
});
