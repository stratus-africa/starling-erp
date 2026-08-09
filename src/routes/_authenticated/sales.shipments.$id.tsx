import { createFileRoute } from "@tanstack/react-router";
import { ShipmentEditor } from "@/components/shipment-editor";

export const Route = createFileRoute("/_authenticated/sales/shipments/$id")({
  component: () => {
    const { id } = Route.useParams();
    return <ShipmentEditor id={id} />;
  },
});
