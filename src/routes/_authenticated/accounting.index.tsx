import { createFileRoute } from "@tanstack/react-router";
import { AccountingDashboard } from "@/components/accounting-dashboard";

export const Route = createFileRoute("/_authenticated/accounting/")({
  component: AccountingDashboard,
});
