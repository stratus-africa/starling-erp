import { createFileRoute } from "@tanstack/react-router";
import { SettingsRecordsPage } from "@/components/settings-records-page";

export const Route = createFileRoute("/_authenticated/settings/api-keys")({
  component: () => <SettingsRecordsPage kind="api-keys" />,
});
