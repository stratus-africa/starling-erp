import { createFileRoute } from "@tanstack/react-router";
import { ReportsListingPage } from "@/components/reports-listing-page";
import { purchasesReportsConfig } from "@/components/reports-configs";

export const Route = createFileRoute("/_authenticated/reports/purchases")({
  component: () => <ReportsListingPage config={purchasesReportsConfig} />,
});
