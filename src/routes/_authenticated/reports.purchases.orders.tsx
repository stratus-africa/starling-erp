import { createFileRoute } from "@tanstack/react-router";
import { DatabaseReportPage } from "@/components/database-report-page";
export const Route = createFileRoute("/_authenticated/reports/purchases/orders")({ component: () => <DatabaseReportPage domain="purchases" report="orders" title="Purchase Order Register" /> });