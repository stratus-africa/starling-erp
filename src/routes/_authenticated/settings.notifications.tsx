import { createFileRoute } from "@tanstack/react-router";
import { SettingsRecordsPage } from "@/components/settings-records-page";

export const Route = createFileRoute("/_authenticated/settings/notifications")({
  component: () => <SettingsRecordsPage kind="notifications" />,
});
