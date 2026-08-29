import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DocViewPanel } from "@/components/doc-view-panel";

export const Route = createFileRoute("/_authenticated/sales/quotes/$id")({
  component: QuoteDetailPage,
});

function QuoteDetailPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DocViewPanel
        kind="quote"
        id={id}
        onClose={() => nav({ to: "/sales/quotes" as any })}
        onSaved={(newId) => nav({ to: "/sales/quotes/$id" as any, params: { id: newId } as any })}
      />
    </div>
  );
}
