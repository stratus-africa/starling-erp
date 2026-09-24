import { createFileRoute } from "@tanstack/react-router";
import { FieldHeader } from "@/components/field/field-ui";
import { FieldSalesDashboard } from "@/components/field/field-sales-dashboard";

export const Route = createFileRoute("/_authenticated/field/dashboard")({
  head: () => ({ meta: [{ title: "Performance — Field Sales" }] }),
  component: () => (
    <div>
      <FieldHeader title="My performance" back="/field" />
      <FieldSalesDashboard compact />
    </div>
  ),
});
