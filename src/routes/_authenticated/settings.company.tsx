import { createFileRoute } from "@tanstack/react-router";
import { CompanyProfilePage } from "@/components/company-profile/company-profile-page";

export const Route = createFileRoute("/_authenticated/settings/company")({
  component: CompanyProfilePage,
  head: () => ({
    meta: [
      { title: "Company Profile | AURORA ERP" },
      { name: "description", content: "Manage organization identity, addresses, tax IDs, and document branding." },
      { property: "og:title", content: "Company Profile | AURORA ERP" },
      { property: "og:description", content: "Manage organization identity, addresses, tax IDs, and document branding." },
    ],
  }),
});
