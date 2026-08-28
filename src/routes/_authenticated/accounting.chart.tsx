import { createFileRoute } from "@tanstack/react-router";
import { ChartOfAccountsPage } from "@/components/chart-of-accounts-page";

export const Route = createFileRoute("/_authenticated/accounting/chart")({
  component: ChartOfAccountsPage,
});
