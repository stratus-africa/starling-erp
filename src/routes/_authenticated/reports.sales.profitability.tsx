import { createFileRoute } from "@tanstack/react-router";
import { SalesDimensionReportPage } from "@/components/sales-dimension-report-page";
export const Route = createFileRoute("/_authenticated/reports/sales/profitability")({
  component: () => <SalesDimensionReportPage kind="profitability" />,
});
