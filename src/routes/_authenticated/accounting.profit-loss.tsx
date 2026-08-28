import { createFileRoute } from "@tanstack/react-router";
import { ProfitLossPage } from "@/components/profit-loss-page";

export const Route = createFileRoute("/_authenticated/accounting/profit-loss")({
  component: ProfitLossPage,
});
