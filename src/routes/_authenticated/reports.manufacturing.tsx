import { createFileRoute } from "@tanstack/react-router";
import { ReportsListingPage } from "@/components/reports-listing-page";
import { manufacturingReportsConfig } from "@/components/reports-configs";

export const Route = createFileRoute("/_authenticated/reports/manufacturing")({
  component: () => <ReportsListingPage config={manufacturingReportsConfig} />,
});
