import { createFileRoute } from "@tanstack/react-router";
import { DatabaseReportPage } from "@/components/database-report-page";
export const Route = createFileRoute("/_authenticated/reports/purchases/receiving")({ component: () => <DatabaseReportPage domain="purchases" report="receiving" title="Receiving Report" /> });