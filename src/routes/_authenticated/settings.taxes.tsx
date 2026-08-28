import { createFileRoute } from "@tanstack/react-router";
import { TaxSettingsPage } from "@/components/tax-settings-page";

export const Route = createFileRoute("/_authenticated/settings/taxes")({
  component: TaxSettingsPage,
});
