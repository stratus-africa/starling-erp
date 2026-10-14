import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/super-admin/invoices")({
  head: () => ({ meta: [{"title": "Billing Records | Starling Super Admin"}, {"name": "description", "content": "Live invoices records and management for Starling ERP platform administrators."}, {"property": "og:title", "content": "Billing Records | Starling Super Admin"}, {"property": "og:description", "content": "Live invoices records and management for Starling ERP platform administrators."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
  component: () => <Navigate to="/super-admin/billing/subscriptions" replace />,
});
