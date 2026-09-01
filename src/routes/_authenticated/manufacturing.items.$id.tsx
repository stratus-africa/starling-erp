import { createFileRoute } from "@tanstack/react-router";
import { Item360Page } from "@/components/item360-page";

export const Route = createFileRoute("/_authenticated/manufacturing/items/$id")({
  component: ManufacturingItemDetailPage,
});

function ManufacturingItemDetailPage() {
  const { id } = Route.useParams();
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Item360Page id={id} backTo="/manufacturing/items" backLabel="Production Items" />
    </div>
  );
}
