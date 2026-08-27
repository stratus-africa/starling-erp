import { createFileRoute } from "@tanstack/react-router";
import { DocumentEditor } from "@/components/document-editor";

export const Route = createFileRoute("/_authenticated/purchasing/bills/$id")({
  component: BillDetailPage,
});

function BillDetailPage() {
  const { id } = Route.useParams();
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DocumentEditor kind="bill" id={id} />
    </div>
  );
}
