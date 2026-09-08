import { createFileRoute } from "@tanstack/react-router";
import { DatabaseReportPage } from "@/components/database-report-page";

const titles: Record<string, string> = {
  production_summary: "Production Summary",
  material_consumption: "Material Consumption",
  material_variance: "Material Variance",
  yield: "Production Yield",
  scrap: "Scrap and Waste",
  production_efficiency: "Production Efficiency",
};

export const Route = createFileRoute("/_authenticated/reports/manufacturing/$report")({
  component: () => {
    const { report } = Route.useParams();
    return <DatabaseReportPage domain="manufacturing" report={report} title={titles[report] ?? "Manufacturing Report"} />;
  },
});