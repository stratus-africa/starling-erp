import { createFileRoute } from "@tanstack/react-router";
import { SettingsHubPage } from "@/components/settings-hub-page";

export const Route = createFileRoute("/_authenticated/settings/")({
  component: SettingsHubPage,
});
