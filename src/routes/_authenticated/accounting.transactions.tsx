import { createFileRoute } from "@tanstack/react-router";
import { AccountingLedgerPage } from "@/components/accounting-ledger-page";

export const Route = createFileRoute("/_authenticated/accounting/transactions")({
  head: () => ({
    meta: [
      { title: "Accounting Ledger | Aurora ERP" },
      {
        name: "description",
        content:
          "Track every invoice, payment, credit, bill, expense and bank transaction with account balances, cash movement and profit.",
      },
      { property: "og:title", content: "Accounting Ledger | Aurora ERP" },
      {
        property: "og:description",
        content: "Invoices, payments, credits and bank transactions with chart of accounts, cash and profit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountingLedgerPage,
});
