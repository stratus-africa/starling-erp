import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_admin/")({
  beforeLoad: () => { throw redirect({ to: "/admin/tenants" }); },
});
