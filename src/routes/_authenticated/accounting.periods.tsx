import { createFileRoute } from "@tanstack/react-router";
import { AccountingPeriodsPage } from "@/components/accounting-periods-page";

export const Route = createFileRoute("/_authenticated/accounting/periods")({
  component: AccountingPeriodsPage,
});
