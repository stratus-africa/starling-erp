import { createFileRoute } from "@tanstack/react-router";
import { DatabaseReportPage } from "@/components/database-report-page";
export const Route = createFileRoute("/_authenticated/reports/expenses/employees")({ component: () => <DatabaseReportPage domain="expenses" report="employees" title="Expenses by Employee" /> });