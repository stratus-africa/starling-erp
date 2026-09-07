import { createFileRoute } from "@tanstack/react-router";
import { ReportsListingPage } from "@/components/reports-listing-page";
import { inventoryReportsConfig } from "@/components/reports-configs";

export const Route = createFileRoute("/_authenticated/reports/inventory")({
  component: () => <ReportsListingPage config={inventoryReportsConfig} />,
});
