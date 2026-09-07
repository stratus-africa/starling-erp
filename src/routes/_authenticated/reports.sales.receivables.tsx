import { createFileRoute } from "@tanstack/react-router";
import { ArAgingReportPage } from "@/components/ar-aging-report-page";

export const Route = createFileRoute("/_authenticated/reports/sales/receivables")({
  component: ArAgingReportPage,
});
