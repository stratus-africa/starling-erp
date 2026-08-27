import { createFileRoute } from "@tanstack/react-router";
import { DocumentEditor } from "@/components/document-editor";

export const Route = createFileRoute("/_authenticated/sales/quotes/$id")({
  component: QuoteDetailPage,
});

function QuoteDetailPage() {
  const { id } = Route.useParams();
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DocumentEditor kind="quote" id={id} />
    </div>
  );
}
