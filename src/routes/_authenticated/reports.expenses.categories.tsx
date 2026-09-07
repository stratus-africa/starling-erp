import { createFileRoute } from "@tanstack/react-router";
import { DatabaseReportPage } from "@/components/database-report-page";
export const Route = createFileRoute("/_authenticated/reports/expenses/categories")({ component: () => <DatabaseReportPage domain="expenses" report="categories" title="Expenses by Category" /> });