import { createFileRoute } from "@tanstack/react-router";
import { DatabaseReportPage } from "@/components/database-report-page";
export const Route = createFileRoute("/_authenticated/reports/expenses/reimbursements")({ component: () => <DatabaseReportPage domain="expenses" report="reimbursements" title="Employee Reimbursements" /> });