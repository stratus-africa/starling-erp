import { createFileRoute } from "@tanstack/react-router";
import { FinancialReportsHub } from "@/components/financial-reports-hub";

export const Route = createFileRoute("/_authenticated/reports/financial")({
  component: FinancialReportsHub,
});
