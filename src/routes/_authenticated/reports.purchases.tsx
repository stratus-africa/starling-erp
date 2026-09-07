import { createFileRoute } from "@tanstack/react-router";
import { DatabaseReportPage } from "@/components/database-report-page";

export const Route = createFileRoute("/_authenticated/reports/purchases")({
  component: () => <DatabaseReportPage domain="purchases" report="summary" title="Purchase Summary" />,
});
