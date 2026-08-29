import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DocViewPanel } from "@/components/doc-view-panel";

export const Route = createFileRoute("/_authenticated/purchasing/orders/$id")({
  component: PurchaseOrderDetailPage,
});

function PurchaseOrderDetailPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DocViewPanel
        kind="po"
        id={id}
        onClose={() => nav({ to: "/purchasing/orders" as any })}
        onSaved={(newId) => nav({ to: "/purchasing/orders/$id" as any, params: { id: newId } as any })}
      />
    </div>
  );
}
