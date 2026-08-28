import { createFileRoute } from "@tanstack/react-router";
import { TaxReportPage } from "@/components/tax-report-page";

export const Route = createFileRoute("/_authenticated/accounting/tax-report")({
  component: TaxReportPage,
});
