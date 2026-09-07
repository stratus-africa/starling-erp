import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DocViewPanel } from "@/components/doc-view-panel";
import { DocumentViewWindow } from "@/components/document-view-window";
import { QuoteViewPage } from "@/components/quote-view-page";

export const Route = createFileRoute("/_authenticated/sales/quotes/$id")({
  component: QuoteDetailPage,
});

function QuoteDetailPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  return (
    <div className="flex h-[calc(100svh-3.5rem)] min-h-0 w-full flex-col overflow-y-auto overscroll-contain">
      {id === "new" ? (
        <DocViewPanel
          kind="quote"
          id={id}
          onClose={() => nav({ to: "/sales/quotes" as any })}
          onSaved={(newId) => nav({ to: "/sales/quotes/$id" as any, params: { id: newId } as any })}
        />
      ) : (
        <DocumentViewWindow
          kind="quote"
          title="Quotes"
          description="Prepare and send price quotes to customers."
          table="sales_quotes"
          fields={[]}
          searchColumn="number"
          detailId={id}
          renderDetail={() => <QuoteViewPage id={id} />}
        />
      )}
    </div>
  );
}
