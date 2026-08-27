import { createFileRoute } from "@tanstack/react-router";
import { ProductionItemPage } from "@/components/production-item-page";

export const Route = createFileRoute("/_authenticated/manufacturing/items/$id")({
  component: ProductionItemDetailPage,
});

function ProductionItemDetailPage() {
  const { id } = Route.useParams();
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ProductionItemPage id={id} />
    </div>
  );
}
