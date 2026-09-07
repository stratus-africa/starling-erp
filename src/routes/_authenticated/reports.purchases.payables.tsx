import { createFileRoute } from "@tanstack/react-router";
import { DatabaseReportPage } from "@/components/database-report-page";
export const Route = createFileRoute("/_authenticated/reports/purchases/payables")({ component: () => <DatabaseReportPage domain="purchases" report="payables" title="Accounts Payable Aging" /> });