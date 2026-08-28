import { createFileRoute } from "@tanstack/react-router";
import { BankingPage } from "@/components/banking-page";

export const Route = createFileRoute("/_authenticated/accounting/banking")({
  component: BankingPage,
});
