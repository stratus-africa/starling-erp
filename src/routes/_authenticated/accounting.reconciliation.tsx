import { createFileRoute } from "@tanstack/react-router";
import { BankReconciliationPage } from "@/components/bank-reconciliation-page";

export const Route = createFileRoute("/_authenticated/accounting/reconciliation")({
  component: BankReconciliationPage,
});
