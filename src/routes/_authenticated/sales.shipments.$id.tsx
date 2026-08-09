import { createFileRoute } from "@tanstack/react-router";
import { RecordEditor } from "@/components/record-editor";
import { shipmentFields } from "@/lib/module-schemas";

export const Route = createFileRoute("/_authenticated/sales/shipments/$id")({
  component: () => {
    const { id } = Route.useParams();
    return (
      <RecordEditor
        id={id}
        table="shipments"
        fields={shipmentFields}
        entityLabel="Shipment"
        listHref="/sales/shipments"
        titleKey="number"
      />
    );
  },
});
