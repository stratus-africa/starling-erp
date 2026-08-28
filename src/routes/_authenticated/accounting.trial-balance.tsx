import { createFileRoute } from "@tanstack/react-router";
import { TrialBalancePage } from "@/components/trial-balance-page";

export const Route = createFileRoute("/_authenticated/accounting/trial-balance")({
  component: TrialBalancePage,
});
