import { createFileRoute } from "@tanstack/react-router";
import { ReportsListingPage } from "@/components/reports-listing-page";
import { salesReportsConfig } from "@/components/reports-configs";

export const Route = createFileRoute("/_authenticated/reports/sales")({
  component: () => <ReportsListingPage config={salesReportsConfig} />,
});
