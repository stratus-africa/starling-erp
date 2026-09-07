import { createFileRoute } from "@tanstack/react-router";
import { DatabaseReportPage } from "@/components/database-report-page";
export const Route = createFileRoute("/_authenticated/reports/purchases/supplier-statements/$supplierId")({ component: () => <DatabaseReportPage domain="purchases" report="supplier_statement" title="Supplier Statement" supplierId={Route.useParams().supplierId} /> });