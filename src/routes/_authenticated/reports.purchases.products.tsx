import { createFileRoute } from "@tanstack/react-router";
import { DatabaseReportPage } from "@/components/database-report-page";
export const Route = createFileRoute("/_authenticated/reports/purchases/products")({ component: () => <DatabaseReportPage domain="purchases" report="products" title="Purchases by Product" /> });