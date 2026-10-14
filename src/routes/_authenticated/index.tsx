import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard-page";

export const Route = createFileRoute("/_authenticated/")({ head: () => ({ meta: [{ title: "Executive Dashboard | Starling ERP" }, { name: "description", content: "Workspace revenue, sales, inventory and customer activity in Starling ERP." }, { property: "og:title", content: "Executive Dashboard | Starling ERP" }, { property: "og:description", content: "Workspace revenue, sales, inventory and customer activity in Starling ERP." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: DashboardPage });
