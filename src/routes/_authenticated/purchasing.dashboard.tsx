import { createFileRoute } from "@tanstack/react-router";
import { SupplierDashboardPage } from "@/components/supplier-dashboard";

export const Route = createFileRoute("/_authenticated/purchasing/dashboard")({
  component: SupplierDashboardPage,
  head: () => ({
    meta: [
      { title: "Supplier Dashboard | AURORA ERP" },
      {
        name: "description",
        content: "Supplier balances: outstanding bills, purchase orders, payments made and available credits.",
      },
      { property: "og:title", content: "Supplier Dashboard | AURORA ERP" },
      {
        property: "og:description",
        content: "Supplier balances: outstanding bills, purchase orders, payments made and available credits.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
