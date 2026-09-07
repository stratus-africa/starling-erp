import { createFileRoute } from "@tanstack/react-router";
import { SalesDimensionReportPage } from "@/components/sales-dimension-report-page";
export const Route = createFileRoute("/_authenticated/reports/sales/customers")({
  component: () => <SalesDimensionReportPage kind="customers" />,
});
