import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DocViewPanel } from "@/components/doc-view-panel";

export const Route = createFileRoute("/_authenticated/sales/credit-notes/$id")({
  component: CreditNoteDetailPage,
});

function CreditNoteDetailPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DocViewPanel
        kind="credit_note"
        id={id}
        onClose={() => nav({ to: "/sales/credit-notes" as any })}
        onSaved={(newId) => nav({ to: "/sales/credit-notes/$id" as any, params: { id: newId } as any })}
      />
    </div>
  );
}
