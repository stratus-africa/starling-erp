import { createFileRoute } from "@tanstack/react-router";
import { DatabaseReportPage } from "@/components/database-report-page";
export const Route = createFileRoute("/_authenticated/reports/purchases/price-variance")({ component: () => <DatabaseReportPage domain="purchases" report="price_variance" title="Purchase Price Variance" /> });