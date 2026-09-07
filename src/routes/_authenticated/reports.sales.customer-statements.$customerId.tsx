import { createFileRoute } from "@tanstack/react-router";
import { CustomerStatementReportPage } from "@/components/customer-statement-report-page";

export const Route = createFileRoute(
  "/_authenticated/reports/sales/customer-statements/$customerId",
)({
  component: CustomerStatementRoute,
});

function CustomerStatementRoute() {
  const { customerId } = Route.useParams();
  return <CustomerStatementReportPage customerId={customerId} />;
}
