import { createFileRoute } from "@tanstack/react-router";
import { CollectionsReportPage } from "@/components/collections-report-page";

export const Route = createFileRoute("/_authenticated/reports/sales/collections")({
  component: CollectionsReportPage,
});
