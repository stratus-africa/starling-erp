import { createFileRoute } from "@tanstack/react-router";
import { BalanceSheetPage } from "@/components/balance-sheet-page";

export const Route = createFileRoute("/_authenticated/accounting/balance-sheet")({
  component: BalanceSheetPage,
});
