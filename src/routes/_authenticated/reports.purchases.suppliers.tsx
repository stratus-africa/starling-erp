import { createFileRoute } from "@tanstack/react-router";
import { DatabaseReportPage } from "@/components/database-report-page";
export const Route = createFileRoute("/_authenticated/reports/purchases/suppliers")({ component: () => <DatabaseReportPage domain="purchases" report="suppliers" title="Purchases by Supplier" /> });