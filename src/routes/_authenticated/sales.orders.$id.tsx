import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DocViewPanel } from "@/components/doc-view-panel";

export const Route = createFileRoute("/_authenticated/sales/orders/$id")({
  component: SalesOrderDetailPage,
});

function SalesOrderDetailPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DocViewPanel
        kind="order"
        id={id}
        onClose={() => nav({ to: "/sales/orders" as any })}
        onSaved={(newId) => nav({ to: "/sales/orders/$id" as any, params: { id: newId } as any })}
      />
    </div>
  );
}
