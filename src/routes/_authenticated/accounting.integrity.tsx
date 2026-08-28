import { createFileRoute } from "@tanstack/react-router";
import { AccountingIntegrityPage } from "@/components/accounting-integrity-page";

export const Route = createFileRoute("/_authenticated/accounting/integrity")({
  component: AccountingIntegrityPage,
});
