import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { DocViewPanel } from "@/components/doc-view-panel";

export const Route = createFileRoute("/_authenticated/purchasing/credits/$id")({
  component: SupplierCreditDetailPage,
});

function SupplierCreditDetailPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DocViewPanel
        kind="supplier_credit"
        id={id}
        onClose={() => nav({ to: "/purchasing/credits" as any })}
        onSaved={(newId) => nav({ to: "/purchasing/credits/$id" as any, params: { id: newId } as any })}
      />
    </div>
  );
}
