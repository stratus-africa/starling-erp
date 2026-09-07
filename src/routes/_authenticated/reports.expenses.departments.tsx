import { createFileRoute } from "@tanstack/react-router";
import { DatabaseReportPage } from "@/components/database-report-page";
export const Route = createFileRoute("/_authenticated/reports/expenses/departments")({ component: () => <DatabaseReportPage domain="expenses" report="departments" title="Expenses by Department" /> });