import { createFileRoute } from "@tanstack/react-router";
import { GeneralLedgerPage } from "@/components/general-ledger-page";

export const Route = createFileRoute("/_authenticated/accounting/ledger")({
  component: GeneralLedgerPage,
});
