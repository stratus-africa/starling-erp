import { createFileRoute } from "@tanstack/react-router";
import { DatabaseReportPage } from "@/components/database-report-page";
export const Route = createFileRoute("/_authenticated/reports/purchases/matching")({ component: () => <DatabaseReportPage domain="purchases" report="matching" title="Three-Way Matching" /> });