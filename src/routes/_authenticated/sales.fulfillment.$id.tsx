import { createFileRoute } from "@tanstack/react-router";
import { FulfillmentWorkspacePage } from "@/components/fulfillment-workspace-page";

export const Route = createFileRoute("/_authenticated/sales/fulfillment/$id")({ component: FulfillmentWorkspacePage });