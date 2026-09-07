import { createFileRoute } from "@tanstack/react-router";
import { DatabaseReportPage } from "@/components/database-report-page";
export const Route = createFileRoute("/_authenticated/reports/purchases/commitments")({ component: () => <DatabaseReportPage domain="purchases" report="commitments" title="Purchase Commitments" /> });