import { createFileRoute } from "@tanstack/react-router";
import { PurchasesDashboardPage } from "@/components/purchases-dashboard-page";

export const Route = createFileRoute("/_authenticated/dashboards/purchases")({ component: PurchasesDashboardPage });