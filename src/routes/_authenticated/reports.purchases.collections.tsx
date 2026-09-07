import { createFileRoute } from "@tanstack/react-router";
import { DatabaseReportPage } from "@/components/database-report-page";
export const Route = createFileRoute("/_authenticated/reports/purchases/collections")({ component: () => <DatabaseReportPage domain="purchases" report="collections" title="Supplier Payment Collections" /> });