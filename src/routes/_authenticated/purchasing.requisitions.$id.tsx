import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DocViewPanel } from "@/components/doc-view-panel";

export const Route = createFileRoute("/_authenticated/purchasing/requisitions/$id")({
  component: RequisitionDetailPage,
});

function RequisitionDetailPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DocViewPanel
        kind="requisition"
        id={id}
        onClose={() => nav({ to: "/purchasing/requisitions" as any })}
        onSaved={(newId) => nav({ to: "/purchasing/requisitions/$id" as any, params: { id: newId } as any })}
      />
    </div>
  );
}
