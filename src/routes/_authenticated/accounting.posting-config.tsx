import { createFileRoute } from "@tanstack/react-router";
import { PostingConfigPage } from "@/components/posting-config-page";

export const Route = createFileRoute("/_authenticated/accounting/posting-config")({
  component: PostingConfigPage,
});
