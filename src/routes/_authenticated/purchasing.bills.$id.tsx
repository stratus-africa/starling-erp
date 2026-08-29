import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DocViewPanel } from "@/components/doc-view-panel";

export const Route = createFileRoute("/_authenticated/purchasing/bills/$id")({
  component: BillDetailPage,
});

function BillDetailPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DocViewPanel
        kind="bill"
        id={id}
        onClose={() => nav({ to: "/purchasing/bills" as any })}
        onSaved={(newId) => nav({ to: "/purchasing/bills/$id" as any, params: { id: newId } as any })}
      />
    </div>
  );
}
