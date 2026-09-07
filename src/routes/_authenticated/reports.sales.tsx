import { createFileRoute } from "@tanstack/react-router";
import { SalesOverviewReportPage } from "@/components/sales-overview-report-page";

export const Route = createFileRoute("/_authenticated/reports/sales")({
  component: SalesOverviewReportPage,
});
